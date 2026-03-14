/**
 * GeoExplorer — Multiplayer Client (Socket.io)
 */
const Multiplayer = (() => {
    let socket = null;
    let isHost = false;
    let lobbyCode = '';
    let playerName = '';
    let isMultiplayer = false;

    function connect() {
        if (socket && socket.connected) return;
        socket = io();

        socket.on('connect', () => {
            console.log('[MP] Connected:', socket.id);
        });

        socket.on('disconnect', () => {
            console.log('[MP] Disconnected');
        });

        // ── Lobby events ──
        socket.on('playerList', (players) => {
            renderPlayerList(players);
        });

        socket.on('playerLeft', ({ playerId }) => {
            console.log('[MP] Player left:', playerId);
        });

        socket.on('backToLobby', (players) => {
            App.showView('lobby-view');
            renderPlayerList(players);
        });

        // ── Game events ──
        socket.on('roundStart', (data) => {
            handleRoundStart(data);
        });

        socket.on('timerSync', ({ timeLeft }) => {
            handleTimerSync(timeLeft);
        });

        socket.on('playerGuessed', ({ playerId, guessCount, totalPlayers }) => {
            const el = document.getElementById('multi-guess-status');
            if (el) el.textContent = guessCount + '/' + totalPlayers + ' ont répondu';
        });

        socket.on('roundEnd', (results) => {
            handleRoundEnd(results);
        });

        socket.on('gameFinished', (results) => {
            handleGameFinished(results);
        });
    }

    // ── Lobby actions ──
    function createLobby(name, timerDuration) {
        connect();
        playerName = name;
        const timer = parseInt(timerDuration) || 120;

        socket.emit('createLobby', { playerName: name, timerDuration: timer }, (res) => {
            if (res.success) {
                lobbyCode = res.code;
                isHost = true;
                isMultiplayer = true;
                document.getElementById('lobby-code-display').textContent = res.code;
                document.getElementById('btn-start-game').style.display = 'inline-flex';
                App.showView('lobby-view');
            } else {
                alert(res.error || 'Erreur lors de la création du lobby.');
            }
        });
    }

    function joinLobby(code, name) {
        connect();
        playerName = name;

        socket.emit('joinLobby', { code, playerName: name }, (res) => {
            if (res.success) {
                lobbyCode = res.code;
                isHost = false;
                isMultiplayer = true;
                document.getElementById('lobby-code-display').textContent = res.code;
                document.getElementById('btn-start-game').style.display = 'none';
                App.showView('lobby-view');
            } else {
                const el = document.getElementById('join-error');
                if (el) {
                    el.textContent = res.error;
                    el.className = 'token-status error';
                }
            }
        });
    }

    function startGame() {
        if (!isHost) return;
        socket.emit('startGame', null, (res) => {
            if (!res.success) alert(res.error);
        });
    }

    function leaveLobby() {
        if (socket) socket.emit('leaveLobby');
        isMultiplayer = false;
        lobbyCode = '';
        isHost = false;
    }

    // ── Game handlers ──
    function handleRoundStart(data) {
        App.showView('game-view');

        // Show loading
        document.getElementById('loading-overlay').classList.remove('hidden');
        document.getElementById('loading-sub').textContent =
            'Chargement de la manche ' + data.round + '...';

        // Update HUD
        document.getElementById('current-round').textContent = data.round;
        document.getElementById('total-rounds').textContent = data.totalRounds;
        document.getElementById('multi-guess-status').textContent = '';

        // Reset minimap
        GuessMap.resetMinimap();
        document.getElementById('btn-confirm-guess').disabled = true;

        // Init minimap if needed
        GuessMap.initMinimap('minimap', () => {
            document.getElementById('btn-confirm-guess').disabled = false;
        });

        // Load Mapillary at this location
        const token = localStorage.getItem('mapillary_token') || '';
        StreetView.init('streetview-container', token);

        StreetView.loadLocation('streetview-container', data.lat, data.lng)
            .then((loaded) => {
                if (loaded) {
                    document.getElementById('loading-overlay').classList.add('hidden');
                    GuessMap.refreshMinimap();
                } else {
                    document.getElementById('loading-sub').textContent =
                        'Pas d\'image disponible — en attente du résultat...';
                }
            })
            .catch(() => {
                document.getElementById('loading-sub').textContent =
                    'Erreur de chargement. Le round continue...';
            });

        document.getElementById('live-leaderboard').style.display = 'block';

        // Timer will be synced by server via timerSync events
        multiTimerDuration = data.timerDuration;
    }

    let multiTimerDuration = 120;
    
    // Track if user has submitted
    let roundSubmitted = false;
    
    // Update live leaderboard
    function updateLiveLeaderboard(players) {
        const list = document.getElementById('live-leaderboard-list');
        if (!list) return;
        
        // Sort by total score descending
        const sorted = [...players].sort((a, b) => b.totalScore - a.totalScore);
        
        list.innerHTML = '';
        sorted.forEach((p, i) => {
            const isSelf = socket && p.id === socket.id;
            const li = document.createElement('li');
            li.className = 'llb-item' + (isSelf ? ' is-self' : '');
            li.innerHTML = `
                <span class="llb-name">${i+1}. ${escapeHtml(p.name)}</span>
                <span class="llb-score">${p.totalScore.toLocaleString('fr-FR')}</span>
            `;
            list.appendChild(li);
        });
    }

    function handleTimerSync(timeLeft) {
        const pct = (timeLeft / multiTimerDuration) * 100;
        const timerBar = document.getElementById('timer-bar');
        const timerText = document.getElementById('timer-text');

        if (timerBar) {
            timerBar.style.width = pct + '%';
            if (pct <= 15) timerBar.className = 'timer-bar danger';
            else if (pct <= 40) timerBar.className = 'timer-bar warning';
            else timerBar.className = 'timer-bar';
        }
        if (timerText) {
            const m = Math.floor(timeLeft / 60);
            const s = timeLeft % 60;
            timerText.textContent = m + ':' + (s < 10 ? '0' : '') + s;
        }

        // Auto-submit on expiration
        if (timeLeft <= 0 && !roundSubmitted) {
            submitGuess(true); // force auto-submit if a marker exists
        }
    }

    function submitGuess(isAuto = false) {
        const guess = GuessMap.getGuess();
        roundSubmitted = true;
        
        if (guess) {
            socket.emit('submitGuess', { lat: guess.lat, lng: guess.lng });
            document.getElementById('btn-confirm-guess').textContent = '✓ Envoyé — en attente...';
        } else {
            // Send empty coordinates to signal round is over for them
            socket.emit('submitGuess', { lat: 0, lng: 0 }); 
            document.getElementById('btn-confirm-guess').textContent = '— Temps écoulé —';
        }
        
        // Disable further guessing
        document.getElementById('btn-confirm-guess').disabled = true;
    }

    function handleRoundEnd(results) {
        StreetView.destroy();
        App.showView('multi-round-result-view');
        
        // Reset submittal status
        roundSubmitted = false;
        
        // Location name
        document.getElementById('multi-result-location').textContent =
            results.location.name + ', ' + results.location.country;

        // Round info
        document.getElementById('multi-result-round').textContent =
            'Manche ' + results.round + '/' + results.totalRounds;

        // Player results table
        const tbody = document.getElementById('multi-result-tbody');
        tbody.innerHTML = '';
        results.players.forEach((p, i) => {
            const tr = document.createElement('tr');
            const isSelf = socket && p.playerId === socket.id;
            if (isSelf) tr.className = 'highlight';

            let distText;
            if (p.distance < 1) distText = '< 1 km';
            else distText = p.distance.toLocaleString('fr-FR') + ' km';

            tr.innerHTML =
                '<td class="rank-cell">' + (i + 1) + '</td>' +
                '<td>' + escapeHtml(p.playerName) + (isSelf ? ' (toi)' : '') + '</td>' +
                '<td>' + distText + '</td>' +
                '<td class="score-cell">' + p.score.toLocaleString('fr-FR') + '</td>' +
                '<td class="score-cell">' + p.totalScore.toLocaleString('fr-FR') + '</td>';
            tbody.appendChild(tr);
        });

        // Show result map with all guesses
        showMultiResultMap(results);

        // Next round button (host only)
        const nextBtn = document.getElementById('btn-multi-next-round');
        if (isHost) {
            nextBtn.style.display = 'inline-flex';
            nextBtn.textContent = results.round >= results.totalRounds
                ? 'Voir le résultat final →' : 'Manche suivante →';
        } else {
            nextBtn.style.display = 'none';
            document.getElementById('multi-waiting-host').style.display = 'block';
        }

        // Reset confirm button text
        document.getElementById('btn-confirm-guess').textContent = '✓ Confirmer ma position';
    }

    function showMultiResultMap(results) {
        GuessMap.destroyResult();

        const container = document.getElementById('multi-result-map');
        if (!container) return;

        const map = L.map(container, { zoomControl: true, attributionControl: false });

        L.tileLayer(getTileUrl(), {
            subdomains: 'abcd', maxZoom: 19,
        }).addTo(map);

        const loc = results.location;
        const colors = ['#00d4aa', '#7c3aed', '#f59e0b', '#ef4444'];
        const allPoints = [[loc.lat, loc.lng]];

        // Actual location
        L.marker([loc.lat, loc.lng], {
            icon: L.divIcon({
                className: 'actual-marker',
                html: '<div style="width:22px;height:22px;background:#ef4444;border:3px solid #fff;border-radius:50%;box-shadow:0 0 12px rgba(239,68,68,0.6)"></div>',
                iconSize: [22, 22], iconAnchor: [11, 11],
            })
        }).addTo(map).bindTooltip('<strong>' + loc.name + '</strong><br>Position réelle', { 
            direction: 'top', className: 'player-tooltip', permanent: false 
        });

        // Player guesses
        results.players.forEach((p, i) => {
            if (p.guessLat === 0 && p.guessLng === 0) return;
            const color = colors[i % colors.length];
            allPoints.push([p.guessLat, p.guessLng]);

            L.marker([p.guessLat, p.guessLng], {
                icon: L.divIcon({
                    className: 'guess-marker',
                    html: '<div style="width:18px;height:18px;background:' + color + ';border:3px solid #fff;border-radius:50%;box-shadow:0 0 10px ' + color + '80"></div>',
                    iconSize: [18, 18], iconAnchor: [9, 9],
                })
            }).addTo(map).bindTooltip('<strong>' + escapeHtml(p.playerName) + '</strong><br>' + p.score + ' pts', { 
                permanent: true, direction: 'top', className: 'player-tooltip', offset: [0, -10]
            });

            L.polyline([[loc.lat, loc.lng], [p.guessLat, p.guessLng]], {
                color: color, weight: 2, dashArray: '6, 6', opacity: 0.7,
            }).addTo(map);
        });

        if (allPoints.length > 1) {
            map.fitBounds(allPoints, { padding: [50, 50], maxZoom: 10 });
        } else {
            map.setView([loc.lat, loc.lng], 5);
        }
        setTimeout(() => map.invalidateSize(), 200);

        // Store map ref for cleanup
        Multiplayer._resultMap = map;
    }

    function handleGameFinished(results) {
        App.showView('multi-final-view');

        // Podium
        const podium = document.getElementById('multi-podium');
        podium.innerHTML = '';

        const medals = ['🥇', '🥈', '🥉', '4️⃣'];
        results.players.forEach((p, i) => {
            const isSelf = socket && p.id === socket.id;
            const div = document.createElement('div');
            div.className = 'podium-player' + (i === 0 ? ' podium-first' : '') + (isSelf ? ' podium-self' : '');
            div.innerHTML =
                '<span class="podium-medal">' + (medals[i] || (i + 1)) + '</span>' +
                '<span class="podium-name">' + escapeHtml(p.name) + (isSelf ? ' (toi)' : '') + '</span>' +
                '<span class="podium-score">' + p.totalScore.toLocaleString('fr-FR') + '</span>';
            podium.appendChild(div);
        });

        // Round breakdown
        const breakdown = document.getElementById('multi-final-breakdown');
        breakdown.innerHTML = '';
        results.rounds.forEach((r) => {
            const row = document.createElement('div');
            row.className = 'breakdown-row';
            const winner = r.players[0];
            row.innerHTML =
                '<span class="breakdown-round">Manche ' + r.round + '</span>' +
                '<span class="breakdown-location">' + r.location.name + ', ' + r.location.country + '</span>' +
                '<span class="breakdown-score">🏆 ' + escapeHtml(winner.playerName) + '</span>';
            breakdown.appendChild(row);
        });

        // Host can replay
        document.getElementById('btn-multi-replay').style.display = isHost ? 'inline-flex' : 'none';
    }

    function nextRound() {
        if (!isHost) return;
        if (Multiplayer._resultMap) {
            Multiplayer._resultMap.remove();
            Multiplayer._resultMap = null;
        }
        socket.emit('nextRound');
    }

    function backToLobby() {
        if (!isHost) return;
        socket.emit('backToLobby');
    }

    // ── Render ──
    function renderPlayerList(players) {
        const list = document.getElementById('lobby-player-list');
        if (!list) return;
        list.innerHTML = '';

        const colors = ['#00d4aa', '#7c3aed', '#f59e0b', '#ef4444'];
        players.forEach((p, i) => {
            const div = document.createElement('div');
            div.className = 'lobby-player';
            const isSelf = socket && p.id === socket.id;
            div.innerHTML =
                '<div class="player-avatar" style="background:' + colors[i] + '">' +
                    p.name.charAt(0).toUpperCase() +
                '</div>' +
                '<span class="player-name">' + escapeHtml(p.name) +
                    (isSelf ? ' (toi)' : '') +
                    (p.isHost ? ' 👑' : '') +
                '</span>';
            list.appendChild(div);
        });

        // Update live leaderboard
        updateLiveLeaderboard(players);

        // Update player count
        const countEl = document.getElementById('lobby-player-count');
        if (countEl) countEl.textContent = players.length + '/8';
    }

    function escapeHtml(s) {
        const div = document.createElement('div');
        div.textContent = s;
        return div.innerHTML;
    }

    function getIsMultiplayer() { return isMultiplayer; }
    function getIsHost() { return isHost; }

    return {
        connect, createLobby, joinLobby, startGame, leaveLobby,
        submitGuess, nextRound, backToLobby,
        getIsMultiplayer, getIsHost,
        _resultMap: null,
    };
})();
