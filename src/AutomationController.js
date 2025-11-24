export class AutomationController {
    constructor(container) {
        this.container = container;
        this.canvas = document.createElement('canvas');
        this.container.appendChild(this.canvas);
        this.ctx = this.canvas.getContext('2d');

        // Resize observer to handle container resizing
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(this.container);

        // State
        this.points = [
            { x: 0, y: 0.5 }, // Start at 0 (center)
            { x: 1, y: 0.5 }  // End at 0 (center)
        ];
        this.activePointIndex = -1;
        this.hoverPointIndex = -1;
        this.smoothing = 0; // 0 to 1
        this.playhead = -1; // 0 to 1, -1 to hide

        // Interaction state
        this.isDragging = false;

        this.setupEvents();
        this.resize();
    }

    resize() {
        const rect = this.container.getBoundingClientRect();
        this.width = rect.width;
        this.height = rect.height;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.render();
    }

    setupEvents() {
        this.canvas.addEventListener('mousedown', (e) => this.onMouseDown(e));
        this.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
        window.addEventListener('mouseup', (e) => this.onMouseUp(e));
        this.canvas.addEventListener('dblclick', (e) => this.onDoubleClick(e));
    }

    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left) / this.width,
            y: (e.clientY - rect.top) / this.height
        };
    }

    onMouseDown(e) {
        const pos = this.getMousePos(e);
        const index = this.findPoint(pos);

        if (index !== -1) {
            this.activePointIndex = index;
            this.isDragging = true;
        } else {
            // Add new point
            const newPoint = { x: Math.max(0, Math.min(1, pos.x)), y: Math.max(0, Math.min(1, pos.y)) };
            this.points.push(newPoint);
            this.sortPoints();
            this.activePointIndex = this.points.indexOf(newPoint);
            this.isDragging = true;
        }
        this.render();
    }

    onMouseMove(e) {
        const pos = this.getMousePos(e);

        if (this.isDragging && this.activePointIndex !== -1) {
            // Update point position
            // Start and end points have fixed X
            if (this.activePointIndex === 0) {
                this.points[0].y = Math.max(0, Math.min(1, pos.y));
            } else if (this.activePointIndex === this.points.length - 1) {
                this.points[this.points.length - 1].y = Math.max(0, Math.min(1, pos.y));
            } else {
                const p = this.points[this.activePointIndex];
                p.x = Math.max(0, Math.min(1, pos.x));
                p.y = Math.max(0, Math.min(1, pos.y));
                this.sortPoints();
                this.activePointIndex = this.points.indexOf(p);
            }
        } else {
            this.hoverPointIndex = this.findPoint(pos);
            this.canvas.style.cursor = this.hoverPointIndex !== -1 ? 'pointer' : 'default';
        }

        this.render();
    }

    onMouseUp(e) {
        this.isDragging = false;
        this.activePointIndex = -1;
    }

    onDoubleClick(e) {
        const pos = this.getMousePos(e);
        const index = this.findPoint(pos);

        if (index !== -1) {
            // Remove point if it's not start or end
            if (index > 0 && index < this.points.length - 1) {
                this.points.splice(index, 1);
                this.activePointIndex = -1;
            }
        }
        this.render();
    }

    findPoint(pos, radius = 10) {
        // Radius in pixels
        const rX = radius / this.width;
        const rY = radius / this.height;

        // Search in reverse to select top-most if overlap
        for (let i = this.points.length - 1; i >= 0; i--) {
            const p = this.points[i];
            if (Math.abs(p.x - pos.x) < rX && Math.abs(p.y - pos.y) < rY) {
                return i;
            }
        }
        return -1;
    }

    sortPoints() {
        // Keep start and end fixed in array, but sort middle?
        // Actually, for a functional curve, X must be increasing.
        // We generally want to sort by X.
        // However, we must ensure point 0 is at x=0 and last point is at x=1.

        // Let's just sort all by x.
        this.points.sort((a, b) => a.x - b.x);

        // Ensure bounds
        if (this.points[0].x !== 0) this.points[0].x = 0;
        if (this.points[this.points.length - 1].x !== 1) this.points[this.points.length - 1].x = 1;
    }

    getYAt(t) {
        // t is 0 to 1
        if (this.points.length < 2) return 0.5; // Default center

        // Clamp t
        t = Math.max(0, Math.min(1, t));

        let p0 = this.points[0];
        let p1 = this.points[1];

        for (let i = 0; i < this.points.length - 1; i++) {
            if (t >= this.points[i].x && t <= this.points[i+1].x) {
                p0 = this.points[i];
                p1 = this.points[i+1];
                break;
            }
        }

        const range = p1.x - p0.x;
        if (range === 0) return p0.y;

        const localT = (t - p0.x) / range;
        return p0.y + (p1.y - p0.y) * localT;
    }

    getValueAt(t) {
        const y = this.getYAt(t);
        return this.mapY(y);
    }

    mapY(normalizedY) {
        // Y is 0 (top) to 1 (bottom) in canvas coords
        // We want 0.5 to be 0 degrees
        // 0 to be 100% (360 degrees) or -100%?
        // Usually automation: top is max value.
        // Let's say top (0) = 360 degrees (100%)
        // Bottom (1) = -360 degrees (-100%)
        // Middle (0.5) = 0 degrees

        // value = (0.5 - y) * 2 * 360
        // y=0 => 0.5 * 2 * 360 = 360
        // y=0.5 => 0 * 360 = 0
        // y=1 => -0.5 * 2 * 360 = -360

        return (0.5 - normalizedY) * 2 * 360;
    }

    setPlayhead(t) {
        this.playhead = t;
        this.render();
    }

    render() {
        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;

        // Clear
        ctx.clearRect(0, 0, w, h);

        // Background
        ctx.fillStyle = '#222';
        ctx.fillRect(0, 0, w, h);

        // Grid lines
        ctx.strokeStyle = '#444';
        ctx.lineWidth = 1;

        // Center line (0 degrees)
        ctx.beginPath();
        ctx.moveTo(0, h / 2);
        ctx.lineTo(w, h / 2);
        ctx.stroke();

        // Draw curve (Raw)
        ctx.strokeStyle = '#00ffcc';
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(this.points[0].x * w, this.points[0].y * h);
        for (let i = 1; i < this.points.length; i++) {
            ctx.lineTo(this.points[i].x * w, this.points[i].y * h);
        }
        ctx.stroke();

        // Draw smoothed curve (Simulated)
        if (this.smoothing > 0) {
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.setLineDash([5, 5]); // Dashed line to distinguish
            ctx.beginPath();

            // Simulation parameters
            // We simulate the lag effect. The 'smoothing' factor in viewer.html acts per frame.
            // To visualize this spatially, we need to approximate the step size.
            // Assuming the graph width represents the total time, and we iterate pixel by pixel.
            // A higher smoothing value means more inertia.

            const steps = w; // One step per pixel

            // We need to work in Y-space (canvas coordinates) for drawing
            let currentY = this.points[0].y; // Start exactly at first point

            // Adjust alpha for visualization to be somewhat representative
            const alpha = (1 - this.smoothing);

            ctx.moveTo(0, currentY * h);

            for (let i = 1; i < steps; i++) {
                const t = i / steps;
                const targetY = this.getYAt(t);

                // Exponential Moving Average
                currentY += (targetY - currentY) * alpha;

                ctx.lineTo(i, currentY * h);
            }
            ctx.stroke();
            ctx.setLineDash([]); // Reset
        }

        // Draw points
        for (let i = 0; i < this.points.length; i++) {
            const p = this.points[i];
            ctx.fillStyle = (i === this.hoverPointIndex || i === this.activePointIndex) ? '#fff' : '#00ffcc';
            ctx.beginPath();
            ctx.arc(p.x * w, p.y * h, 4, 0, Math.PI * 2);
            ctx.fill();
        }

        // Draw playhead
        if (this.playhead >= 100) { // Bug in previous file? No wait. t is 0 to 1. 100 is wrong.
             // Wait, the logic was playhead >= 0 && playhead <= 1.
        }

        if (this.playhead >= 0 && this.playhead <= 1) {
            ctx.strokeStyle = '#ff3333';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(this.playhead * w, 0);
            ctx.lineTo(this.playhead * w, h);
            ctx.stroke();
        }
    }
}
