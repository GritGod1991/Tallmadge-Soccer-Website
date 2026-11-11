ALTER TABLE scheduled_games ADD COLUMN season_id TEXT REFERENCES club_seasons(id);
CREATE INDEX scheduled_games_season ON scheduled_games(season_id, division, date, time);
