/**
 * GeoExplorer — Leaderboard
 */
const Leaderboard = (() => {
    const STORAGE_KEY = 'geo_leaderboard';
    const MAX_ENTRIES = 20;

    function getScores() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        } catch { return []; }
    }

    function save(scores) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(scores));
    }

    function addScore(name, totalScore, rounds) {
        const scores = getScores();
        const entry = {
            id: Date.now(),
            name: name || 'Anonyme',
            score: totalScore,
            rounds: rounds.map(r => ({
                location: r.location.name + ', ' + r.location.country,
                score: r.score,
                distance: Math.round(r.distance),
            })),
            date: new Date().toLocaleDateString('fr-FR'),
        };
        scores.push(entry);
        scores.sort((a, b) => b.score - a.score);
        if (scores.length > MAX_ENTRIES) scores.length = MAX_ENTRIES;
        save(scores);
        return entry.id;
    }

    function render(highlightId) {
        const scores = getScores();
        const tbody = document.getElementById('leaderboard-body');
        const empty = document.getElementById('leaderboard-empty');

        if (!scores.length) {
            tbody.innerHTML = '';
            empty.style.display = 'block';
            return;
        }

        empty.style.display = 'none';
        tbody.innerHTML = '';
        scores.forEach((entry, i) => {
            const tr = document.createElement('tr');
            if (entry.id === highlightId) tr.className = 'highlight';

            const rankClass = i < 3 ? ' rank-' + (i + 1) : '';
            const medals = ['🥇', '🥈', '🥉'];
            const rankDisplay = i < 3 ? medals[i] : (i + 1);

            tr.innerHTML =
                '<td class="rank-cell' + rankClass + '">' + rankDisplay + '</td>' +
                '<td>' + escapeHtml(entry.name) + '</td>' +
                '<td class="score-cell">' + entry.score.toLocaleString('fr-FR') + '</td>' +
                '<td class="date-cell">' + entry.date + '</td>';
            tbody.appendChild(tr);
        });
    }

    function escapeHtml(s) {
        const div = document.createElement('div');
        div.textContent = s;
        return div.innerHTML;
    }

    return { getScores, addScore, render };
})();
