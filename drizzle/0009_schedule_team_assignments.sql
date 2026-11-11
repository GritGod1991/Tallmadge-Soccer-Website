ALTER TABLE club_accounts ADD COLUMN schedule_teams_json TEXT NOT NULL DEFAULT '[]'
  CHECK (json_valid(schedule_teams_json) AND json_type(schedule_teams_json) = 'array');
