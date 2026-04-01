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
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON profiles;
CREATE POLICY "Profiles are viewable by everyone" ON profiles
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert their own profile" ON profiles;
CREATE POLICY "Users can insert their own profile" ON profiles
    FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
CREATE POLICY "Users can update their own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);

-- Ranked games: anyone can read, users can insert their own
DROP POLICY IF EXISTS "Ranked games are viewable by everyone" ON ranked_games;
CREATE POLICY "Ranked games are viewable by everyone" ON ranked_games
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can insert their own ranked games" ON ranked_games;
CREATE POLICY "Users can insert their own ranked games" ON ranked_games
    FOR INSERT WITH CHECK (auth.uid() = player_id);

-- ═══════════ REALTIME ═══════════

-- Enable realtime on profiles table for live leaderboard
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' AND tablename = 'profiles'
  ) THEN 
    ALTER PUBLICATION supabase_realtime ADD TABLE profiles; 
  END IF; 
END $$;

-- ═══════════ TRIGGER: auto-create profile on signup ═══════════

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, username, email, elo_rating, rank, wins, losses, games_played)
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger (drop first if exists to allow re-runs)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ═══════════ CREATE TEST USER ═══════════
-- Création d'un utilisateur de test (asco.jk2@gmail.com / Cacacaca)
-- Exécutez ce code pour créer l'utilisateur manuellement si besoin :

DO $$ 
DECLARE 
  new_user_id UUID := uuid_generate_v4();
BEGIN
  -- Insert into auth.users
  INSERT INTO auth.users (
      id,
      instance_id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at
  ) VALUES (
      new_user_id,
      '00000000-0000-0000-0000-000000000000',
      'authenticated',
      'authenticated',
      'asco.jk2@gmail.com',
      crypt('Cacacaca', gen_salt('bf')),
      NOW(),
      '{"provider": "email", "providers": ["email"]}',
      '{"username": "AscoTest"}',
      NOW(),
      NOW()
  );

  -- Insert into auth.identities
  INSERT INTO auth.identities (
      id,
      user_id,
      provider_id,
      identity_data,
      provider,
      created_at,
      updated_at
  ) VALUES (
      uuid_generate_v4(),
      new_user_id,
      new_user_id::text,
      format('{"sub":"%s","email":"asco.jk2@gmail.com"}', new_user_id::text)::jsonb,
      'email',
      NOW(),
      NOW()
  );
END $$;
