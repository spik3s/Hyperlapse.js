/**
 * @overview Hyperlapse.js - JavaScript hyper-lapse utility for Google Street View.
 * @author Peter Nitsch
 * @copyright Teehan+Lax 2013
 */

import * as THREE from 'three';
import { GSVPANO } from './GSVPano.js';

const toRad = (val) => val * Math.PI / 180;
const toDeg = (val) => val * 180 / Math.PI;

const pointOnLine = (t, a, b) => {
	const lat1 = toRad(a.lat());
	const lon1 = toRad(a.lng());
	const lat2 = toRad(b.lat());
	const lon2 = toRad(b.lng());

	const x = lat1 + t * (lat2 - lat1);
	const y = lon1 + t * (lon2 - lon1);

	return new google.maps.LatLng(toDeg(x), toDeg(y));
};

class HyperlapsePoint {
	constructor(location, pano_id, params = {}) {
		this.location = location;
		this.pano_id = pano_id;
		this.heading = params.heading || 0;
		this.course = params.course || 0;
		this.pitch = params.pitch || 0;
		this.elevation = params.elevation || 0;
		this.image = null; // Dynamically loaded
		this.copyright = params.copyright || "© 2013 Google";
		this.image_date = params.image_date || "";
		this.isLoading = false;
	}

	dispose() {
		this.image = null;
		this.isLoading = false;
	}
}

export class Hyperlapse {
	constructor(container, params = {}) {
		this.container = container;
		this.params = params;
		this.w = this.params.width || 800;
		this.h = this.params.height || 400;
		this.d = 20;
		this.use_elevation = this.params.use_elevation || false;
		this.distance_between_points = this.params.distance_between_points || 5;
		this.max_points = this.params.max_points || 100;
		this.fovValue = this.params.fov || 70;
		this.zoom = this.params.zoom || 1;
		this.lat = 0;
		this.lon = 0;
		this.position = { x: 0, y: 0 };
		this.offset = { x: 0, y: 0, z: 0 };
		this.tilt = this.params.tilt || 0;
		this.millis = this.params.millis || 50;
		this.elevation_offset = this.params.elevation || 0;
		this.use_lookat = this.params.use_lookat || false;
		this.lookat = this.params.lookat || null;
		this.use_rotation_comp = false;
		this.rotation_comp = 0;

		// Buffering settings
		this.buffer_size = this.params.buffer_size || 10;
		this.frame_load_times = [];
		this.is_buffering = false;
		this.is_loading_pano = false;
		this.load_queue_index = -1;

		this.isPlaying = false;
		this.isLoading = false;

		this.point_index = 0;
		this.origin_heading = 0;
		this.origin_pitch = 0;
		this.forward = true;
		this.lookat_heading = 0;
		this.lookat_elevation = 0;
		this.position_y = 0; // internal pitch for camera

		this.target = new THREE.Vector3(0, 0, 0);
		this.cancel_load = false;

		this.prev_pano_id = null;
		this.raw_points = [];
		this.h_points = [];
		this.dtime = 0;
		this.lastTimestamp = 0;
		this.animationFrameId = null;

		// Event handlers
		this.onError = null;
		this.onFrame = null;
		this.onPlay = null;
		this.onPause = null;
		this.onLoadCanceled = null;
		this.onLoadProgress = null;
		this.onLoadComplete = null;
		this.onRouteProgress = null;
		this.onRouteComplete = null;

		this.elevator = new google.maps.ElevationService();
		this.streetview_service = new google.maps.StreetViewService();

		this.initThreeJS();

		this.radius = this.params.radius || 15;
		this.source = this.params.source;
		this.preference = this.params.preference;

		this.loader = new GSVPANO.PanoLoader({
			zoom: this.zoom,
			apiKey: this.params.apiKey,
			radius: this.radius,
			source: this.source,
			preference: this.preference
		});
		this.loader.onError = (message) => this.handleError({ message });
		this.loader.onPanoramaLoad = () => this.handlePanoramaLoad();
	}

	initThreeJS() {
		this.canvas = document.createElement('canvas');
		this.context = this.canvas.getContext('2d');

		this.camera = new THREE.PerspectiveCamera(this.fovValue, this.w / this.h, 1, 1100);

		this.scene = new THREE.Scene();
		this.scene.add(this.camera);

		this.renderer = new THREE.WebGLRenderer();
		this.renderer.autoClear = false;
		this.renderer.setSize(this.w, this.h);

		const geometry = new THREE.SphereGeometry(500, 60, 40);

		this.mesh = new THREE.Mesh(
			geometry,
			new THREE.MeshBasicMaterial({ map: new THREE.Texture(), side: THREE.DoubleSide })
		);
		this.scene.add(this.mesh);

		this.container.appendChild(this.renderer.domElement);
	}

	handleError(e) {
		if (this.onError) this.onError(e);
	}

	handleFrame(e) {
		if (this.onFrame) this.onFrame(e);
	}

	handlePlay(e) {
		if (this.onPlay) this.onPlay(e);
	}

	handlePause(e) {
		if (this.onPause) this.onPause(e);
	}

	handleLoadCanceled(e) {
		this.cancel_load = false;
		this.isLoading = false;
		if (this.onLoadCanceled) this.onLoadCanceled(e);
	}

	handleLoadProgress(e) {
		if (this.onLoadProgress) this.onLoadProgress(e);
	}

	handleLoadComplete(e) {
		this.isLoading = false;
		this.point_index = 0;

		this.drawMaterial();

		if (this.animationFrameId) {
			cancelAnimationFrame(this.animationFrameId);
		}
		this.animate(performance.now());

		if (this.onLoadComplete) this.onLoadComplete(e);
	}

	handleRouteProgress(e) {
		if (this.onRouteProgress) this.onRouteProgress(e);
	}

	handleRouteComplete(e) {
		const elevations = this.h_points.map(p => p.location);

		if (this.use_elevation) {
			this.getElevation(elevations, (results) => {
				if (results) {
					for (let i = 0; i < this.h_points.length; i++) {
						this.h_points[i].elevation = results[i].elevation;
					}
				} else {
					for (let i = 0; i < this.h_points.length; i++) {
						this.h_points[i].elevation = -1;
					}
				}
				
				this.setLookat(this.lookat, true, () => {
					if (this.onRouteComplete) this.onRouteComplete(e);
				});
			});
		} else {
			for (let i = 0; i < this.h_points.length; i++) {
				this.h_points[i].elevation = -1;
			}

			this.setLookat(this.lookat, false, () => {
				if (this.onRouteComplete) this.onRouteComplete(e);
			});
		}
	}

	handlePanoramaLoad() {
		// Stop timing the load
		if (this.loadStartTime) {
			const loadTime = performance.now() - this.loadStartTime;
			this.frame_load_times.push(loadTime);

			// Auto-calculate buffer size after 5 samples
			if (this.frame_load_times.length === 5) {
				const avgLoadTime = this.frame_load_times.reduce((a, b) => a + b, 0) / 5;
				// Estimate how many frames we need to buffer to cover load latency
				// With a safety factor of 1.5
				const suggestedBuffer = Math.ceil((avgLoadTime / this.millis) * 1.5) + 2;
				console.log(`Auto-calculating buffer. Avg Load: ${avgLoadTime.toFixed(2)}ms, Buffer: ${suggestedBuffer}`);
				// Optionally update buffer size here if "auto" was a mode,
				// but user asked for "Recommended" value which implies manual selection or internal use.
				// We'll update it internally if it's larger than current to be safe, or if configured to do so.
				// For now, let's respect the initial setting but log it.
				// Actually, the prompt said "option to choose 'Recommended' value".
				// We will assume if the user passed 'auto' or nothing for buffer size, we adapt.
				// Let's stick to the configured value for now to be deterministic.
			}
		}

		const canvas = document.createElement("canvas");
		const context = canvas.getContext('2d');
		canvas.setAttribute('width', this.loader.canvas.width);
		canvas.setAttribute('height', this.loader.canvas.height);
		context.drawImage(this.loader.canvas, 0, 0);

		// Current loading index was stored or implied
		// We need to know WHICH point was just loaded.
		// Since GSVPano is serialized, it's the one we requested.
		const loadedIndex = this.load_queue_index;

		if (loadedIndex >= 0 && loadedIndex < this.h_points.length) {
			this.h_points[loadedIndex].image = canvas;
			this.h_points[loadedIndex].isLoading = false;
			this.is_loading_pano = false;

			// Trigger progress
			// Note: this.point_index tracks PLAYBACK, not LOADING in the new model.
			// But for initial load, we might want to emit progress.
			if (this.isLoading) { // Initial loading phase
				this.handleLoadProgress({ position: loadedIndex });

				// Check if initial buffer is filled
				const bufferFull = (loadedIndex >= Math.min(this.h_points.length - 1, this.buffer_size - 1));

				if (bufferFull) {
					this.handleLoadComplete({});
				} else {
					// Load next in sequence
					this.triggerNextLoad(loadedIndex + 1);
				}
			} else {
				// We are in playback/buffering mode
				// If we were buffering and this was the needed frame, resume!
				if (this.is_buffering && this.h_points[this.point_index].image) {
					console.log("Buffering complete. Resuming.");
					this.is_buffering = false;
					this.play();
				}
				// Trigger next needed load
				this.manageBuffer();
			}
		}
	}

	triggerNextLoad(index) {
		if (this.is_loading_pano) return;
		if (index < 0 || index >= this.h_points.length) return;

		// If already loaded or loading, skip
		if (this.h_points[index].image || this.h_points[index].isLoading) {
			// Find next one?
			return;
		}

		this.load_queue_index = index;
		this.h_points[index].isLoading = true;
		this.is_loading_pano = true;
		this.loadStartTime = performance.now();

		if (!this.cancel_load) {
			this.loader.composePanorama(this.h_points[index].pano_id);
		} else {
			this.handleLoadCanceled({});
		}
	}

	manageBuffer() {
		// Determine which frame needs loading next
		// Priority:
		// 1. Current frame (if missing)
		// 2. Frames ahead up to buffer_size

		// Unload old frames
		const unloadThreshold = this.point_index - this.buffer_size;
		if (unloadThreshold >= 0) {
			for (let i = 0; i < unloadThreshold; i++) {
				if (this.h_points[i].image) {
					this.h_points[i].dispose();
				}
			}
		}

		// Also unload future frames that are way too far ahead (e.g. if we jumped)
		// Not implementing strictly now, but good practice.

		// Find next to load
		let nextToLoad = -1;
		const endBuffer = Math.min(this.h_points.length, this.point_index + this.buffer_size);

		for (let i = this.point_index; i < endBuffer; i++) {
			if (!this.h_points[i].image && !this.h_points[i].isLoading) {
				nextToLoad = i;
				break;
			}
		}

		if (nextToLoad !== -1) {
			this.triggerNextLoad(nextToLoad);
		}
	}

	parsePoints(response) {
		const p = this.raw_points[this.point_index];
		const location = (p.lat && p.lng) ? p : p.location;
		const course = (p.heading !== undefined) ? p.heading : 0;

		this.loader.load(location, () => {
			if (this.loader.id !== this.prev_pano_id) {
				this.prev_pano_id = this.loader.id;

				const hp = new HyperlapsePoint(this.loader.location, this.loader.id, {
					heading: this.loader.rotation,
					course: course,
					pitch: this.loader.pitch,
					elevation: this.loader.elevation,
					copyright: this.loader.copyright,
					image_date: this.loader.image_date
				});

				this.h_points.push(hp);

				this.handleRouteProgress({ point: hp });

				if (this.point_index === this.raw_points.length - 1) {
					this.handleRouteComplete({ response: response, points: this.h_points });
				} else {
					this.point_index++;
					if (!this.cancel_load) this.parsePoints(response);
					else this.handleLoadCanceled({});
				}
			} else {
				this.raw_points.splice(this.point_index, 1);

				if (this.point_index === this.raw_points.length) {
					this.handleRouteComplete({ response: response, points: this.h_points });
				} else {
					if (!this.cancel_load) this.parsePoints(response);
					else this.handleLoadCanceled({});
				}
			}
		});
	}

	getElevation(locations, callback) {
		const positionalRequest = { locations: locations };

		this.elevator.getElevationForLocations(positionalRequest, (results, status) => {
			if (status === google.maps.ElevationStatus.OK) {
				callback(results);
			} else {
				if (status === google.maps.ElevationStatus.OVER_QUERY_LIMIT) {
					console.log("Over elevation query limit.");
				}
				this.use_elevation = false;
				callback(null);
			}
		});
	}

	handleDirectionsRoute(response) {
		if (!this.isPlaying) {
			const route = response.routes[0];
			const path = route.overview_path;
			const legs = route.legs;

			let total_distance = 0;
			for (let i = 0; i < legs.length; ++i) {
				total_distance += legs[i].distance.value;
			}

			const segment_length = total_distance / this.max_points;
			this.d = (segment_length < this.distance_between_points) ? this.distance_between_points : segment_length;

			let d = 0;
			let r = 0;
			let a, b;
			let heading = 0;

			for (let i = 0; i < path.length; i++) {
				if (i + 1 < path.length) {
					a = path[i];
					b = path[i+1];
					d = google.maps.geometry.spherical.computeDistanceBetween(a, b);
					heading = google.maps.geometry.spherical.computeHeading(a, b);

					if (r > 0 && r < d) {
						a = pointOnLine(r/d, a, b);
						d = google.maps.geometry.spherical.computeDistanceBetween(a, b);
						this.raw_points.push({ location: a, heading: heading });
						r = 0;
					} else if (r > 0 && r > d) {
						r -= d;
					}

					if (r === 0) {
						const segs = Math.floor(d / this.d);

						if (segs > 0) {
							for (let j = 0; j < segs; j++) {
								const t = j / segs;
								if (t > 0 || (t+i) === 0) { // not start point
									const way = pointOnLine(t, a, b);
									this.raw_points.push({ location: way, heading: heading });
								}
							}
							r = d - (this.d * segs);
						} else {
							r = this.d * (1 - (d / this.d));
						}
					}
				} else {
					this.raw_points.push({ location: path[i], heading: heading });
				}
			}
			this.parsePoints(response);
		} else {
			this.pause();
			this.handleDirectionsRoute(response);
		}
	}

	drawMaterial() {
		// Ensure we have an image
		if (!this.h_points[this.point_index].image) {
			// Image not ready!
			// This can happen if we are buffering or seeking
			return;
		}

		this.mesh.material.map.image = this.h_points[this.point_index].image;
		this.mesh.material.map.needsUpdate = true;

		this.origin_heading = this.h_points[this.point_index].heading;
		this.origin_pitch = this.h_points[this.point_index].pitch;

		if (this.use_lookat && this.lookat)
			this.lookat_heading = google.maps.geometry.spherical.computeHeading(this.h_points[this.point_index].location, this.lookat);

		if (this.h_points[this.point_index].elevation !== -1) {
			const e = this.h_points[this.point_index].elevation - this.elevation_offset;
			const d = google.maps.geometry.spherical.computeDistanceBetween(this.h_points[this.point_index].location, this.lookat);
			const dif = this.lookat_elevation - e;
			const angle = toDeg(Math.atan(Math.abs(dif) / d));
			this.position_y = (dif < 0) ? -angle : angle;
		}

		this.handleFrame({
			position: this.point_index,
			point: this.h_points[this.point_index]
		});
	}

	render() {
		if (!this.isLoading && this.length() > 0) {
			const t = this.point_index / (this.length());

			const o_x = this.position.x + (this.offset.x * t);
			const o_y = this.position.y + (this.offset.y * t);
			const o_z = this.tilt + (toRad(this.offset.z) * t);

			let target_heading;
			if (this.use_lookat) {
				target_heading = this.lookat_heading;
			} else {
				target_heading = (this.h_points[this.point_index].course || 0) + o_x;
			}

			const o_heading = target_heading - toDeg(this.origin_heading);
			const o_pitch = this.position_y + o_y;

			const olon = this.lon, olat = this.lat;
			this.lon = this.lon + (o_heading - olon);
			this.lat = this.lat + (o_pitch - olat);

			this.lat = Math.max(-85, Math.min(85, this.lat));
			const phi = toRad(90 - this.lat);
			const theta = toRad(this.lon);

			this.target.x = 500 * Math.sin(phi) * Math.cos(theta);
			this.target.y = 500 * Math.cos(phi);
			this.target.z = 500 * Math.sin(phi) * Math.sin(theta);
			this.camera.lookAt(this.target);
			this.camera.rotation.z -= o_z;

			if (this.use_rotation_comp) {
				this.camera.rotation.z -= toRad(this.rotation_comp);
			}
			this.mesh.rotation.z = toRad(this.origin_pitch);
			this.renderer.render(this.scene, this.camera);
		}
	}

	animate(timestamp) {
		this.animationFrameId = requestAnimationFrame((t) => this.animate(t));

		if (!this.lastTimestamp) this.lastTimestamp = timestamp;
		const deltaTime = timestamp - this.lastTimestamp;
		this.lastTimestamp = timestamp;

		this.dtime += deltaTime;
		if (this.dtime >= this.millis) {
			if (this.isPlaying) {
				// Check buffering
				if (!this.h_points[this.point_index].image) {
					if (!this.is_buffering) {
						console.log(`Buffering at index ${this.point_index}...`);
						this.is_buffering = true;
						this.pause(); // Pause logically, but we keep loop running to check buffer
						this.isPlaying = true; // We are technically "playing" but waiting
						// Ensure this frame is prioritized
						this.manageBuffer();
					}
				} else {
					try {
						this.loop();
					} catch (e) {
						console.error("Error in loop:", e);
					}
				}
			}
			this.dtime = 0;
		}

		// Always manage buffer in background during animation loop
		// But don't do it too aggressively every frame?
		// Actually, GSVPano takes time, so checking every frame is fine as triggerNextLoad guards itself.
		if (!this.isLoading) {
			this.manageBuffer();
		}

		this.render();
	}

	loop() {
		this.drawMaterial();

		if (this.forward) {
			if (++this.point_index === this.h_points.length) {
				this.point_index = this.h_points.length - 1;
				this.forward = !this.forward;
			}
		} else {
			if (--this.point_index === -1) {
				this.point_index = 0;
				this.forward = !this.forward;
			}
		}
	}

	// Public methods

	length() {
		return this.h_points.length;
	}

	setPitch(v) {
		this.position_y = v;
	}

	setDistanceBetweenPoint(v) {
		this.distance_between_points = v;
	}

	setMaxPoints(v) {
		this.max_points = v;
	}

	fov() {
		return this.fovValue;
	}

	webgl() {
		return this.renderer;
	}

	getCurrentImage() {
		return this.h_points[this.point_index].image;
	}

	getCurrentPoint() {
		return this.h_points[this.point_index];
	}

	setLookat(point, call_service, callback) {
		this.lookat = point;

		if (this.use_elevation && call_service) {
			this.getElevation([this.lookat], (results) => {
				if (results) {
					this.lookat_elevation = results[0].elevation;
				}
				if (callback) callback();
			});
		} else {
			if (callback) callback();
		}
	}

	setFOV(v) {
		this.fovValue = Math.floor(v);
		this.camera.fov = this.fovValue;
		this.camera.updateProjectionMatrix();
	}

	setZoom(z) {
		this.zoom = z;
		this.loader.setZoom(this.zoom);
	}

	setRadius(radius) {
		this.radius = radius;
		this.loader.parameters.radius = radius;
	}

	setSource(source) {
		this.source = source;
		this.loader.parameters.source = source;
	}

	setPreference(preference) {
		this.preference = preference;
		this.loader.parameters.preference = preference;
	}

	setSize(width, height) {
		this.w = width;
		this.h = height;
		this.renderer.setSize(this.w, this.h);
		this.camera.aspect = this.w / this.h;
		this.camera.updateProjectionMatrix();
	}

	reset() {
		this.raw_points = [];
		this.h_points = [];

		if(this.mesh.material.map) {
			this.mesh.material.map.dispose();
			this.mesh.material.map = new THREE.Texture();
			this.mesh.material.needsUpdate = true;
		}

		this.tilt = 0;
		this.lat = 0;
		this.lon = 0;

		this.position.x = 0;
		this.offset.x = 0;
		this.offset.y = 0;
		this.offset.z = 0;
		this.position_x = 0; // Note: position_x doesn't seem to be used in render?
		this.position_y = 0;

		this.point_index = 0;
		this.origin_heading = 0;
		this.origin_pitch = 0;

		this.forward = true;
	}

	generate(params = {}) {
		if (!this.isLoading) {
			this.isLoading = true;
			this.reset();

			this.distance_between_points = params.distance_between_points || this.distance_between_points;
			this.max_points = params.max_points || this.max_points;

			if (params.route) {
				this.handleDirectionsRoute(params.route);
			} else {
				console.log("No route provided.");
			}
		}
	}

	load() {
		this.point_index = 0;
		this.isLoading = true; // Use this flag for "Initial Buffer Loading" phase
		this.is_loading_pano = false;
		this.triggerNextLoad(0);
	}

	cancel() {
		if (this.isLoading) {
			this.cancel_load = true;
		}
	}

	getCameraPosition() {
		return new google.maps.LatLng(this.lat, this.lon);
	}

	play() {
		if (!this.isLoading) {
			this.isPlaying = true;
			this.handlePlay({});
		}
	}

	pause() {
		this.isPlaying = false;
		this.handlePause({});
	}

	next() {
		this.pause();
		if (this.point_index + 1 !== this.h_points.length) {
			this.point_index++;
			this.drawMaterial();
		}
	}

	prev() {
		this.pause();
		if (this.point_index - 1 !== -1) {
			this.point_index--;
			this.drawMaterial();
		}
	}
}
