/**
 * GeoExplorer — Supabase Client (Auth + Database)
 */
const SupabaseClient = (() => {
    let supabase = null;
    let currentUser = null;
    let currentProfile = null;

    function init() {
        // Read keys here to ensure /env.js has loaded
        const url = window.ENV?.SUPABASE_URL;
        const key = window.ENV?.SUPABASE_ANON_KEY;

        if (!url || !key) {
            console.error('Supabase configuration manquante — vérifie le fichier .env et relance le serveur.');
            return;
        }

        try {
            supabase = window.supabase.createClient(url, key);
            console.log("Supabase initialisé avec succès !");

            // Listen for auth state changes
            supabase.auth.onAuthStateChange(async (event, session) => {
                if (session?.user) {
                    currentUser = session.user;
                    await loadProfile();
                    updateAuthUI(true);
                } else {
                    currentUser = null;
                    currentProfile = null;
                    updateAuthUI(false);
                }
            });

            // Check existing session
            checkSession();
        } catch (err) {
            console.error('Error initializing Supabase:', err);
            supabase = null;
        }
    }

    async function checkSession() {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
            currentUser = session.user;
            await loadProfile();
            updateAuthUI(true);
        }
    }

    // ── Authentication ──
    async function signUp(email, password, username) {
        if (!supabase) {
            return { success: false, error: 'Client Supabase non initialisé. Vérifiez votre configuration.' };
        }
        const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
                data: { username }
            }
        });

        if (error) return { success: false, error: error.message };

        // Create profile
        if (data.user) {
            const { error: profileError } = await supabase
                .from('profiles')
                .insert({
                    id: data.user.id,
                    username: username,
                    email: email,
                    elo_rating: 1000,
                    rank: 'Bronze',
                    wins: 0,
                    losses: 0,
                    games_played: 0
                });

            if (profileError && profileError.code !== '23505') {
                console.error('Profile creation error:', profileError);
            }
        }

        return { success: true, user: data.user };
    }

    async function signIn(email, password) {
        if (!supabase) {
            return { success: false, error: 'Client Supabase non initialisé. Vérifiez votre configuration.' };
        }
        const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password
        });

        if (error) return { success: false, error: error.message };
        return { success: true, user: data.user };
    }

    async function signOut() {
        await supabase.auth.signOut();
        currentUser = null;
        currentProfile = null;
        updateAuthUI(false);
    }

    // ── Profile ──
    async function loadProfile() {
        if (!currentUser) return null;

        const { data, error } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .single();

        if (error) {
            console.error('Load profile error:', error);
            // Profile might not exist yet (email not confirmed), try creating
            if (error.code === 'PGRST116') {
                await createProfileIfMissing();
                return currentProfile;
            }
            return null;
        }

        currentProfile = data;
        return data;
    }

    async function createProfileIfMissing() {
        if (!currentUser) return;
        const username = currentUser.user_metadata?.username || currentUser.email.split('@')[0];

        const { data, error } = await supabase
            .from('profiles')
            .upsert({
                id: currentUser.id,
                username: username,
                email: currentUser.email,
                elo_rating: 1000,
                rank: 'Bronze',
                wins: 0,
                losses: 0,
                games_played: 0
            }, { onConflict: 'id' })
            .select()
            .single();

        if (!error) currentProfile = data;
    }

    // ── Ranked Game History ──
    async function getGameHistory(limit = 30) {
        if (!currentUser) return [];

        const { data, error } = await supabase
            .from('ranked_games')
            .select('*')
            .eq('player_id', currentUser.id)
            .order('played_at', { ascending: true })
            .limit(limit);

        if (error) { console.error('Game history error:', error); return []; }
        return data || [];
    }

    async function saveRankedGame(score, eloBefore, eloAfter, rankBefore, rankAfter, isWin) {
        if (!currentUser) return null;

        const { data, error } = await supabase
            .from('ranked_games')
            .insert({
                player_id: currentUser.id,
                score,
                elo_before: eloBefore,
                elo_after: eloAfter,
                rank_before: rankBefore,
                rank_after: rankAfter,
                is_win: isWin
            })
            .select()
            .single();

        if (error) { console.error('Save game error:', error); return null; }
        return data;
    }

    async function updateProfile(updates) {
        if (!currentUser) return null;

        const { data, error } = await supabase
            .from('profiles')
            .update({ ...updates, updated_at: new Date().toISOString() })
            .eq('id', currentUser.id)
            .select()
            .single();

        if (error) { console.error('Update profile error:', error); return null; }
        currentProfile = data;
        return data;
    }

    // ── Leaderboard ──
    async function getLeaderboard(limit = 50) {
        const { data, error } = await supabase
            .from('profiles')
            .select('id, username, elo_rating, rank, wins, losses, games_played')
            .order('elo_rating', { ascending: false })
            .limit(limit);

        if (error) { console.error('Leaderboard error:', error); return []; }
        return data || [];
    }

    // ── Realtime Leaderboard ──
    let leaderboardSubscription = null;

    function subscribeLeaderboard(callback) {
        if (leaderboardSubscription) {
            supabase.removeChannel(leaderboardSubscription);
        }

        leaderboardSubscription = supabase
            .channel('ranked-leaderboard')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 'profiles'
            }, () => {
                // Refresh leaderboard on any change
                getLeaderboard().then(callback);
            })
            .subscribe();

        // Initial load
        getLeaderboard().then(callback);
    }

    function unsubscribeLeaderboard() {
        if (leaderboardSubscription) {
            supabase.removeChannel(leaderboardSubscription);
            leaderboardSubscription = null;
        }
    }

    // ── Auth UI ──
    function updateAuthUI(isLoggedIn) {
        const authBtn = document.getElementById('btn-auth');
        const profileBtn = document.getElementById('btn-profile');
        const authStatus = document.getElementById('auth-status');

        if (authBtn) {
            authBtn.style.display = isLoggedIn ? 'none' : 'inline-flex';
        }
        if (profileBtn) {
            profileBtn.style.display = isLoggedIn ? 'inline-flex' : 'none';
            if (isLoggedIn && currentProfile) {
                const profileNameEl = profileBtn.querySelector('.profile-btn-name');
                if (profileNameEl) profileNameEl.textContent = currentProfile.username;
                const profileRankEl = profileBtn.querySelector('.profile-btn-rank');
                if (profileRankEl) profileRankEl.textContent = getRankEmoji(currentProfile.rank);
            }
        }
        if (authStatus) {
            authStatus.textContent = isLoggedIn
                ? (currentProfile ? currentProfile.username : 'Connecté')
                : '';
        }
    }

    function getRankEmoji(rank) {
        const emojis = {
            'Bronze': '🥉',
            'Silver': '🥈',
            'Gold': '🥇',
            'Platinum': '💎',
            'Diamond': '👑'
        };
        return emojis[rank] || '🥉';
    }

    // Getters
    function getUser() { return currentUser; }
    function getProfile() { return currentProfile; }
    function isLoggedIn() { return currentUser !== null; }
    function getClient() { return supabase; }

    return {
        init, signUp, signIn, signOut,
        loadProfile, updateProfile, getGameHistory, saveRankedGame,
        getLeaderboard, subscribeLeaderboard, unsubscribeLeaderboard,
        getUser, getProfile, isLoggedIn, getClient, getRankEmoji,
        createProfileIfMissing
    };
})();
