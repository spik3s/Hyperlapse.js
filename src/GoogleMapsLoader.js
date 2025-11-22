export const loadGoogleMaps = (apiKey) => {
    return new Promise((resolve, reject) => {
        if (window.google && window.google.maps) {
            resolve(window.google.maps);
            return;
        }

        const existingScript = document.getElementById('google-maps-script');
        if (existingScript) {
            // If script exists but google.maps is not yet defined, wait for it.
            // We can piggyback on the global callback if it's still there,
            // or just check periodically.
            // Simple polling for this example:
            const interval = setInterval(() => {
                if (window.google && window.google.maps) {
                    clearInterval(interval);
                    resolve(window.google.maps);
                }
            }, 100);
            return;
        }

        const script = document.createElement('script');
        script.id = 'google-maps-script';
        script.type = 'text/javascript';
        script.src = `https://maps.googleapis.com/maps/api/js?v=3.exp&key=${apiKey}&libraries=marker,geometry&loading=async&callback=initGoogleMapsCallback`;
        script.onerror = reject;

        // Define global callback
        window.initGoogleMapsCallback = () => {
            resolve(window.google.maps);
            delete window.initGoogleMapsCallback;
        };

        document.head.appendChild(script);
    });
};
