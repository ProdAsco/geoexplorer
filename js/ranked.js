/**
 * GeoExplorer — Ranked System (ELO + Ranks)
 */
const Ranked = (() => {
    // Rank thresholds
    const RANKS = [
        { name: 'Bronze', min: 0, max: 1099, color: '#cd7f32', emoji: '🥉' },
        { name: 'Silver', min: 1100, max: 1299, color: '#c0c0c0', emoji: '🥈' },
        { name: 'Gold', min: 1300, max: 1499, color: '#ffd700', emoji: '🥇' },
        { name: 'Platinum', min: 1500, max: 1799, color: '#00bcd4', emoji: '💎' },
        { name: 'Diamond', min: 1800, max: 9999, color: '#9c27b0', emoji: '👑' },
    ];

    // Benchmark: 3000 pts out of 5000 per round = 15000/25000 total = decent game
    const BENCHMARK_SCORE = 15000;
    const MAX_SCORE = 25000;

    /**
     * Calculate new ELO rating after a game.
     * @param {number} currentElo - Current ELO rating
     * @param {number} gameScore - Score obtained (0-25000)
     * @returns {{ newElo: number, eloDelta: number, isWin: boolean }}
     */
    function calculateElo(currentElo, gameScore) {
        // Performance ratio: how well the player did vs benchmark
        const performance = gameScore / BENCHMARK_SCORE; // >1 = good, <1 = bad

        // K-factor: higher for lower ranks, lower for higher ranks
        let kFactor = 40;
        if (currentElo >= 1500) kFactor = 30;
        if (currentElo >= 1800) kFactor = 20;

        // Expected score based on current ELO (normalized)
        const expectedPerformance = currentElo / 1500; // 1500 = Gold threshold

        // ELO delta calculation
        let delta = Math.round(kFactor * (performance - expectedPerformance));

        // Cap gains/losses
        delta = Math.max(-30, Math.min(50, delta));

        // Minimum floor at 0
        const newElo = Math.max(0, currentElo + delta);

        // A "win" is scoring above the benchmark
        const isWin = gameScore >= BENCHMARK_SCORE;

        return { newElo, eloDelta: delta, isWin };
    }

    /**
     * Get the rank for a given ELO rating
     */
    function getRankForElo(elo) {
        for (const rank of RANKS) {
            if (elo >= rank.min && elo <= rank.max) return rank;
        }
        return RANKS[0]; // fallback to Bronze
    }

    /**
     * Process a ranked game result
     * @param {number} gameScore - Total score from the game (0-25000)
     */
    async function processGameResult(gameScore) {
        if (!SupabaseClient.isLoggedIn()) return null;

        const profile = SupabaseClient.getProfile();
        if (!profile) return null;

        const currentElo = profile.elo_rating || 1000;
        const currentRank = profile.rank || 'Bronze';

        // Calculate new ELO
        const { newElo, eloDelta, isWin } = calculateElo(currentElo, gameScore);
        const newRankObj = getRankForElo(newElo);
        const newRank = newRankObj.name;

        // Save ranked game to history
        await SupabaseClient.saveRankedGame(
            gameScore, currentElo, newElo, currentRank, newRank, isWin
        );

        // Update profile
        const updates = {
            elo_rating: newElo,
            rank: newRank,
            games_played: (profile.games_played || 0) + 1,
        };
        if (isWin) {
            updates.wins = (profile.wins || 0) + 1;
        } else {
            updates.losses = (profile.losses || 0) + 1;
        }

        await SupabaseClient.updateProfile(updates);

        return {
            eloBefore: currentElo,
            eloAfter: newElo,
            eloDelta,
            rankBefore: currentRank,
            rankAfter: newRank,
            isWin,
            rankChanged: currentRank !== newRank,
        };
    }

    /**
     * Render rank badge HTML
     */
    function renderRankBadge(rank, size = 'normal') {
        const rankObj = RANKS.find(r => r.name === rank) || RANKS[0];
        const sizeClass = size === 'large' ? 'rank-badge-lg' : 'rank-badge-sm';
        return `<span class="rank-badge ${sizeClass}" style="--rank-color: ${rankObj.color}">
            <span class="rank-emoji">${rankObj.emoji}</span>
            <span class="rank-name">${rankObj.name}</span>
        </span>`;
    }

    /**
     * Render the ranked result overlay after a game
     */
    function showRankedResult(result) {
        const overlay = document.getElementById('ranked-result-overlay');
        if (!overlay) return;

        const eloChange = document.getElementById('ranked-elo-change');
        const rankDisplay = document.getElementById('ranked-rank-display');
        const rankChangeMsg = document.getElementById('ranked-rank-change');

        if (eloChange) {
            const sign = result.eloDelta >= 0 ? '+' : '';
            eloChange.textContent = sign + result.eloDelta + ' ELO';
            eloChange.className = 'elo-change ' + (result.eloDelta >= 0 ? 'positive' : 'negative');
        }

        if (rankDisplay) {
            rankDisplay.innerHTML = renderRankBadge(result.rankAfter, 'large');
        }

        if (rankChangeMsg) {
            if (result.rankChanged) {
                const direction = result.eloAfter > result.eloBefore ? '⬆️ Promotion' : '⬇️ Rétrogradation';
                rankChangeMsg.textContent = direction + ' : ' + result.rankBefore + ' → ' + result.rankAfter;
                rankChangeMsg.className = 'rank-change-msg ' + (result.eloAfter > result.eloBefore ? 'promotion' : 'demotion');
            } else {
                rankChangeMsg.textContent = '';
            }
        }

        overlay.classList.remove('hidden');
        // Auto-hide after 5 seconds
        setTimeout(() => {
            overlay.classList.add('hidden');
        }, 5000);
    }

    /**
     * Render the profile page
     */
    async function renderProfile() {
        const profile = SupabaseClient.getProfile();
        if (!profile) return;

        const rankObj = getRankForElo(profile.elo_rating);
        const winrate = profile.games_played > 0
            ? Math.round((profile.wins / profile.games_played) * 100) : 0;

        // Profile banner
        const banner = document.getElementById('profile-banner');
        if (banner) {
            banner.style.setProperty('--rank-accent', rankObj.color);
            document.getElementById('profile-username').textContent = profile.username;
            document.getElementById('profile-rank-badge').innerHTML = renderRankBadge(profile.rank, 'large');
            document.getElementById('profile-elo').textContent = profile.elo_rating + ' ELO';
        }

        // Stats
        const statsContainer = document.getElementById('profile-stats');
        if (statsContainer) {
            document.getElementById('stat-wins').textContent = profile.wins || 0;
            document.getElementById('stat-games').textContent = profile.games_played || 0;
            document.getElementById('stat-winrate').textContent = winrate + '%';
            document.getElementById('stat-rank').innerHTML = renderRankBadge(profile.rank);
        }

        // Load ELO progression chart
        const history = await SupabaseClient.getGameHistory(30);
        renderEloChart(history);
    }

    /**
     * Render the ELO progression Chart.js chart
     */
    function renderEloChart(history) {
        const canvas = document.getElementById('elo-chart');
        if (!canvas || !history.length) return;

        // Destroy existing chart
        if (window._eloChart) {
            window._eloChart.destroy();
        }

        const labels = history.map((g, i) => 'G' + (i + 1));
        const eloData = history.map(g => g.elo_after);

        // Color segments based on rank
        const colors = eloData.map(elo => {
            const rank = getRankForElo(elo);
            return rank.color;
        });

        window._eloChart = new Chart(canvas, {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'ELO',
                    data: eloData,
                    borderColor: '#00d4aa',
                    backgroundColor: 'rgba(0, 212, 170, 0.1)',
                    fill: true,
                    tension: 0.3,
                    pointRadius: 4,
                    pointBackgroundColor: colors,
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    borderWidth: 2,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const elo = ctx.parsed.y;
                                const rank = getRankForElo(elo);
                                return rank.emoji + ' ' + elo + ' ELO (' + rank.name + ')';
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        suggestedMin: 800,
                        grid: { color: 'rgba(255,255,255,0.06)' },
                        ticks: { color: 'rgba(255,255,255,0.5)' }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: 'rgba(255,255,255,0.4)' }
                    }
                }
            }
        });
    }

    /**
     * Render the ranked leaderboard
     */
    function renderLeaderboard(players) {
        const tbody = document.getElementById('ranked-leaderboard-body');
        if (!tbody) return;

        const empty = document.getElementById('ranked-leaderboard-empty');
        if (!players || players.length === 0) {
            tbody.innerHTML = '';
            if (empty) empty.style.display = 'block';
            return;
        }
        if (empty) empty.style.display = 'none';

        const currentUser = SupabaseClient.getUser();
        tbody.innerHTML = '';

        players.forEach((p, i) => {
            const tr = document.createElement('tr');
            const isSelf = currentUser && p.id === currentUser.id;
            if (isSelf) tr.className = 'highlight';

            const rankObj = getRankForElo(p.elo_rating);
            const winrate = p.games_played > 0
                ? Math.round((p.wins / p.games_played) * 100) : 0;

            const medals = ['🥇', '🥈', '🥉'];
            const rankDisplay = i < 3 ? medals[i] : (i + 1);

            tr.innerHTML =
                '<td class="rank-cell">' + rankDisplay + '</td>' +
                '<td>' + escapeHtml(p.username) + (isSelf ? ' (toi)' : '') + '</td>' +
                '<td><span class="rank-badge rank-badge-sm" style="--rank-color:' + rankObj.color + '">' + rankObj.emoji + ' ' + rankObj.name + '</span></td>' +
                '<td class="score-cell">' + p.elo_rating + '</td>' +
                '<td class="score-cell">' + p.wins + '</td>' +
                '<td class="score-cell">' + winrate + '%</td>';
            tbody.appendChild(tr);
        });
    }

    function escapeHtml(s) {
        const div = document.createElement('div');
        div.textContent = s;
        return div.innerHTML;
    }

    return {
        RANKS, calculateElo, getRankForElo, processGameResult,
        renderRankBadge, showRankedResult, renderProfile, renderLeaderboard,
        renderEloChart
    };
})();
