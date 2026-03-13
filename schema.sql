-- ============================================================
-- Fahrgemeinschaft App – Supabase Schema
-- Ausführen in: Supabase Dashboard → SQL Editor → New Query
-- ============================================================

-- Spieler
CREATE TABLE players (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  address      TEXT NOT NULL,
  lat          FLOAT NOT NULL,
  lng          FLOAT NOT NULL,
  phone        TEXT,
  has_car      BOOLEAN DEFAULT FALSE,
  magic_token  UUID UNIQUE DEFAULT gen_random_uuid(),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Spiele
CREATE TABLE games (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  destination_name     TEXT NOT NULL,
  destination_address  TEXT NOT NULL,
  dest_lat             FLOAT NOT NULL,
  dest_lng             FLOAT NOT NULL,
  date                 TIMESTAMPTZ NOT NULL,
  rsvp_deadline        TIMESTAMPTZ,
  status               TEXT DEFAULT 'open'
                       CHECK (status IN ('open','calculated','published','archived')),
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

-- Aufstellung
CREATE TABLE lineups (
  game_id    UUID REFERENCES games(id) ON DELETE CASCADE,
  player_id  UUID REFERENCES players(id) ON DELETE CASCADE,
  PRIMARY KEY (game_id, player_id)
);

-- Rückmeldungen der Eltern
CREATE TABLE rsvps (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id          UUID REFERENCES games(id) ON DELETE CASCADE,
  player_id        UUID REFERENCES players(id) ON DELETE CASCADE,
  mode             TEXT DEFAULT 'pending'
                   CHECK (mode IN ('pending','driving','riding')),
  seats_available  INT,
  seats_needed     INT DEFAULT 1,
  note             TEXT,
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (game_id, player_id)
);

-- Berechnete Fahrgemeinschaften
CREATE TABLE assignments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id           UUID REFERENCES games(id) ON DELETE CASCADE,
  driver_player_id  UUID REFERENCES players(id),
  rider_player_ids  UUID[] DEFAULT '{}',
  meetup_type       TEXT CHECK (meetup_type IN ('at_driver','at_rider','waypoint')),
  meetup_address    TEXT,
  meetup_lat        FLOAT,
  meetup_lng        FLOAT,
  seats_remaining   INT DEFAULT 0,
  direct_dist_km    FLOAT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ── Row Level Security: alles öffentlich lesbar, Backend schreibt ────────────
ALTER TABLE players     ENABLE ROW LEVEL SECURITY;
ALTER TABLE games       ENABLE ROW LEVEL SECURITY;
ALTER TABLE lineups     ENABLE ROW LEVEL SECURITY;
ALTER TABLE rsvps       ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;

-- Service-Key (Backend) hat vollen Zugriff – kein Extra-Policy nötig
-- Anon-Key (Frontend direkt) bekommt Read-only
CREATE POLICY "public read players"     ON players     FOR SELECT USING (TRUE);
CREATE POLICY "public read games"       ON games       FOR SELECT USING (TRUE);
CREATE POLICY "public read lineups"     ON lineups     FOR SELECT USING (TRUE);
CREATE POLICY "public read rsvps"       ON rsvps       FOR SELECT USING (TRUE);
CREATE POLICY "public read assignments" ON assignments FOR SELECT USING (TRUE);

-- ── Beispiel-Daten (optional, zum Testen) ────────────────────────────────────
INSERT INTO players (name, address, lat, lng, phone, has_car) VALUES
  ('Jonas M.',   'Rheinstraße 12, Darmstadt',        49.872, 8.651, '0151-11111111', TRUE),
  ('Lena K.',    'Bismarckstraße 5, Darmstadt',      49.876, 8.643, '0151-22222222', TRUE),
  ('Max S.',     'Heidelberger Str. 88, Darmstadt',  49.864, 8.659, '0151-33333333', FALSE),
  ('Emma T.',    'Frankfurter Str. 22, Darmstadt',   49.882, 8.647, '0151-44444444', TRUE),
  ('Ben W.',     'Mauerstraße 3, Darmstadt',         49.868, 8.636, '0151-55555555', FALSE),
  ('Sophia L.',  'Herdweg 21a, Darmstadt',           49.874, 8.649, '0151-66666666', FALSE);
