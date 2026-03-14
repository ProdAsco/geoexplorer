/**
 * GeoExplorer — Multiplayer Server
 * Express + Socket.io — Lobby system with synchronized gameplay
 */
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' },
    pingTimeout: 60000,
    pingInterval: 25000,
});

const PORT = process.env.PORT || 3000;

// ── Serve static files ──
app.use(express.static(path.join(__dirname)));

// ── Lobby Storage ──
const lobbies = new Map();

function generateCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

function generateId() {
    return Math.random().toString(36).substring(2, 10);
}

// ── Locations (server-side copy) ──
const LOCATIONS = require('./js/locations-server.js');

function pickRandom(count) {
    const shuffled = [...LOCATIONS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}

// ── Haversine distance ──
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

// ── Lobby class ──
class Lobby {
    constructor(hostSocket, hostName) {
        this.code = generateCode();
        this.hostId = hostSocket.id;
        this.players = new Map();
        this.status = 'waiting'; // waiting | playing | roundResult | finished
        this.locations = [];
        this.currentRound = 0;
        this.totalRounds = 5;
        this.timerDuration = 120;
        this.timerInterval = null;
        this.timeLeft = 0;
        this.roundGuesses = new Map();
        this.roundResults = [];

        this.addPlayer(hostSocket, hostName);
    }

    addPlayer(socket, name) {
        if (this.players.size >= 4) return false;
        if (this.status !== 'waiting') return false;

        this.players.set(socket.id, {
            id: socket.id,
            name: name || 'Joueur',
            totalScore: 0,
            roundScores: [],
            connected: true,
        });
        socket.join(this.code);
        return true;
    }

    removePlayer(socketId) {
        this.players.delete(socketId);
        if (socketId === this.hostId) {
            // Transfer host to next player
            const next = this.players.keys().next().value;
            if (next) this.hostId = next;
        }
    }

    getPlayerList() {
        return Array.from(this.players.values()).map(p => ({
            id: p.id,
            name: p.name,
            totalScore: p.totalScore,
            isHost: p.id === this.hostId,
            connected: p.connected,
        }));
    }

    startGame() {
        this.status = 'playing';
        this.currentRound = 0;
        this.locations = pickRandom(this.totalRounds + 5);
        this.roundResults = [];
        // Reset scores
        for (const p of this.players.values()) {
            p.totalScore = 0;
            p.roundScores = [];
        }
    }

    startRound(locationIndex) {
        this.roundGuesses = new Map();
        const loc = this.locations[locationIndex];
        this.timeLeft = this.timerDuration;
        return {
            round: this.currentRound + 1,
            totalRounds: this.totalRounds,
            lat: loc.lat,
            lng: loc.lng,
            timerDuration: this.timerDuration,
        };
    }

    submitGuess(socketId, lat, lng) {
        if (this.roundGuesses.has(socketId)) return; // already guessed
        this.roundGuesses.set(socketId, { lat, lng, time: Date.now() });
    }

    allGuessesIn() {
        const activePlayers = Array.from(this.players.values()).filter(p => p.connected);
        return this.roundGuesses.size >= activePlayers.length;
    }

    calculateRoundResults() {
        const loc = this.locations[this.currentRound];
        const results = [];

        for (const [playerId, player] of this.players) {
            const guess = this.roundGuesses.get(playerId);
            let distance = 0, score = 0, guessLat = 0, guessLng = 0;

            if (guess) {
                guessLat = guess.lat;
                guessLng = guess.lng;
                distance = haversine(loc.lat, loc.lng, guessLat, guessLng);
                score = calcScore(distance);
            }

            player.totalScore += score;
            player.roundScores.push(score);

            results.push({
                playerId,
                playerName: player.name,
                guessLat, guessLng,
                distance: Math.round(distance),
                score,
                totalScore: player.totalScore,
            });
        }

        // Sort by score descending
        results.sort((a, b) => b.score - a.score);

        this.roundResults.push({
            round: this.currentRound + 1,
            location: { lat: loc.lat, lng: loc.lng, name: loc.name, country: loc.country },
            players: results,
        });

        return {
            location: { lat: loc.lat, lng: loc.lng, name: loc.name, country: loc.country },
            players: results,
            round: this.currentRound + 1,
            totalRounds: this.totalRounds,
        };
    }

    getFinalResults() {
        const players = Array.from(this.players.values()).map(p => ({
            id: p.id,
            name: p.name,
            totalScore: p.totalScore,
            roundScores: p.roundScores,
        }));
        players.sort((a, b) => b.totalScore - a.totalScore);

        return {
            players,
            rounds: this.roundResults,
        };
    }
}

// ── Socket.io event handling ──
io.on('connection', (socket) => {
    console.log(`[+] Connected: ${socket.id}`);
    let currentLobby = null;

    // ── Create lobby ──
    socket.on('createLobby', ({ playerName, timerDuration }, callback) => {
        const lobby = new Lobby(socket, playerName || 'Hôte');
        if (timerDuration) lobby.timerDuration = Math.max(30, Math.min(600, timerDuration));
        lobbies.set(lobby.code, lobby);
        currentLobby = lobby.code;

        console.log(`[LOBBY] Created: ${lobby.code} by ${playerName}`);

        callback({ success: true, code: lobby.code, isHost: true });
        io.to(lobby.code).emit('playerList', lobby.getPlayerList());
    });

    // ── Join lobby ──
    socket.on('joinLobby', ({ code, playerName }, callback) => {
        const normalizedCode = (code || '').toUpperCase().trim();
        const lobby = lobbies.get(normalizedCode);

        if (!lobby) {
            callback({ success: false, error: 'Lobby introuvable.' });
            return;
        }
        if (lobby.status !== 'waiting') {
            callback({ success: false, error: 'La partie a déjà commencé.' });
            return;
        }
        if (lobby.players.size >= 4) {
            callback({ success: false, error: 'Le lobby est complet (4/4).' });
            return;
        }

        lobby.addPlayer(socket, playerName || 'Joueur');
        currentLobby = normalizedCode;

        console.log(`[LOBBY] ${playerName} joined ${normalizedCode}`);

        callback({ success: true, code: normalizedCode, isHost: false });
        io.to(normalizedCode).emit('playerList', lobby.getPlayerList());
    });

    // ── Start game (host only) ──
    socket.on('startGame', (_, callback) => {
        const lobby = lobbies.get(currentLobby);
        if (!lobby || lobby.hostId !== socket.id) {
            callback?.({ success: false, error: 'Seul l\'hôte peut lancer la partie.' });
            return;
        }
        if (lobby.players.size < 1) {
            callback?.({ success: false, error: 'Il faut au moins 1 joueur.' });
            return;
        }

        lobby.startGame();
        callback?.({ success: true });

        // Start first round
        startRound(lobby);
    });

    // ── Submit guess ──
    socket.on('submitGuess', ({ lat, lng }) => {
        const lobby = lobbies.get(currentLobby);
        if (!lobby || lobby.status !== 'playing') return;

        lobby.submitGuess(socket.id, lat, lng);

        // Notify others that this player has guessed
        io.to(currentLobby).emit('playerGuessed', {
            playerId: socket.id,
            guessCount: lobby.roundGuesses.size,
            totalPlayers: lobby.players.size,
        });

        // If all guesses in, end round early
        if (lobby.allGuessesIn()) {
            endRound(lobby);
        }
    });

    // ── Next round (host only) ──
    socket.on('nextRound', () => {
        const lobby = lobbies.get(currentLobby);
        if (!lobby || lobby.hostId !== socket.id) return;
        if (lobby.status !== 'roundResult') return;

        lobby.currentRound++;
        if (lobby.currentRound >= lobby.totalRounds) {
            // Game finished
            lobby.status = 'finished';
            io.to(currentLobby).emit('gameFinished', lobby.getFinalResults());
        } else {
            startRound(lobby);
        }
    });

    // ── Back to lobby (host only) ──
    socket.on('backToLobby', () => {
        const lobby = lobbies.get(currentLobby);
        if (!lobby || lobby.hostId !== socket.id) return;

        lobby.status = 'waiting';
        lobby.currentRound = 0;
        lobby.roundResults = [];
        for (const p of lobby.players.values()) {
            p.totalScore = 0;
            p.roundScores = [];
        }

        io.to(currentLobby).emit('backToLobby', lobby.getPlayerList());
    });

    // ── Leave lobby ──
    socket.on('leaveLobby', () => {
        handleLeave(socket);
    });

    // ── Disconnect ──
    socket.on('disconnect', () => {
        console.log(`[-] Disconnected: ${socket.id}`);
        handleLeave(socket);
    });

    function handleLeave(sock) {
        if (!currentLobby) return;
        const lobby = lobbies.get(currentLobby);
        if (!lobby) return;

        lobby.removePlayer(sock.id);
        sock.leave(currentLobby);

        if (lobby.players.size === 0) {
            // Clean up empty lobby
            if (lobby.timerInterval) clearInterval(lobby.timerInterval);
            lobbies.delete(currentLobby);
            console.log(`[LOBBY] Deleted empty lobby: ${currentLobby}`);
        } else {
            io.to(currentLobby).emit('playerList', lobby.getPlayerList());
            io.to(currentLobby).emit('playerLeft', { playerId: sock.id });

            // If in game and all remaining guesses are in, end round
            if (lobby.status === 'playing' && lobby.allGuessesIn()) {
                endRound(lobby);
            }
        }
        currentLobby = null;
    }
});

// ── Round management ──
function startRound(lobby) {
    lobby.status = 'playing';
    const roundData = lobby.startRound(lobby.currentRound);

    io.to(lobby.code).emit('roundStart', roundData);

    // Server-side timer
    lobby.timeLeft = lobby.timerDuration;
    if (lobby.timerInterval) clearInterval(lobby.timerInterval);

    lobby.timerInterval = setInterval(() => {
        lobby.timeLeft--;
        io.to(lobby.code).emit('timerSync', { timeLeft: lobby.timeLeft });

        if (lobby.timeLeft <= 0) {
            endRound(lobby);
        }
    }, 1000);
}

function endRound(lobby) {
    if (lobby.status !== 'playing') return;
    lobby.status = 'roundResult';

    if (lobby.timerInterval) {
        clearInterval(lobby.timerInterval);
        lobby.timerInterval = null;
    }

    const results = lobby.calculateRoundResults();
    io.to(lobby.code).emit('roundEnd', results);
}

// ── Cleanup stale lobbies every 30 minutes ──
setInterval(() => {
    const now = Date.now();
    for (const [code, lobby] of lobbies) {
        if (lobby.players.size === 0) {
            if (lobby.timerInterval) clearInterval(lobby.timerInterval);
            lobbies.delete(code);
        }
    }
}, 30 * 60 * 1000);

// ── Start server ──
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n  🌍 GeoExplorer server running on port ${PORT}\n`);
});
