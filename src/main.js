import { Hyperlapse } from './Hyperlapse.js';
import { loadGoogleMaps } from './GoogleMapsLoader.js';
import { AutomationController } from './AutomationController.js';
import { HyperlapseExporter } from './HyperlapseExporter.js';

// State
let hyperlapse;
let map;
let directionsService;
let directionsRenderer;
let startPin, endPin, pivotPin, cameraPin;
let routeMarkers = [];
let waypoints = [];
let waypointMarkers = [];
let isPlaying = false;
let automationController;
let exporter;
let currentAutomationValue = 0;
let ignoreDirectionsChange = false;

// Context Menu State
const contextMenu = {
    el: document.getElementById('context-menu'),
    skipItem: document.getElementById('menu-skip'),
    includeItem: document.getElementById('menu-include'),
    currentPoint: null,
    currentMarkerEl: null
};

// DOM Elements
const els = {
    status: document.getElementById('status-indicator'),
    btnLoad: document.getElementById('btn-load-panoramas'),
    btnRecalculate: document.getElementById('btn-recalculate'),
    maxSteps: document.getElementById('max-steps'),
    maxStepsVal: document.getElementById('max-steps-val'),
    distance: document.getElementById('distance'),
    distanceVal: document.getElementById('distance-val'),
    zoom: document.getElementById('zoom'),
    zoomVal: document.getElementById('zoom-val'),
    fov: document.getElementById('fov'),
    fovVal: document.getElementById('fov-val'),
    elevation: document.getElementById('elevation'),
    elevationVal: document.getElementById('elevation-val'),
    tilt: document.getElementById('tilt'),
    tiltVal: document.getElementById('tilt-val'),
    smoothing: document.getElementById('smoothing'),
    smoothingVal: document.getElementById('smoothing-val'),
    offsetX: document.getElementById('offset-x'),
    offsetXVal: document.getElementById('offset-x-val'),
    offsetY: document.getElementById('offset-y'),
    offsetYVal: document.getElementById('offset-y-val'),
    offsetZ: document.getElementById('offset-z'),
    offsetZVal: document.getElementById('offset-z-val'),
    radius: document.getElementById('radius'),
    radiusVal: document.getElementById('radius-val'),
    bufferSize: document.getElementById('buffer-size'),
    bufferSizeVal: document.getElementById('buffer-size-val'),
    googleOnly: document.getElementById('google-only'),
    duration: document.getElementById('duration'),
    durationVal: document.getElementById('duration-val'),
    searchForm: document.getElementById('search-form'),
    searchInput: document.getElementById('search-input'),
    frameCounter: document.getElementById('frame-counter'),
    btnPrev: document.getElementById('btn-prev'),
    btnPlay: document.getElementById('btn-play'),
    btnNext: document.getElementById('btn-next'),
    iconPlay: document.getElementById('icon-play'),
    iconPause: document.getElementById('icon-pause'),
    progressBar: document.getElementById('progress-bar'),
    mapContainer: document.getElementById('map-container'),
    panoContainer: document.getElementById('pano-container'),
    mode: document.getElementById('mode'),
    automationContainer: document.getElementById('automation-container'),
    automationPanel: document.getElementById('automation-panel'),
    automationResizeHandle: document.getElementById('automation-resize-handle'),
    exportRatio: document.getElementById('export-ratio'),
    exportMode: document.getElementById('export-mode'),
    btnExport: document.getElementById('btn-export'),
    sidebar: document.getElementById('sidebar'), // For hiding UI
    controls: document.getElementById('sidebar') // Alias for viewer.html parity logic if needed
};

// Initial Config (will be overwritten by Hash)
let config = {
    startPoint: { lat: 44.3431, lng: 6.783936 },
    endPoint: { lat: 44.340578, lng: 6.782684 },
    lookatPoint: { lat: 44.34232747290594, lng: 6.786460550292986 },
    elevation: 0,
    waypoints: []
};

async function init() {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
        console.error("VITE_GOOGLE_MAPS_API_KEY is missing in .env file");
        alert("Please set VITE_GOOGLE_MAPS_API_KEY in .env file");
        return;
    }

    // Parse Hash
    parseHash();

    try {
        await loadGoogleMaps(apiKey);
        initMap();
        initHyperlapse(apiKey);
        setupAutomation();
        setupExporter();
        setupEventListeners();
        setupContextMenu();

        // Setup Resize Handle
        setupResizeHandle();

        // Initial Route Generation
        if (config.startPoint && config.endPoint) {
            generateRoute();
        }

    } catch (e) {
        console.error("Failed to load Google Maps", e);
    }
}

function parseHash() {
    if( window.location.hash ) {
        const parts = window.location.hash.substr( 1 ).split( ',' );
        config.startPoint = { lat: parseFloat(parts[0]), lng: parseFloat(parts[1]) };
        config.lookatPoint = { lat: parseFloat(parts[2]), lng: parseFloat(parts[3]) };
        config.endPoint = { lat: parseFloat(parts[4]), lng: parseFloat(parts[5]) };
        config.elevation = parseFloat(parts[6]) || 0;

        // Update UI for elevation
        els.elevation.value = config.elevation;
        els.elevationVal.textContent = config.elevation;

        // Parse waypoints
        config.waypoints = [];
        if (parts.length > 7) {
            for (let i = 7; i < parts.length; i += 2) {
                if (parts[i] && parts[i+1]) {
                    config.waypoints.push({
                        location: { lat: parseFloat(parts[i]), lng: parseFloat(parts[i+1]) },
                        stopover: true
                    });
                }
            }
        }
        waypoints = config.waypoints;
    }
}

function updateHash() {
    // Helper to get lat/lng from various Google Maps objects
    const getPos = (p) => {
        // If it's a LatLng object with methods
        if (typeof p.lat === 'function') return { lat: p.lat(), lng: p.lng() };
        // If it's a plain object
        return p;
    };

    const s = getPos(startPin.position);
    const p = getPos(pivotPin.position);
    const e = getPos(endPin.position);

    let hash = `${s.lat},${s.lng},${p.lat},${p.lng},${e.lat},${e.lng},${hyperlapse.elevation_offset || 0}`;

    // Append waypoints
    for (let i = 0; i < waypoints.length; i++) {
        const wp = getPos(waypoints[i].location);
        hash += `,${wp.lat},${wp.lng}`;
    }

    window.location.hash = hash;
}

function initMap() {
    const mapOpt = {
        mapTypeId: google.maps.MapTypeId.ROADMAP,
        center: config.startPoint,
        zoom: 15,
        mapId: "HYPERLAPSE_MAP_ID",
        streetViewControl: false
    };

    map = new google.maps.Map(els.mapContainer, mapOpt);
    directionsService = new google.maps.DirectionsService();
    directionsRenderer = new google.maps.DirectionsRenderer({
        draggable: true,
        markerOptions: { opacity: 0 },
        preserveViewport: true,
        map: map
    });

    // Custom "Center on Play Marker" Control
    const centerControlDiv = document.createElement("div");
    centerControlDiv.className = "custom-map-control-button";
    centerControlDiv.title = "Center on play marker";
    centerControlDiv.innerHTML = `
        <div class="custom-map-control-icon">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="12" cy="12" r="10" stroke="#666" stroke-width="2"/>
                <circle cx="12" cy="12" r="4" fill="#666"/>
                <line x1="12" y1="2" x2="12" y2="6" stroke="#666" stroke-width="2"/>
                <line x1="12" y1="18" x2="12" y2="22" stroke="#666" stroke-width="2"/>
                <line x1="2" y1="12" x2="6" y2="12" stroke="#666" stroke-width="2"/>
                <line x1="18" y1="12" x2="22" y2="12" stroke="#666" stroke-width="2"/>
            </svg>
        </div>
    `;
    centerControlDiv.addEventListener("click", () => {
        const pos = cameraPin && (cameraPin.position || (cameraPin.getPosition && cameraPin.getPosition()));
        if (pos) map.setCenter(pos);
    });
    map.controls[google.maps.ControlPosition.RIGHT_BOTTOM].push(centerControlDiv);


    // Pins
    startPin = createPin(config.startPoint, '#4CAF50', '#2E7D32', 'white', true); // Green
    endPin = createPin(config.endPoint, '#F44336', '#C62828', 'white', true); // Red
    pivotPin = createPin(config.lookatPoint, '#FFEB3B', '#FBC02D', 'black', true); // Yellow
    cameraPin = createPin(config.startPoint, '#2196F3', '#1565C0'); // Blue

    // Drag Listeners
    startPin.addEventListener('dragend', () => {
        config.startPoint = startPin.position;
        generateRoute();
    });

    endPin.addEventListener('dragend', () => {
        config.endPoint = endPin.position;
        generateRoute();
    });

    pivotPin.addEventListener('dragend', () => {
        hyperlapse.setLookat(pivotPin.position);
        updateHash();
    });

    directionsRenderer.addListener('directions_changed', handleDirectionsChanged);

    // Initial waypoints if any (from hash)
    if (waypoints.length > 0) {
        refreshWaypointMarkers(waypoints.map(wp => wp.location));
    }
}

function createPin(position, background, borderColor, glyphColor = 'white', draggable = false) {
    const pin = new google.maps.marker.AdvancedMarkerElement({
        position: position,
        gmpDraggable: draggable,
        map: map,
        content: new google.maps.marker.PinElement({
            background,
            borderColor,
            glyphColor,
        }).element,
    });
    if (!draggable) {
        pin.element.style.pointerEvents = 'none';
    }
    return pin;
}

function createYellowCircleElement() {
    const el = document.createElement('div');
    el.style.width = '10px';
    el.style.height = '10px';
    el.style.backgroundColor = '#FFEB3B'; // Yellow
    el.style.border = '2px solid #FBC02D'; // Darker yellow border
    el.style.borderRadius = '50%';
    el.style.cursor = 'pointer';
    return el;
}

function initHyperlapse(apiKey) {
    hyperlapse = new Hyperlapse(els.panoContainer, {
        lookat: config.lookatPoint,
        fov: parseInt(els.fov.value),
        millis: parseInt(els.duration.value),
        width: els.panoContainer.clientWidth,
        height: els.panoContainer.clientHeight,
        zoom: parseInt(els.zoom.value),
        use_lookat: els.mode.value === 'LookAt',
        distance_between_points: parseInt(els.distance.value),
        max_points: parseInt(els.maxSteps.value),
        elevation: parseInt(els.elevation.value),
        radius: parseInt(els.radius.value),
        apiKey: apiKey
    });

    // Set initial buffer size from UI (which now defaults to 60)
    hyperlapse.buffer_size = parseInt(els.bufferSize.value);

    hyperlapse.onError = (e) => {
        console.error(e);
        updateStatus(`ERROR: ${e.message}`);
    };

    hyperlapse.onRouteProgress = (e) => {
        const el = createYellowCircleElement();
        const marker = new google.maps.marker.AdvancedMarkerElement({
            position: e.point.location,
            gmpDraggable: true,
            content: el,
            map: map
        });

        // Context Menu
        el.addEventListener('contextmenu', function(event) {
            event.preventDefault();
            event.stopPropagation();
            showContextMenu(event.clientX, event.clientY, e.point, el);
        });

        // Drag to add waypoint
        marker.addEventListener('dragend', function (event) {
            waypoints.push({
                location: marker.position,
                stopover: true
            });
            generateRoute();
        });

        routeMarkers.push(marker);
    };

    hyperlapse.onRouteComplete = (e) => {
        ignoreDirectionsChange = true;
        directionsRenderer.setDirections(e.response);
        ignoreDirectionsChange = false;

        updateStatus(`Route generated. Points: ${hyperlapse.length()}`);
        updateHash();
        hyperlapse.load();
    };

    hyperlapse.onLoadProgress = (e) => {
        updateStatus(`Loading: ${e.position + 1} of ${hyperlapse.length()}`);
        updateProgressBar(e.position, hyperlapse.length());
    };

    hyperlapse.onLoadComplete = (e) => {
        updateStatus(`Ready (${hyperlapse.length()} frames)`);
        updateProgressBar(0, hyperlapse.length());
        els.progressBar.max = hyperlapse.length() - 1;
    };

    hyperlapse.onFrame = (e) => {
        updateStatus(`Position: ${e.position + 1} of ${hyperlapse.length()}`);
        cameraPin.position = e.point.location;
        updateProgressBar(e.position, hyperlapse.length());
        els.progressBar.value = e.position;

        // Automation Logic
        if (els.mode.value === 'Automation' && hyperlapse.length() > 0) {
            const t = e.position / (hyperlapse.length() - 1);
            let targetYaw = automationController.getValueAt(t);

            const smoothing = parseFloat(els.smoothing.value);
            if (smoothing > 0) {
                const alpha = 1 - smoothing;
                currentAutomationValue += (targetYaw - currentAutomationValue) * alpha;
            } else {
                currentAutomationValue = targetYaw;
            }
            hyperlapse.position.x = currentAutomationValue;

            // Sync UI inputs if we want (e.g. offsetX slider?), but maybe redundant.
            // els.offsetX.value = currentAutomationValue; // Can loop back, be careful.

            // Update playhead
            automationController.setPlayhead(t);
        }
    };

    // Drag on Pano logic
    setupPanoInteraction();
}

function setupPanoInteraction() {
    let isMoving = false;
    let onPointerDownPointerX = 0, onPointerDownPointerY = 0;
    let px = 0, py = 0;

    els.panoContainer.addEventListener('mousedown', function(e) {
        if (els.mode.value === 'Automation') return;
        e.preventDefault();
        isMoving = true;
        onPointerDownPointerX = e.clientX;
        onPointerDownPointerY = e.clientY;
        px = hyperlapse.position.x;
        py = hyperlapse.position.y;
    });

    els.panoContainer.addEventListener('mousemove', function(e) {
        if (isMoving) {
            e.preventDefault();
            const f = hyperlapse.fov() / 500;
            const dx = (onPointerDownPointerX - e.clientX) * f;
            const dy = (e.clientY - onPointerDownPointerY) * f;
            hyperlapse.position.x = px + dx;
            hyperlapse.position.y = py + dy;

            // Sync UI sliders
            els.offsetX.value = hyperlapse.position.x;
            els.offsetXVal.textContent = Math.round(hyperlapse.position.x);
            els.offsetY.value = hyperlapse.position.y;
            els.offsetYVal.textContent = Math.round(hyperlapse.position.y);
        }
    });

    window.addEventListener('mouseup', function() {
        isMoving = false;
    });
}

function setupAutomation() {
    automationController = new AutomationController(els.automationPanel);

    // Initial visibility check
    if (els.mode.value === 'Automation') {
        els.automationContainer.style.display = 'flex';
        automationController.resize();
    } else {
        els.automationContainer.style.display = 'none';
    }
}

function setupExporter() {
    exporter = new HyperlapseExporter(hyperlapse);
}

function setupResizeHandle() {
    let isResizing = false;
    const handle = els.automationResizeHandle;
    const container = els.automationContainer;
    const pano = els.panoContainer;

    handle.addEventListener('mousedown', (e) => {
        isResizing = true;
        document.body.style.cursor = 'ns-resize';
    });

    window.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        // Calculate new height relative to the bottom of the main-stage
        // Distance from mouse to bottom of playback bar (which is window bottom in full height app)
        // playback bar is 60px.

        const bottomOffset = window.innerHeight - e.clientY - 60; // 60 is playback height
        const newHeight = Math.max(50, Math.min(bottomOffset, window.innerHeight - 150)); // Clamp

        container.style.height = `${newHeight}px`;
        automationController.resize();

        // Update Hyperlapse size during drag for smooth preview
        if (hyperlapse) {
             // We need to wait for layout update or just use the current container size
             // Since we just set automation container height, flex should update pano height instantly
             // However, flex update might happen in next frame or sync.
             // We can use requestAnimationFrame to sync if needed, but direct call is okay usually.
             hyperlapse.setSize(pano.clientWidth, pano.clientHeight);
        }
    });

    window.addEventListener('mouseup', () => {
        isResizing = false;
        document.body.style.cursor = 'default';
        if (hyperlapse) hyperlapse.setSize(pano.clientWidth, pano.clientHeight);
    });
}

function generateRoute() {
    updateStatus("Generating route...");

    // Clear existing route markers
    routeMarkers.forEach(m => m.map = null);
    routeMarkers = [];

    const request = {
        origin: startPin.position,
        destination: endPin.position,
        waypoints: waypoints,
        travelMode: google.maps.TravelMode.DRIVING
    };

    directionsService.route(request, (response, status) => {
        if (status == google.maps.DirectionsStatus.OK) {
            hyperlapse.generate({ route: response });
        } else {
            console.error(status);
            updateStatus(`Route failed: ${status}`);
        }
    });
}

function handleDirectionsChanged() {
    if (ignoreDirectionsChange) return;

    const result = directionsRenderer.getDirections();
    if (!result || !result.routes || !result.routes.length) return;

    const route = result.routes[0];
    const legs = route.legs;

    config.startPoint = legs[0].start_location;
    config.endPoint = legs[legs.length - 1].end_location;

    startPin.position = config.startPoint;
    endPin.position = config.endPoint;

    // Update waypoints
    waypoints = [];
    refreshWaypointMarkers([]); // Clear markers first, will rebuild

    for (let i = 0; i < legs.length - 1; i++) {
        const wpLoc = legs[i].end_location;
        waypoints.push({ location: wpLoc, stopover: true });
    }

    refreshWaypointMarkers(waypoints.map(wp => wp.location));
    generateRoute();
}

function refreshWaypointMarkers(locations) {
    waypointMarkers.forEach(m => m.map = null);
    waypointMarkers = [];

    locations.forEach(loc => {
        const wpPin = createPin(loc, '#FF9800', '#EF6C00'); // Orange
        waypointMarkers.push(wpPin);
    });
}

function updateStatus(msg) {
    if (els.status) els.status.textContent = msg;
}

function updateProgressBar(current, total) {
    els.frameCounter.textContent = `Frame ${current + 1}/${total}`;
}

// Context Menu Logic
function setupContextMenu() {
    document.addEventListener('click', hideContextMenu);
    contextMenu.el.addEventListener('click', (e) => e.stopPropagation());

    contextMenu.skipItem.addEventListener('click', () => {
        if (contextMenu.currentPoint && contextMenu.currentMarkerEl) {
            contextMenu.currentPoint.is_skipped = true;
            contextMenu.currentMarkerEl.style.backgroundColor = '#9E9E9E'; // Gray
            contextMenu.currentMarkerEl.style.borderColor = '#616161';
        }
        hideContextMenu();
    });

    contextMenu.includeItem.addEventListener('click', () => {
        if (contextMenu.currentPoint && contextMenu.currentMarkerEl) {
            contextMenu.currentPoint.is_skipped = false;
            contextMenu.currentMarkerEl.style.backgroundColor = '#FFEB3B'; // Yellow
            contextMenu.currentMarkerEl.style.borderColor = '#FBC02D';
        }
        hideContextMenu();
    });
}

function showContextMenu(x, y, point, markerElement) {
    contextMenu.currentPoint = point;
    contextMenu.currentMarkerEl = markerElement;

    if (point.is_skipped) {
        contextMenu.skipItem.style.display = 'none';
        contextMenu.includeItem.style.display = 'block';
    } else {
        contextMenu.skipItem.style.display = 'block';
        contextMenu.includeItem.style.display = 'none';
    }

    contextMenu.el.style.left = x + 'px';
    contextMenu.el.style.top = y + 'px';
    contextMenu.el.style.display = 'block';
}

function hideContextMenu() {
    contextMenu.el.style.display = 'none';
    contextMenu.currentPoint = null;
    contextMenu.currentMarkerEl = null;
}


function setupEventListeners() {
    // Window Resize
    window.addEventListener('resize', () => {
        if (hyperlapse) hyperlapse.setSize(els.panoContainer.clientWidth, els.panoContainer.clientHeight);
        if (automationController) automationController.resize();
    });

    // Keyboard Shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT') return;
        switch(e.code) {
            case 'KeyH': // Hide/Show Sidebar
                els.sidebar.style.display = els.sidebar.style.display === 'none' ? 'flex' : 'none';
                if(hyperlapse) setTimeout(() => hyperlapse.setSize(els.panoContainer.clientWidth, els.panoContainer.clientHeight), 100);
                break;
            case 'Period': // >
            case 'ArrowRight':
                hyperlapse.next();
                break;
            case 'Comma': // <
            case 'ArrowLeft':
                hyperlapse.prev();
                break;
            case 'Space':
                togglePlay();
                break;
        }
    });

    // Sliders & Inputs
    const bindings = [
        ['maxSteps', 'setMaxPoints'],
        ['distance', 'setDistanceBetweenPoint'],
        ['zoom', 'setZoom'],
        ['fov', 'setFOV'],
        ['elevation', (v) => { hyperlapse.elevation_offset = v; updateHash(); }],
        ['tilt', (v) => { hyperlapse.tilt = v; }],
        ['offsetX', (v) => { hyperlapse.offset.x = v; }],
        ['offsetY', (v) => { hyperlapse.offset.y = v; }],
        ['offsetZ', (v) => { hyperlapse.offset.z = v; }],
        ['duration', (v) => { hyperlapse.millis = v; }],
        ['radius', 'setRadius'],
        ['bufferSize', (v) => { hyperlapse.buffer_size = v; }]
    ];

    bindings.forEach(([id, setter]) => {
        els[id].addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            els[`${id}Val`].textContent = val;

            if (hyperlapse) {
                if (typeof setter === 'string') {
                    hyperlapse[setter](val);
                } else {
                    setter(val);
                }
            }
        });
    });

    // Checkbox
    els.googleOnly.addEventListener('change', (e) => {
        const val = e.target.checked ? google.maps.StreetViewSource.GOOGLE : google.maps.StreetViewSource.DEFAULT;
        hyperlapse.setSource(val);
    });

    // Mode Switch
    els.mode.addEventListener('change', (e) => {
        const mode = e.target.value;
        if (mode === 'LookAt') {
            hyperlapse.use_lookat = true;
            els.automationContainer.style.display = 'none';
        } else {
            hyperlapse.use_lookat = false;
            els.automationContainer.style.display = 'flex';
            automationController.resize();
        }
    });

    // Buttons
    els.btnLoad.addEventListener('click', () => {
        const bounds = map.getBounds();
        const center = map.getCenter();
        const span = bounds.toSpan();
        const spacing = span.lng() / 4;

        const c1 = { lat: center.lat(), lng: center.lng() - spacing };
        const c2 = { lat: center.lat(), lng: center.lng() };
        const c3 = { lat: center.lat(), lng: center.lng() + spacing };

        pivotPin.position = c2;
        hyperlapse.setLookat(c2);
        config.lookatPoint = c2;

        snapToRoad(c1, (result1) => {
            if (result1) startPin.position = result1;
            else startPin.position = c1;
            config.startPoint = startPin.position;

            snapToRoad(c3, (result3) => {
                if (result3) endPin.position = result3;
                else endPin.position = c3;
                config.endPoint = endPin.position;

                // Clear waypoints on drop
                waypoints = [];
                refreshWaypointMarkers([]);

                generateRoute();
            });
        });
    });

    els.btnRecalculate.addEventListener('click', generateRoute);

    // Export
    els.btnExport.addEventListener('click', () => {
        exporter.export({
            ratio: els.exportRatio.value,
            mode: els.exportMode.value
        });
    });

    // Search
    els.searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ 'address': els.searchInput.value }, (results, status) => {
            if (status == google.maps.GeocoderStatus.OK) {
                map.setCenter(results[0].geometry.location);
                // Trigger load logic
                els.btnLoad.click();
            } else {
                alert('Geocode was not successful: ' + status);
            }
        });
    });

    // Playback
    els.btnPlay.addEventListener('click', togglePlay);
    els.btnPrev.addEventListener('click', () => hyperlapse.prev());
    els.btnNext.addEventListener('click', () => hyperlapse.next());

    // Progress Bar seek
    els.progressBar.addEventListener('input', (e) => {
        if(hyperlapse && hyperlapse.length() > 0) {
            const idx = parseInt(e.target.value);
            // We need to access internal index or use a method if available.
            // Hyperlapse.js usually exposes point_index or similar.
            // Checking source implies setting it might require redraw.
            // For now, let's try calling onFrame manually or pause and set.
             // Accessing private/internal state if no API exists.
             if (hyperlapse.point_index !== undefined) {
                 hyperlapse.point_index = idx;
                 hyperlapse.drawMaterial();
             }
        }
    });
}

function snapToRoad(point, callback) {
    const request = { origin: point, destination: point, travelMode: google.maps.TravelMode.DRIVING };
    directionsService.route(request, (response, status) => {
        if (status == google.maps.DirectionsStatus.OK) {
            callback(response.routes[0].overview_path[0]);
        } else {
            callback(null);
        }
    });
}

function togglePlay() {
    isPlaying = !isPlaying;
    els.iconPlay.style.display = isPlaying ? 'none' : 'block';
    els.iconPause.style.display = isPlaying ? 'block' : 'none';

    if (isPlaying) {
        hyperlapse.play();
    } else {
        hyperlapse.pause();
    }
}

window.onload = init;
