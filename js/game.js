/**
 * GeoExplorer — Game Engine
 */
const Game = (() => {
    const TOTAL_ROUNDS = 5;
    let timerDuration = 120;
    let currentRound = 0;
    let locations = [];
    let roundScores = [];
    let timerInterval = null;
    let timeLeft = 0;
    let gameActive = false;

    function haversine(lat1, lng1, lat2, lng2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLng = (lng2 - lng1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng / 2) ** 2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function calcScore(distKm) {
        if (distKm < 1) return 5000;
        return Math.round(5000 * Math.exp(-distKm / 1500));
    }

    function formatTime(s) {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return m + ':' + (sec < 10 ? '0' : '') + sec;
    }

    function totalScore() {
        return roundScores.reduce((a, b) => a + b.score, 0);
    }

    async function start() {
        timerDuration = parseInt(localStorage.getItem('geo_timer') || '120');
        locations = pickRandomLocations(TOTAL_ROUNDS + 5); // extras as backup
        currentRound = 0;
        roundScores = [];
        gameActive = true;
        updateHUD();
        await loadRound();
    }

    async function loadRound() {
        if (currentRound >= TOTAL_ROUNDS) { endGame(); return; }

        // Show loading
        document.getElementById('loading-overlay').classList.remove('hidden');
        document.getElementById('loading-sub').textContent = '';

        // Reset minimap
        GuessMap.resetMinimap();
        document.getElementById('btn-confirm-guess').disabled = true;

        // Try to load a location with Mapillary coverage
        let loaded = false;
        let locationIndex = currentRound;

        while (!loaded && locationIndex < locations.length) {
            const loc = locations[locationIndex];
            document.getElementById('loading-sub').textContent =
                'Recherche d\'images pour la manche ' + (currentRound + 1) + '...';

            const token = localStorage.getItem('mapillary_token') || '';
            StreetView.init('streetview-container', token);

            try {
                loaded = await StreetView.loadLocation('streetview-container', loc.lat, loc.lng);
            } catch (e) {
                if (e.message === 'TOKEN_INVALID') {
                    document.getElementById('loading-sub').textContent =
                        'Token Mapillary invalide. Vérifie tes paramètres.';
                    return;
                }
            }

            if (!loaded) {
                // Swap this location with a backup
                if (locationIndex > currentRound) {
                    locations[currentRound] = locations[locationIndex];
                }
                locationIndex++;
            }
        }

        if (!loaded) {
            document.getElementById('loading-sub').textContent =
                'Aucune image disponible. Essaie de rejouer.';
            return;
        }

        // Ensure the correct location is at currentRound
        if (locationIndex !== currentRound) {
            locations[currentRound] = locations[locationIndex];
        }

        // Hide loading
        document.getElementById('loading-overlay').classList.add('hidden');

        // Update HUD
        updateHUD();

        // Refresh minimap
        GuessMap.refreshMinimap();

        // Start timer
        startTimer();
    }

    function updateHUD() {
        document.getElementById('current-round').textContent = currentRound + 1;
        document.getElementById('total-rounds').textContent = TOTAL_ROUNDS;
        document.getElementById('hud-score').textContent =
            totalScore().toLocaleString('fr-FR');
    }

    function startTimer() {
        timeLeft = timerDuration;
        const timerBar = document.getElementById('timer-bar');
        const timerText = document.getElementById('timer-text');

        timerBar.style.width = '100%';
        timerBar.className = 'timer-bar';
        timerText.textContent = formatTime(timeLeft);

        if (timerInterval) clearInterval(timerInterval);

        timerInterval = setInterval(() => {
            timeLeft--;
            if (timeLeft < 0) timeLeft = 0;

            const pct = (timeLeft / timerDuration) * 100;
            timerBar.style.width = pct + '%';
            timerText.textContent = formatTime(timeLeft);

            // Color changes
            if (pct <= 15) {
                timerBar.className = 'timer-bar danger';
            } else if (pct <= 40) {
                timerBar.className = 'timer-bar warning';
            }

            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                timerInterval = null;
                confirmGuess(true);
            }
        }, 1000);
    }

    function stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }

    function confirmGuess(timedOut) {
        stopTimer();
        const loc = locations[currentRound];
        const guess = GuessMap.getGuess();

        let distance = 0;
        let score = 0;
        let guessLat = 0, guessLng = 0;

        if (guess) {
            guessLat = guess.lat;
            guessLng = guess.lng;
            distance = haversine(loc.lat, loc.lng, guessLat, guessLng);
            score = calcScore(distance);
        }

        roundScores.push({
            round: currentRound + 1,
            location: loc,
            distance: distance,
            score: score,
            guessLat: guessLat,
            guessLng: guessLng,
            timedOut: timedOut && !guess,
        });

        showRoundResult(loc, guessLat, guessLng, distance, score);
    }

    function showRoundResult(loc, guessLat, guessLng, distance, score) {
        StreetView.destroy();
        App.showView('round-result-view');

        // Location name
        document.getElementById('result-location-name').textContent =
            loc.name + ', ' + loc.country;

        // Distance
        let distText;
        if (distance < 1) distText = Math.round(distance * 1000) + ' m';
        else if (distance < 100) distText = distance.toFixed(1) + ' km';
        else distText = Math.round(distance).toLocaleString('fr-FR') + ' km';
        document.getElementById('result-distance').textContent = distText;

        // Score with animation
        const scoreEl = document.getElementById('result-score');
        animateNumber(scoreEl, 0, score, 800);

        // Round dots
        const dotsContainer = document.getElementById('rounds-dots');
        dotsContainer.innerHTML = '';
        for (let i = 0; i < TOTAL_ROUNDS; i++) {
            const dot = document.createElement('div');
            dot.className = 'round-dot';
            if (i < roundScores.length) dot.classList.add('completed');
            else if (i === roundScores.length) dot.classList.add('current');
            dotsContainer.appendChild(dot);
        }

        // Button text
        const btn = document.getElementById('btn-next-round');
        btn.textContent = currentRound + 1 >= TOTAL_ROUNDS
            ? 'Voir le résultat final →' : 'Manche suivante →';

        // Show result map
        GuessMap.showResult('result-map', loc.lat, loc.lng, guessLat, guessLng,
            loc.name + ', ' + loc.country);
    }

    function animateNumber(el, from, to, duration) {
        const start = performance.now();
        const update = (now) => {
            const elapsed = now - start;
            const pct = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - pct, 3);
            el.textContent = Math.round(from + (to - from) * eased).toLocaleString('fr-FR');
            if (pct < 1) requestAnimationFrame(update);
        };
        requestAnimationFrame(update);
    }

    function nextRound() {
        GuessMap.destroyResult();
        currentRound++;
        if (currentRound >= TOTAL_ROUNDS) {
            endGame();
        } else {
            App.showView('game-view');
            loadRound();
        }
    }

    function endGame() {
        gameActive = false;
        App.showView('final-result-view');

        const total = totalScore();

        // Animate total score
        const totalEl = document.getElementById('final-total-score');
        animateNumber(totalEl, 0, total, 1200);

        // Score bar
        setTimeout(() => {
            const bar = document.getElementById('final-score-bar');
            bar.style.width = (total / 25000 * 100) + '%';
        }, 300);

        // Breakdown
        const breakdown = document.getElementById('final-rounds-breakdown');
        breakdown.innerHTML = '';
        roundScores.forEach((r) => {
            const row = document.createElement('div');
            row.className = 'breakdown-row';
            row.innerHTML =
                '<span class="breakdown-round">Manche ' + r.round + '</span>' +
                '<span class="breakdown-location">' + r.location.name + ', ' + r.location.country + '</span>' +
                '<span class="breakdown-score">' + r.score.toLocaleString('fr-FR') + '</span>';
            breakdown.appendChild(row);
        });
    }

    function getRoundScores() { return roundScores; }

    return { start, confirmGuess, nextRound, getRoundScores, totalScore };
})();
