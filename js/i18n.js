const translations = {
    fr: {
        "title": "GeoExplorer — Devine ta position dans le monde",
        "description": "Jeu de géographie interactif inspiré de GeoGuessr. Explore le monde en vue street-level et devine ta position sur la carte !",
        "home_subtitle": "Devine ta position dans le monde",
        "play_solo": "JOUER SOLO",
        "play_online": "JOUER EN LIGNE",
        "leaderboard": "CLASSEMENT",
        "settings": "PARAMÈTRES",
        "how_to_play": "Comment jouer ?",
        "rule_1": "Explore la vue street-level et cherche des indices",
        "rule_2": "Place ton estimation sur la carte du monde",
        "rule_3": "Gagne jusqu'à 5 000 points par manche",
        "rule_4": "5 manches — Score max : 25 000 points",
        "back": "Retour",
        "settings_title": "Paramètres",
        "timer_duration": "Durée du timer (secondes)",
        "timer_desc": "Temps disponible par manche pour explorer et placer ton estimation.",
        "save": "Sauvegarder",
        "visual_theme": "Thème visuel",
        "theme_desc": "Bascule entre le mode Sombre et le mode Clair.",
        "toggle_theme": "Basculer le thème (Actuel : {theme})",
        "round": "MANCHE",
        "live_leaderboard": "Classement en direct",
        "score": "SCORE",
        "map": "Carte",
        "confirm_guess": "Confirmer ma position",
        "loading_location": "Chargement de la localisation...",
        "distance": "Distance",
        "next_round": "Manche suivante →",
        "game_over": "Partie terminée !",
        "total_score": "Score total",
        "pseudo_leaderboard": "Ton pseudo pour le classement",
        "pseudo_placeholder": "Entre ton pseudo...",
        "save_score": "Enregistrer",
        "replay": "Rejouer",
        "home": "Accueil",
        "player": "Joueur",
        "date": "Date",
        "no_scores": "Aucun score enregistré.",
        "play_to_appear": "Joue une partie pour apparaître ici !",
        "online_title": "Jouer en ligne",
        "your_pseudo": "Ton pseudo",
        "create_lobby": "Créer un lobby",
        "or": "ou",
        "join_lobby": "Rejoindre un lobby",
        "lobby_code_label": "Code du lobby (ex: A7K2X)",
        "join_btn": "Rejoindre",
        "waiting_room": "Salle d'attente",
        "lobby_code_display": "Code du lobby",
        "players": "Joueurs",
        "start_game": "Lancer la partie",
        "share_code": "Partage le code à tes amis pour qu'ils rejoignent !",
        "results_final": "Résultats finaux",
        "waiting_host": "En attente de l'hôte..."
    },
    en: {
        "title": "GeoExplorer — Guess your position in the world",
        "description": "Interactive geography game inspired by GeoGuessr. Explore the world in street-level view and guess your position on the map!",
        "home_subtitle": "Guess your position in the world",
        "play_solo": "PLAY SOLO",
        "play_online": "PLAY ONLINE",
        "leaderboard": "LEADERBOARD",
        "settings": "SETTINGS",
        "how_to_play": "How to play?",
        "rule_1": "Explore the street-level view and look for clues",
        "rule_2": "Place your guess on the world map",
        "rule_3": "Earn up to 5,000 points per round",
        "rule_4": "5 rounds — Max score: 25,000 points",
        "back": "Back",
        "settings_title": "Settings",
        "timer_duration": "Timer duration (seconds)",
        "timer_desc": "Time available per round to explore and place your guess.",
        "save": "Save",
        "visual_theme": "Visual theme",
        "theme_desc": "Toggle between Dark and Light mode.",
        "toggle_theme": "Toggle theme (Current: {theme})",
        "round": "ROUND",
        "live_leaderboard": "Live Leaderboard",
        "score": "SCORE",
        "map": "Map",
        "confirm_guess": "Confirm my position",
        "loading_location": "Loading location...",
        "distance": "Distance",
        "next_round": "Next round →",
        "game_over": "Game over!",
        "total_score": "Total score",
        "pseudo_leaderboard": "Your nickname for the leaderboard",
        "pseudo_placeholder": "Enter your nickname...",
        "save_score": "Save",
        "replay": "Replay",
        "home": "Home",
        "player": "Player",
        "date": "Date",
        "no_scores": "No scores recorded.",
        "play_to_appear": "Play a game to appear here!",
        "online_title": "Play Online",
        "your_pseudo": "Your nickname",
        "create_lobby": "Create a lobby",
        "or": "or",
        "join_lobby": "Join a lobby",
        "lobby_code_label": "Lobby code (ex: A7K2X)",
        "join_btn": "Join",
        "waiting_room": "Waiting Room",
        "lobby_code_display": "Lobby code",
        "players": "Players",
        "start_game": "Start game",
        "share_code": "Share the code with your friends so they can join!",
        "results_final": "Final Results",
        "waiting_host": "Waiting for host..."
    }
};

let currentLang = localStorage.getItem('language') || 'fr';

function i18n(key, variables = {}) {
    let text = translations[currentLang][key] || key;
    for (const [vKey, vVal] of Object.entries(variables)) {
        text = text.replace(`{${vKey}}`, vVal);
    }
    return text;
}

function setLanguage(lang) {
    if (translations[lang]) {
        currentLang = lang;
        localStorage.setItem('language', lang);
        applyTranslations();
    }
}

function applyTranslations() {
    const elements = document.querySelectorAll('[data-i18n]');
    elements.forEach(el => {
        const key = el.getAttribute('data-i18n');
        const variables = el.getAttribute('data-i18n-vars') ? JSON.parse(el.getAttribute('data-i18n-vars')) : {};
        
        if (el.tagName === 'INPUT' && (el.type === 'text' || el.type === 'placeholder')) {
            el.placeholder = i18n(key, variables);
        } else {
            el.innerHTML = i18n(key, variables);
        }
    });
    
    // Update document title and description
    document.title = i18n('title');
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) metaDesc.setAttribute('content', i18n('description'));
}

// Export for use in other scripts
window.i18n = i18n;
window.setLanguage = setLanguage;
window.applyTranslations = applyTranslations;
window.getCurrentLang = () => currentLang;
