/**
 * GeoExplorer — Leaflet Guess Map
 */
const GuessMap = (() => {
    let minimap = null;
    let guessMarker = null;
    let resultMap = null;
    let onGuessPlaced = null;

    const MARKER_ICON = L.divIcon({
        className: 'guess-marker',
        html: '<div style="width:20px;height:20px;background:#00d4aa;border:3px solid #fff;border-radius:50%;box-shadow:0 0 12px rgba(0,212,170,0.6)"></div>',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
    });

    const ACTUAL_ICON = L.divIcon({
        className: 'actual-marker',
        html: '<div style="width:20px;height:20px;background:#ef4444;border:3px solid #fff;border-radius:50%;box-shadow:0 0 12px rgba(239,68,68,0.6)"></div>',
        iconSize: [20, 20],
        iconAnchor: [10, 10],
    });

    // Helper to get correct tile URL based on theme
    window.getTileUrl = function() {
        const style = document.body.classList.contains('theme-light') ? 'light_all' : 'dark_all';
        return `https://{s}.basemaps.cartocdn.com/${style}/{z}/{x}/{y}{r}.png`;
    };

    function initMinimap(containerId, callback) {
        onGuessPlaced = callback;
        if (minimap) { minimap.remove(); minimap = null; }

        minimap = L.map(containerId, {
            center: [20, 0], zoom: 1, minZoom: 1, maxZoom: 18,
            zoomControl: true, attributionControl: false, worldCopyJump: true,
        });

        L.tileLayer(getTileUrl(), {
            subdomains: 'abcd', maxZoom: 19,
        }).addTo(minimap);

        minimap.on('click', (e) => placeGuess(e.latlng.lat, e.latlng.lng));
        setTimeout(() => minimap.invalidateSize(), 200);
    }

    function placeGuess(lat, lng) {
        if (guessMarker) {
            guessMarker.setLatLng([lat, lng]);
        } else {
            guessMarker = L.marker([lat, lng], { icon: MARKER_ICON, draggable: true }).addTo(minimap);
            guessMarker.on('dragend', () => { if (onGuessPlaced) onGuessPlaced(); });
        }
        if (onGuessPlaced) onGuessPlaced();
    }

    function getGuess() {
        if (!guessMarker) return null;
        const pos = guessMarker.getLatLng();
        return { lat: pos.lat, lng: pos.lng };
    }

    function resetMinimap() {
        if (guessMarker && minimap) minimap.removeLayer(guessMarker);
        guessMarker = null;
        if (minimap) { minimap.setView([20, 0], 1); minimap.invalidateSize(); }
    }

    function showResult(containerId, actualLat, actualLng, guessLat, guessLng, locationName) {
        if (resultMap) { resultMap.remove(); resultMap = null; }

        resultMap = L.map(document.getElementById(containerId), {
            zoomControl: true, attributionControl: false,
        });

        L.tileLayer(getTileUrl(), {
            subdomains: 'abcd', maxZoom: 19,
        }).addTo(resultMap);

        L.marker([actualLat, actualLng], { icon: ACTUAL_ICON }).addTo(resultMap)
            .bindPopup('<strong>' + locationName + '</strong><br>Position réelle');

        L.marker([guessLat, guessLng], { icon: MARKER_ICON }).addTo(resultMap)
            .bindPopup('Ton estimation');

        L.polyline([[actualLat, actualLng], [guessLat, guessLng]], {
            color: '#f59e0b', weight: 2, dashArray: '8, 8', opacity: 0.8,
        }).addTo(resultMap);

        const bounds = L.latLngBounds([actualLat, actualLng], [guessLat, guessLng]);
        resultMap.fitBounds(bounds, { padding: [60, 60], maxZoom: 10 });
        setTimeout(() => resultMap.invalidateSize(), 200);
    }

    function destroyResult() {
        if (resultMap) { resultMap.remove(); resultMap = null; }
    }

    function refreshMinimap() {
        if (minimap) setTimeout(() => minimap.invalidateSize(), 100);
    }

    return { initMinimap, placeGuess, getGuess, resetMinimap, showResult, destroyResult, refreshMinimap };
})();
