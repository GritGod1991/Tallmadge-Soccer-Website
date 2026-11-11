ALTER TABLE scheduled_games ADD COLUMN home_team_id TEXT REFERENCES club_teams(id);
ALTER TABLE scheduled_games ADD COLUMN away_team_id TEXT REFERENCES club_teams(id);
