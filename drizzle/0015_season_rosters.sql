CREATE TABLE roster_players (
  id TEXT PRIMARY KEY NOT NULL,
  team_id TEXT NOT NULL REFERENCES club_teams(id),
  season_id TEXT NOT NULL REFERENCES club_seasons(id),
  name TEXT NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  number INTEGER NOT NULL CHECK (number BETWEEN 0 AND 999),
  position TEXT NOT NULL DEFAULT '',
  birthday TEXT,
  revision INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX roster_players_team_season ON roster_players(team_id, season_id, number);
