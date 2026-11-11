CREATE TABLE club_teams (
  id TEXT PRIMARY KEY NOT NULL,
  division TEXT NOT NULL,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  UNIQUE (division, name_key)
);
