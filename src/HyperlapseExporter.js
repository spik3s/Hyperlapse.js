
/**
 * HyperlapseExporter.js
 *
 * Handles exporting the Hyperlapse canvas to a video file.
 */

export class HyperlapseExporter {
	constructor(hyperlapse) {
		this.hyperlapse = hyperlapse;
		this.isRecording = false;
		this.recorder = null;
		this.chunks = [];
		this.originalState = {};
		this.originalOnFrame = null;

		// Internal tracking for loop detection
		this.frameCount = 0;
		this.hasTurnedBack = false;
	}

	getSupportedMimeType() {
		const types = [
			'video/mp4; codecs="avc3.424028, mp4a.40.2"',
			'video/mp4; codecs="avc1.424028, mp4a.40.2"',
			'video/mp4',
			'video/webm; codecs=vp9',
			'video/webm; codecs=vp8',
			'video/webm'
		];
		for (const type of types) {
			if (MediaRecorder.isTypeSupported(type)) return type;
		}
		console.warn("No standard video mime types supported by MediaRecorder.");
		return '';
	}

	export(options = {}) {
		if (this.isRecording) return;
		if (this.hyperlapse.isLoading) {
			alert("Please wait for the hyperlapse to finish loading before exporting.");
			return;
		}
		if (this.hyperlapse.length() === 0) {
			alert("No route generated to export.");
			return;
		}

		this.options = {
			ratio: options.ratio || 'screen', // '16:9', '9:16', 'screen'
			mode: options.mode || 'loop',     // 'single', 'loop'
			filename: options.filename || 'hyperlapse.mp4'
		};

		this.saveState();
		this.setupCanvas();
		this.startRecording();
	}

	saveState() {
		this.originalState = {
			width: this.hyperlapse.w,
			height: this.hyperlapse.h,
			isPlaying: this.hyperlapse.isPlaying,
			point_index: this.hyperlapse.point_index,
			forward: this.hyperlapse.forward
		};
		this.originalOnFrame = this.hyperlapse.onFrame;
	}

	setupCanvas() {
		// Pause during setup
		this.hyperlapse.pause();

		let targetW = this.originalState.width;
		let targetH = this.originalState.height;

		if (this.options.ratio === '16:9') {
			targetW = 1920;
			targetH = 1080;
		} else if (this.options.ratio === '9:16') {
			targetW = 1080;
			targetH = 1920;
		}

		// Apply size
		this.hyperlapse.setSize(targetW, targetH);

		// Reset to start
		this.hyperlapse.point_index = 0;
		this.hyperlapse.forward = true;

		// Force a draw to ensure the first frame is ready on the canvas
		this.hyperlapse.drawMaterial();
		this.hyperlapse.render();
	}

	startRecording() {
		const canvas = this.hyperlapse.webgl().domElement;

		if (!canvas.captureStream) {
			alert("Your browser does not support canvas capturing (captureStream).");
			this.restoreState();
			return;
		}

		const stream = canvas.captureStream(30); // 30 FPS
		const mimeType = this.getSupportedMimeType();

		if (!mimeType) {
			alert("Your browser does not support MediaRecorder export.");
			this.restoreState();
			return;
		}

		try {
			this.recorder = new MediaRecorder(stream, { mimeType: mimeType, videoBitsPerSecond: 5000000 }); // 5Mbps
		} catch (e) {
			console.error("Failed to create MediaRecorder:", e);
			alert("Failed to initialize video recorder.");
			this.restoreState();
			return;
		}

		this.chunks = [];
		this.recorder.ondataavailable = (e) => {
			if (e.data.size > 0) this.chunks.push(e.data);
		};

		this.recorder.onstop = () => {
			this.saveFile(mimeType);
			this.restoreState();
		};

		this.isRecording = true;
		this.hasTurnedBack = false;

		// Hook into onFrame to monitor progress
		this.hyperlapse.onFrame = (e) => {
			// Call original handler if it exists
			if (this.originalOnFrame) this.originalOnFrame(e);

			this.checkStopCondition();
		};

		this.recorder.start();
		this.hyperlapse.play();
	}

	checkStopCondition() {
		const idx = this.hyperlapse.point_index;
		const len = this.hyperlapse.length();
		const forward = this.hyperlapse.forward;

		// Mode: Single Pass (0 -> End)
		if (this.options.mode === 'single') {
			// If we reached the end (index is last element)
			if (forward && idx >= len - 1) {
				// Stop slightly after to capture the last frame
				setTimeout(() => this.stopRecording(), 100);
			}
		}
		// Mode: Loop (0 -> End -> 0)
		else if (this.options.mode === 'loop') {
			// Check if we have turned back
			if (!forward && idx === len - 1) {
				this.hasTurnedBack = true; // We are at the end, starting to go back
			}

			// We started going forward, then we turned back (forward became false),
			// now we are back at 0?
			// Hyperlapse loop logic:
			// if (forward) ++idx; if (idx==len) { idx=len-1; forward=false; }
			// else --idx; if (idx==-1) { idx=0; forward=true; }

			// So when we hit 0 coming back, forward flips to true.
			// However, onFrame is called inside drawMaterial() which is called inside loop().
			// Inside loop():
			// drawMaterial() -> fires onFrame with current index (e.g. 0)
			// Then logic updates index for NEXT frame.

			// If we are at index 0 and forward is FALSE (meaning we just decremented to 0),
			// wait, loop logic says:
			// else { if (--point_index === -1) { point_index = 0; forward = true; } }
			// So point_index goes 1 -> 0. drawMaterial() is called for 0.
			// Next loop call: --point_index becomes -1. Resets to 0, forward=true.

			// So we want to stop when we have completed the return trip.
			// That means we rendered index 0 and we were moving backward.

			if (this.hasTurnedBack && idx === 0 && !forward) {
				// We are at 0 and moving backward. This is the last frame of the loop (start point).
				setTimeout(() => this.stopRecording(), 100);
			}
		}
	}

	stopRecording() {
		if (!this.isRecording) return;
		this.isRecording = false;
		this.hyperlapse.pause();
		this.recorder.stop();
	}

	saveFile(mimeType) {
		const blob = new Blob(this.chunks, { type: mimeType });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.style.display = 'none';
		a.href = url;

		// Determine extension based on mimeType
		let ext = 'mp4';
		if (mimeType.includes('webm')) ext = 'webm';

		a.download = `hyperlapse_export.${ext}`;
		document.body.appendChild(a);
		a.click();
		setTimeout(() => {
			document.body.removeChild(a);
			window.URL.revokeObjectURL(url);
		}, 100);
	}

	restoreState() {
		this.hyperlapse.pause(); // Ensure stopped

		// Restore callbacks
		this.hyperlapse.onFrame = this.originalOnFrame;

		// Restore size
		this.hyperlapse.setSize(this.originalState.width, this.originalState.height);

		// Restore position
		this.hyperlapse.point_index = this.originalState.point_index;
		this.hyperlapse.forward = this.originalState.forward;
		this.hyperlapse.drawMaterial();
		this.hyperlapse.render();

		// Restore play state
		if (this.originalState.isPlaying) {
			this.hyperlapse.play();
		}
	}
}
