/**
 * GeoExplorer — Mapillary Street-level Viewer
 * Wraps MapillaryJS v4 to display navigable street-level imagery.
 */
const StreetView = (() => {
    let viewer = null;
    let accessToken = 'MLY|34234322626211626|dd647aaf2301c71a0eacd7ef22cf5c60';

    /**
     * Initialize the Mapillary viewer instance.
     */
    function init(containerId, token) {
        if (token) accessToken = token; // Allow override, but use default otherwise
        // We don't create the viewer until we have an image ID
    }

    /**
     * Search for the closest Mapillary image near given coordinates.
     * Tries progressively wider bounding boxes.
     */
    async function findNearbyImage(lat, lng) {
        const radiuses = [0.005, 0.01, 0.025, 0.05, 0.1, 0.3, 0.5];

        for (const r of radiuses) {
            const bbox = `${lng - r},${lat - r},${lng + r},${lat + r}`;
            const url = `https://graph.mapillary.com/images?access_token=${accessToken}&fields=id,geometry,computed_geometry,thumb_1024_url&bbox=${bbox}&limit=10`;

            try {
                const res = await fetch(url);
                if (!res.ok) {
                    if (res.status === 401) throw new Error('TOKEN_INVALID');
                    continue;
                }
                const data = await res.json();
                if (data.data && data.data.length > 0) {
                    // Find the closest image to target
                    let closest = data.data[0];
                    let closestDist = Infinity;
                    for (const img of data.data) {
                        const geom = img.computed_geometry || img.geometry;
                        if (!geom) continue;
                        const [imgLng, imgLat] = geom.coordinates;
                        const dist = Math.sqrt(
                            Math.pow(imgLat - lat, 2) + Math.pow(imgLng - lng, 2)
                        );
                        if (dist < closestDist) {
                            closestDist = dist;
                            closest = img;
                        }
                    }
                    return closest.id;
                }
            } catch (e) {
                if (e.message === 'TOKEN_INVALID') throw e;
                console.warn('Mapillary API error:', e);
            }
        }
        return null;
    }

    /**
     * Load a location into the viewer by finding a nearby Mapillary image.
     * Returns true if successfully loaded, false if no coverage.
     */
    async function loadLocation(containerId, lat, lng) {
        const imageId = await findNearbyImage(lat, lng);
        if (!imageId) return false;

        const container = document.getElementById(containerId);
        if (!container) return false;

        // Destroy previous viewer if it exists
        if (viewer) {
            try { viewer.remove(); } catch (e) { /* ignore */ }
            viewer = null;
        }

        // Clear the container
        container.innerHTML = '';

        try {
            viewer = new mapillary.Viewer({
                accessToken: accessToken,
                container: container,
                imageId: imageId,
                component: {
                    cover: false,
                    // Hide elements that could reveal location
                    attribution: false,
                    bearing: true,
                    cache: true,
                    direction: true,
                    keyboard: true,
                    pointer: true,
                    sequence: true,
                    zoom: true,
                    tag: false,
                    popup: false,
                },
            });

            // Remove image details component if available
            try {
                viewer.deactivateComponent('attribution');
            } catch (e) { /* not critical */ }

            // Handle resize
            window.addEventListener('resize', () => {
                if (viewer) viewer.resize();
            });

            return true;
        } catch (e) {
            console.error('Failed to create Mapillary viewer:', e);
            return false;
        }
    }

    /**
     * Destroy the current viewer.
     */
    function destroy() {
        if (viewer) {
            try { viewer.remove(); } catch (e) { /* ignore */ }
            viewer = null;
        }
    }

    /**
     * Resize the viewer (call after layout changes).
     */
    function resize() {
        if (viewer) {
            try { viewer.resize(); } catch (e) { /* ignore */ }
        }
    }

    return { init, loadLocation, destroy, resize };
})();
