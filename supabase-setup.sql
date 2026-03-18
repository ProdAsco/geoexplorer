-- GeoExplorer — Supabase Database Setup
-- Execute this in the Supabase SQL Editor (supabase.com > SQL Editor)

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ═══════════ PROFILES TABLE ═══════════
CREATE TABLE IF NOT EXISTS profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    username TEXT NOT NULL,
    email TEXT,
    elo_rating INTEGER DEFAULT 1000,
    rank TEXT DEFAULT 'Bronze',
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    games_played INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create unique index on username (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique ON profiles (LOWER(username));

-- ═══════════ RANKED GAMES TABLE ═══════════
CREATE TABLE IF NOT EXISTS ranked_games (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    player_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
    score INTEGER NOT NULL,
    elo_before INTEGER,
    elo_after INTEGER,
    rank_before TEXT,
    rank_after TEXT,
    is_win BOOLEAN DEFAULT FALSE,
    played_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast player history queries
CREATE INDEX IF NOT EXISTS ranked_games_player_idx ON ranked_games(player_id, played_at DESC);

-- ═══════════ ROW LEVEL SECURITY (RLS) ═══════════

-- Enable RLS on both tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE ranked_games ENABLE ROW LEVEL SECURITY;

-- Profiles: anyone can read, users can update their own
CREATE POLICY "Profiles are viewable by everyone" ON profiles
    FOR SELECT USING (true);

CREATE POLICY "Users can insert their own profile" ON profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);

-- Ranked games: anyone can read, users can insert their own
CREATE POLICY "Ranked games are viewable by everyone" ON ranked_games
    FOR SELECT USING (true);

CREATE POLICY "Users can insert their own ranked games" ON ranked_games
    FOR INSERT WITH CHECK (auth.uid() = player_id);

-- ═══════════ REALTIME ═══════════

-- Enable realtime on profiles table for live leaderboard
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;

-- ═══════════ TRIGGER: auto-create profile on signup ═══════════

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO profiles (id, username, email, elo_rating, rank, wins, losses, games_played)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
        NEW.email,
        1000,
        'Bronze',
        0,
        0,
        0
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger (drop first if exists to allow re-runs)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION handle_new_user();
