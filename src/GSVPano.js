export const GSVPANO = {};

export class PanoLoader {
	constructor(parameters = {}) {
		this.parameters = parameters;
		this.zoom = parameters.zoom || 1;
		this.panoId = null;
		this.panoClient = new google.maps.StreetViewService();
		this.count = 0;
		this.total = 0;
		this.canvas = document.createElement('canvas');
		this.ctx = this.canvas.getContext('2d');
		this.rotation = 0;
		this.pitch = 0;
		this.copyright = '';
		this.onSizeChange = null;
		this.onPanoramaLoad = null;
		this.onProgress = null;
		this.onError = null;
		this.onPanoramaData = null;
		this.onNoPanoramaData = null;
		
		this.setZoom(this.zoom);
	}

	setProgress(p) {
		if (this.onProgress) {
			this.onProgress(p);
		}
	}

	throwError(message) {
		if (this.onError) {
			this.onError(message);
		} else {
			console.error(message);
		}
	}

	adaptTextureToZoom() {
		const w = 512 * Math.pow(2, this.zoom);
		const h = 512 * Math.pow(2, this.zoom - 1);
		this.canvas.width = w;
		this.canvas.height = h;
		// Fix from feature-zoom-control: Reset transform before applying new translation/scale
		this.ctx.setTransform(1, 0, 0, 1, 0, 0);
		this.ctx.translate(this.canvas.width, 0);
		this.ctx.scale(-1, 1);
	}

	composeFromTile(x, y, texture) {
		if (texture) {
			this.ctx.drawImage(texture, x * 512, y * 512);
		}
		this.count++;

		const p = Math.round(this.count * 100 / this.total);
		this.setProgress(p);

		if (this.count === this.total) {
			if (this.onPanoramaLoad) {
				this.onPanoramaLoad();
			}
		}
	}

	composePanorama(panoId) {
		this.setProgress(0);
		console.log('Loading panorama for zoom ' + this.zoom + '...');

		const w = Math.pow(2, this.zoom);
		const h = Math.pow(2, this.zoom - 1);
		
		this.count = 0;
		this.total = w * h;

		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				let url = `https://geo0.ggpht.com/cbk?cb_client=maps_sv.tactile&authuser=0&hl=en&gl=us&output=tile&panoid=${panoId}&x=${x}&y=${y}&zoom=${this.zoom}&nbt=1&fover=2`;

				// if (this.parameters.apiKey) {
				// 	url += `&key=${this.parameters.apiKey}`;
				// }

				const img = new Image();
				img.addEventListener('load', () => {
					this.composeFromTile(x, y, img);
				});
				img.addEventListener('error', () => {
					this.composeFromTile(x, y, null);
				});
				img.crossOrigin = 'anonymous';
				img.src = url;
			}
		}
	}

	load(location, callback) {
		console.log('Load for', location);

		const request = {
			location: location,
			radius: this.parameters.radius || 50
		};

		if (this.parameters.source) {
			request.source = this.parameters.source;
		}

		if (this.parameters.preference) {
			request.preference = this.parameters.preference;
		}

		this.panoClient.getPanorama(request, (result, status) => {
			if (status === google.maps.StreetViewStatus.OK) {
				if (this.onPanoramaData) this.onPanoramaData(result);

				if (result.tiles && result.tiles.centerHeading !== undefined) {
					this.rotation = result.tiles.centerHeading * Math.PI / 180.0;
					this.pitch = result.tiles.originPitch;
				} else {
					this.rotation = 0;
					this.pitch = 0;
				}

				this.copyright = result.copyright;
				this.panoId = result.location.pano;
				this.location = location;
				this.image_date = result.imageDate;
				this.id = this.panoId;

				callback();
			} else {
				if (this.onNoPanoramaData) this.onNoPanoramaData(status);
				this.throwError('Could not retrieve panorama for the following reason: ' + status);
				callback();
			}
		});
	}

	setZoom(z) {
		this.zoom = z;
		this.adaptTextureToZoom();
	}
}

// Maintain backward compatibility for now, but PanoLoader is also exported directly.
GSVPANO.PanoLoader = PanoLoader;
