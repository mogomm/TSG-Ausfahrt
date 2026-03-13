ALTER TABLE players ADD COLUMN IF NOT EXISTS default_mode text CHECK (default_mode IN ('driving','riding','pending')) DEFAULT 'pending';
ALTER TABLE players ADD COLUMN IF NOT EXISTS default_seats_available integer DEFAULT 2;
ALTER TABLE players ADD COLUMN IF NOT EXISTS default_seats_needed integer DEFAULT 1;
