CREATE TABLE club_seasons (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE,
  is_test INTEGER NOT NULL DEFAULT 0 CHECK (is_test IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1) AND (is_active = 0 OR is_test = 0))
);
CREATE UNIQUE INDEX club_seasons_one_active ON club_seasons(is_active) WHERE is_active = 1;
