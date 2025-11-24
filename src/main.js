import { Hyperlapse } from './Hyperlapse.js';
import { loadGoogleMaps } from './GoogleMapsLoader.js';

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
let animationFrameId;

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
    offsetX: document.getElementById('offset-x'),
    offsetXVal: document.getElementById('offset-x-val'),
    offsetY: document.getElementById('offset-y'),
    offsetYVal: document.getElementById('offset-y-val'),
    offsetZ: document.getElementById('offset-z'),
    offsetZVal: document.getElementById('offset-z-val'),
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
    panoContainer: document.getElementById('pano-container')
};

// Configuration
const config = {
    startPoint: { lat: 44.3431, lng: 6.783936 },
    endPoint: { lat: 44.340578, lng: 6.782684 },
    lookatPoint: { lat: 44.34232747290594, lng: 6.786460550292986 },
    elevation: 0
};

async function init() {
    const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
    if (!apiKey) {
        console.error("VITE_GOOGLE_MAPS_API_KEY is missing in .env file");
        alert("Please set VITE_GOOGLE_MAPS_API_KEY in .env file");
        return;
    }

    try {
        await loadGoogleMaps(apiKey);
        initMap();
        initHyperlapse(apiKey);
        setupEventListeners();
    } catch (e) {
        console.error("Failed to load Google Maps", e);
    }
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

    // Pins
    startPin = createPin(config.startPoint, '#4CAF50', '#2E7D32'); // Green
    endPin = createPin(config.endPoint, '#F44336', '#C62828'); // Red
    pivotPin = createPin(config.lookatPoint, '#FFEB3B', '#FBC02D', 'black', true); // Yellow
    cameraPin = createPin(config.startPoint, '#2196F3', '#1565C0'); // Blue

    pivotPin.addEventListener('dragend', () => {
        hyperlapse.setLookat(pivotPin.position);
    });

    directionsRenderer.addListener('directions_changed', handleDirectionsChanged);
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

function initHyperlapse(apiKey) {
    hyperlapse = new Hyperlapse(els.panoContainer, {
        lookat: config.lookatPoint,
        fov: parseInt(els.fov.value),
        millis: parseInt(els.duration.value),
        width: els.panoContainer.clientWidth,
        height: els.panoContainer.clientHeight,
        zoom: parseInt(els.zoom.value),
        use_lookat: true,
        distance_between_points: parseInt(els.distance.value),
        max_points: parseInt(els.maxSteps.value),
        elevation: parseInt(els.elevation.value),
        apiKey: apiKey
    });

    hyperlapse.onError = (e) => {
        console.error(e);
        updateStatus(`ERROR: ${e.message}`);
    };

    hyperlapse.onRouteProgress = (e) => {
        const marker = new google.maps.marker.AdvancedMarkerElement({
            position: e.point.location,
            gmpDraggable: false,
            content: new google.maps.marker.PinElement({
                background: '#FFEB3B',
                borderColor: '#FBC02D',
                glyphColor: 'black',
                scale: 0.5,
            }).element,
            map: map
        });
        routeMarkers.push(marker);
    };

    hyperlapse.onRouteComplete = (e) => {
        directionsRenderer.setDirections(e.response);
        updateStatus(`Route generated. Points: ${hyperlapse.length()}`);
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
    };

    // Initial generation
    generateRoute();
}

function generateRoute() {
    updateStatus("Generating route...");

    // Clear existing markers
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
    const result = directionsRenderer.getDirections();
    if (!result || !result.routes || !result.routes.length) return;

    const route = result.routes[0];
    const legs = route.legs;

    startPin.position = legs[0].start_location;
    endPin.position = legs[legs.length - 1].end_location;

    // Update waypoints
    waypoints = [];
    waypointMarkers.forEach(m => m.map = null);
    waypointMarkers = [];

    for (let i = 0; i < legs.length - 1; i++) {
        const wpLoc = legs[i].end_location;
        waypoints.push({ location: wpLoc, stopover: true });

        const wpPin = createPin(wpLoc, '#FF9800', '#EF6C00'); // Orange
        waypointMarkers.push(wpPin);
    }

    generateRoute();
}

function updateStatus(msg) {
    els.status.textContent = msg;
}

function updateProgressBar(current, total) {
    els.frameCounter.textContent = `Frame ${current + 1}/${total}`;
}

function setupEventListeners() {
    // Window Resize
    window.addEventListener('resize', () => {
        hyperlapse.setSize(els.panoContainer.clientWidth, els.panoContainer.clientHeight);
    });

    // Sliders
    const sliders = [
        ['maxSteps', 'setMaxPoints'],
        ['distance', 'setDistanceBetweenPoint'],
        ['zoom', 'setZoom'],
        ['fov', 'setFOV'],
        ['elevation', (v) => { hyperlapse.elevation_offset = v; }],
        ['tilt', (v) => { hyperlapse.tilt = v; }],
        ['offsetX', (v) => { hyperlapse.offset.x = v; }],
        ['offsetY', (v) => { hyperlapse.offset.y = v; }],
        ['offsetZ', (v) => { hyperlapse.offset.z = v; }],
        ['duration', (v) => { hyperlapse.millis = v; }]
    ];

    sliders.forEach(([id, setter]) => {
        els[id].addEventListener('input', (e) => {
            const val = parseFloat(e.target.value);
            els[`${id}Val`].textContent = val;

            if (typeof setter === 'string') {
                hyperlapse[setter](val);
            } else {
                setter(val);
            }
        });
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

        snapToRoad(c1, (result1) => {
            if (result1) startPin.position = result1;
            else startPin.position = c1;

            snapToRoad(c3, (result3) => {
                if (result3) endPin.position = result3;
                else endPin.position = c3;

                generateRoute();
            });
        });
    });

    els.btnRecalculate.addEventListener('click', generateRoute);

    els.searchForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ 'address': els.searchInput.value }, (results, status) => {
            if (status == google.maps.GeocoderStatus.OK) {
                map.setCenter(results[0].geometry.location);
                // Trigger load panoramas logic
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

    els.progressBar.addEventListener('input', (e) => {
        // Seek functionality needs to be exposed in Hyperlapse class or we hack it
        // For now, we can't easily seek without modifying Hyperlapse.js
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
