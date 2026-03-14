/**
 * GeoExplorer — App Router & Initialization
 */
const App = (() => {
    let lastHighlightId = null;

    function showView(viewId) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        const view = document.getElementById(viewId);
        if (view) view.classList.add('active');
    }

        // Particle background
        createParticles();

        // Initialize I18n
        if (window.applyTranslations) window.applyTranslations();
        updateLangButtons();

        // We no longer read Mapillary token from localStorage as we use a default key
        // const savedToken = localStorage.getItem('mapillary_token') || '';
        // document.getElementById('mapillary-token')?.value = savedToken;
        const savedTimer = localStorage.getItem('geo_timer') || '120';
        document.getElementById('timer-duration').value = savedTimer;
        const savedName = localStorage.getItem('geo_player_name') || '';
        document.getElementById('multi-player-name').value = savedName;

        // Theme initialization
        const savedTheme = localStorage.getItem('geo_theme') || 'dark';
        if (savedTheme === 'light') {
            document.body.classList.add('theme-light');
        }
        updateThemeButton();

        // ══════════════════════════════
        //  NAVIGATION
        // ══════════════════════════════

        // Solo play
        document.getElementById('btn-play').addEventListener('click', () => {
            showView('game-view');
            GuessMap.initMinimap('minimap', () => {
                document.getElementById('btn-confirm-guess').disabled = false;
            });
            Game.start();
        });

        // Online play
        document.getElementById('btn-play-online').addEventListener('click', () => {
            showView('multiplayer-menu-view');
        });

        document.getElementById('btn-leaderboard').addEventListener('click', () => {
            Leaderboard.render(lastHighlightId);
            showView('leaderboard-view');
        });

        document.getElementById('btn-settings').addEventListener('click', () => {
            showView('settings-view');
        });

        document.getElementById('btn-back-settings').addEventListener('click', () => {
            showView('home-view');
        });

        document.getElementById('btn-back-leaderboard').addEventListener('click', () => {
            showView('home-view');
        });

        // Settings handlers (Mapillary removed, Timer remaining)

        document.getElementById('btn-save-timer').addEventListener('click', () => {
            const val = parseInt(document.getElementById('timer-duration').value);
            if (val >= 30 && val <= 600) {
                localStorage.setItem('geo_timer', val.toString());
                showTokenStatus('Durée du timer mise à jour : ' + val + 's', 'success');
            }
        });

        // Theme toggle
        const btnTheme = document.getElementById('btn-toggle-theme');
        if (btnTheme) {
            btnTheme.addEventListener('click', () => {
                const isLight = document.body.classList.toggle('theme-light');
                const newTheme = isLight ? 'light' : 'dark';
                localStorage.setItem('geo_theme', newTheme);
                updateThemeButton();
                
                // Refresh map tiles if possible
                if (window.GuessMap) GuessMap.refreshMinimap();
            });
        }

        // ══════════════════════════════
        //  GAME CONTROLS (solo + multi)
        // ══════════════════════════════

        document.getElementById('btn-confirm-guess').addEventListener('click', () => {
            // Collapse minimap if expanded
            document.getElementById('minimap-wrapper').classList.remove('expanded');
            document.getElementById('minimap-backdrop').classList.remove('visible');

            if (Multiplayer.getIsMultiplayer()) {
                Multiplayer.submitGuess();
            } else {
                Game.confirmGuess(false);
            }
        });

        document.getElementById('btn-next-round').addEventListener('click', () => {
            Game.nextRound();
        });

        // Minimap expand/collapse
        function toggleMinimap() {
            const wrapper = document.getElementById('minimap-wrapper');
            const backdrop = document.getElementById('minimap-backdrop');
            const isExpanded = wrapper.classList.contains('expanded');
            if (isExpanded) {
                wrapper.classList.remove('expanded');
                backdrop.classList.remove('visible');
            } else {
                wrapper.classList.add('expanded');
                backdrop.classList.add('visible');
            }
            setTimeout(() => GuessMap.refreshMinimap(), 400);
        }
        document.getElementById('minimap-toggle').addEventListener('click', toggleMinimap);
        document.getElementById('minimap-backdrop').addEventListener('click', toggleMinimap);

        // ══════════════════════════════
        //  SOLO FINAL RESULT
        // ══════════════════════════════

        document.getElementById('btn-save-score').addEventListener('click', () => {
            const name = document.getElementById('player-name').value.trim();
            if (!name) {
                document.getElementById('save-status').textContent = 'Entre un pseudo !';
                document.getElementById('save-status').className = 'token-status error';
                return;
            }
            lastHighlightId = Leaderboard.addScore(name, Game.totalScore(), Game.getRoundScores());
            document.getElementById('save-status').textContent = 'Score enregistré !';
            document.getElementById('save-status').className = 'token-status success';
            document.getElementById('btn-save-score').disabled = true;
        });

        document.getElementById('btn-play-again').addEventListener('click', () => {
            resetFinalView();
            showView('game-view');
            GuessMap.initMinimap('minimap', () => {
                document.getElementById('btn-confirm-guess').disabled = false;
            });
            Game.start();
        });

        document.getElementById('btn-final-leaderboard').addEventListener('click', () => {
            resetFinalView();
            Leaderboard.render(lastHighlightId);
            showView('leaderboard-view');
        });

        document.getElementById('btn-final-home').addEventListener('click', () => {
            resetFinalView();
            showView('home-view');
        });

        // ══════════════════════════════
        //  MULTIPLAYER
        // ══════════════════════════════

        document.getElementById('btn-back-multi-menu').addEventListener('click', () => {
            showView('home-view');
        });

        // Create lobby
        document.getElementById('btn-create-lobby').addEventListener('click', () => {
            const name = document.getElementById('multi-player-name').value.trim();
            if (!name) {
                document.getElementById('join-error').textContent = 'Entre un pseudo !';
                document.getElementById('join-error').className = 'token-status error';
                return;
            }
            localStorage.setItem('geo_player_name', name);
            const timer = parseInt(localStorage.getItem('geo_timer') || '120');
            Multiplayer.createLobby(name, timer);
        });

        // Join lobby
        document.getElementById('btn-join-lobby').addEventListener('click', () => {
            const name = document.getElementById('multi-player-name').value.trim();
            const code = document.getElementById('join-code').value.trim().toUpperCase();
            if (!name) {
                document.getElementById('join-error').textContent = 'Entre un pseudo !';
                document.getElementById('join-error').className = 'token-status error';
                return;
            }
            if (!code || code.length < 3) {
                document.getElementById('join-error').textContent = 'Entre un code de lobby valide.';
                document.getElementById('join-error').className = 'token-status error';
                return;
            }
            localStorage.setItem('geo_player_name', name);
            Multiplayer.joinLobby(code, name);
        });

        // Copy code
        document.getElementById('btn-copy-code').addEventListener('click', () => {
            const code = document.getElementById('lobby-code-display').textContent;
            navigator.clipboard.writeText(code).then(() => {
                document.getElementById('btn-copy-code').textContent = '✓';
                setTimeout(() => {
                    document.getElementById('btn-copy-code').textContent = '📋';
                }, 2000);
            });
        });

        // Start game (host)
        document.getElementById('btn-start-game').addEventListener('click', () => {
            Multiplayer.startGame();
        });

        // Leave lobby
        document.getElementById('btn-leave-lobby').addEventListener('click', () => {
            Multiplayer.leaveLobby();
            showView('home-view');
        });

        // Multi next round (host)
        document.getElementById('btn-multi-next-round').addEventListener('click', () => {
            Multiplayer.nextRound();
        });

        // Multi replay (host)
        document.getElementById('btn-multi-replay').addEventListener('click', () => {
            Multiplayer.backToLobby();
        });

        // Multi home
        document.getElementById('btn-multi-home').addEventListener('click', () => {
            Multiplayer.leaveLobby();
            showView('home-view');
        });
    function resetFinalView() {
        document.getElementById('player-name').value = '';
        const savedStatus = document.getElementById('save-status');
        if (savedStatus) savedStatus.textContent = '';
        document.getElementById('btn-save-score').disabled = false;
        document.getElementById('final-score-bar').style.width = '0%';
    }

    function showTokenStatus(msg, type) {
        const el = document.getElementById('save-status') || document.getElementById('join-error');
        if (el) {
            el.textContent = msg;
            el.className = 'token-status ' + type;
        }
    }

    function createParticles() {
        const container = document.getElementById('particles');
        if (!container) return;
        for (let i = 0; i < 40; i++) {
            const p = document.createElement('div');
            p.className = 'particle';
            p.style.left = Math.random() * 100 + '%';
            p.style.animationDuration = (4 + Math.random() * 6) + 's';
            p.style.animationDelay = (Math.random() * 8) + 's';
            p.style.width = (2 + Math.random() * 3) + 'px';
            p.style.height = p.style.width;
            container.appendChild(p);
        }
    }

    function updateThemeButton() {
        const btnTheme = document.getElementById('btn-toggle-theme');
        if (btnTheme) {
            const isLight = document.body.classList.contains('theme-light');
            const themeName = isLight ? (window.getCurrentLang() === 'fr' ? 'Clair' : 'Light') : (window.getCurrentLang() === 'fr' ? 'Sombre' : 'Dark');
            btnTheme.setAttribute('data-i18n-vars', JSON.stringify({ theme: themeName }));
            if (window.applyTranslations) window.applyTranslations();
        }
    }

    function updateLangButtons() {
        if (!window.getCurrentLang) return;
        const lang = window.getCurrentLang();
        document.querySelectorAll('.btn-lang').forEach(btn => {
            btn.classList.remove('active');
        });
        const activeBtn = document.getElementById('btn-lang-' + lang);
        if (activeBtn) activeBtn.classList.add('active');
    }

    return { showView, init, updateThemeButton, updateLangButtons };
})();

// Start the app
document.addEventListener('DOMContentLoaded', App.init);
