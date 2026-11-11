CREATE TABLE scheduled_games (
  id TEXT PRIMARY KEY NOT NULL,
  division TEXT NOT NULL,
  home TEXT NOT NULL,
  away TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  field_id TEXT NOT NULL REFERENCES fields(field_id),
  revision INTEGER NOT NULL DEFAULT 1
);
