function canManageTeams(roles) {
  return roles.some((role) => ['Owner', 'Super Admin', 'Admin', 'Manager'].includes(role));
}

async function clubTeams(env) {
  return (await env.DB.prepare('SELECT id, division, name, revision FROM club_teams ORDER BY division, name').all()).results;
}

async function resolveTeamAssignments(env, assignments) {
  const teams = await clubTeams(env);
  return assignments.map((item) => {
    const match = item.teamId ? teams.find((team) => team.id === item.teamId) :
      teams.find((team) => team.division === item.division && team.name.toLowerCase() === item.team.toLowerCase());
    return match ? { teamId: match.id, division: match.division, team: match.name } : item.teamId ? null : item;
  });
}

async function deleteClubTeam(env, input) {
  if (typeof input?.id !== 'string' || !scheduleIdPattern.test(input.id) ||
      !Number.isSafeInteger(input.revision) || input.revision < 1) {
    return fieldResponse({ error: 'Choose a valid team to delete.' }, 400);
  }
  const id = input.id.toLowerCase();
  const revision = input.revision;
  const guard = 'SELECT id, division, name_key FROM club_teams WHERE id = ? AND revision = ?';
  const assignmentMatch = `EXISTS (SELECT 1 FROM (${guard}) AS target
    WHERE json_extract(item.value, '$.teamId') = target.id
      OR (json_extract(item.value, '$.teamId') IS NULL
        AND json_extract(item.value, '$.division') = target.division
        AND lower(json_extract(item.value, '$.team')) = target.name_key))`;
  // Guard every statement with the same revision. D1 rolls the batch back if any dependency fails.
  const [, , , deleted] = await env.DB.batch([
    env.DB.prepare(`DELETE FROM scheduled_games WHERE EXISTS (SELECT 1 FROM (${guard}) AS target
      WHERE home_team_id = target.id OR away_team_id = target.id
        OR (scheduled_games.division = target.division AND
          ((home_team_id IS NULL AND lower(home) = target.name_key) OR
           (away_team_id IS NULL AND lower(away) = target.name_key))))`).bind(id, revision),
    env.DB.prepare(`DELETE FROM roster_players WHERE team_id IN (SELECT id FROM (${guard}))`).bind(id, revision),
    env.DB.prepare(`UPDATE club_accounts SET schedule_teams_json = (
      SELECT json_group_array(json(item.value)) FROM json_each(schedule_teams_json) AS item WHERE NOT (${assignmentMatch})
    ) WHERE EXISTS (SELECT 1 FROM json_each(schedule_teams_json) AS item WHERE ${assignmentMatch})`).bind(id, revision, id, revision),
    env.DB.prepare('DELETE FROM club_teams WHERE id = ? AND revision = ? RETURNING id').bind(id, revision),
  ]);
  if (!deleted.results.length && await env.DB.prepare('SELECT id FROM club_teams WHERE id = ?').bind(id).first()) {
    return fieldResponse({ error: 'This team changed. Refresh before deleting it.' }, 409);
  }
  return fieldResponse({ deleted: true });
}

async function teamsApi(request, env, origin) {
  try {
    if (request.method === 'GET') return fieldResponse(await clubTeams(env));
    if (!['POST', 'DELETE'].includes(request.method)) return fieldResponse({ error: 'Method not allowed.' }, 405);
    const failure = validateWrite(request, origin);
    if (failure) return failure;
    const user = env.SUPABASE_URL ? await currentClubUser(request, new URL('/auth/v1', env.SUPABASE_URL).href) : null;
    const account = await getClubAccountState(env, user);
    if (account?.is_active !== 1 || !canManageTeams(effectiveClubRoles(env, user, account))) {
      return fieldResponse({ error: 'Your account does not have access to Manage Teams.' }, 403);
    }
    const input = await request.json().catch(() => null);
    if (request.method === 'DELETE') return await deleteClubTeam(env, input);
    const name = typeof input?.name === 'string' ? input.name.trim() : '';
    if (!name || name.length > 80 || !(await clubDivisions(env)).some((item) => item.name === input.division) ||
        typeof input.id !== 'string' || !scheduleIdPattern.test(input.id) ||
        !Number.isSafeInteger(input.revision) || input.revision < 0) {
      return fieldResponse({ error: 'Enter a valid team name and division.' }, 400);
    }
    const { division, revision } = input;
    const id = input.id.toLowerCase();
    const nameKey = name.toLowerCase();
    const duplicate = await env.DB.prepare('SELECT id FROM club_teams WHERE division = ? AND name_key = ? AND id <> ?')
      .bind(division, nameKey, id).first();
    if (duplicate) return fieldResponse({ error: 'That team name already exists in this division.' }, 409);
    if (revision === 0) {
      const saved = await env.DB.prepare(
        'INSERT INTO club_teams (id, division, name, name_key) SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM club_divisions WHERE name = ? COLLATE BINARY) ON CONFLICT DO NOTHING RETURNING id, division, name, revision'
      ).bind(id, division, name, nameKey, division).first();
      if (saved) return fieldResponse(saved);
    } else {
      const [updated] = await env.DB.batch([
        env.DB.prepare('UPDATE club_teams SET name = ?, name_key = ?, revision = revision + 1 WHERE id = ? AND division = ? AND revision = ? AND NOT EXISTS (SELECT 1 FROM club_teams WHERE division = ? AND name_key = ? AND id <> ?) RETURNING id, division, name, revision')
          .bind(name, nameKey, id, division, revision, division, nameKey, id),
        env.DB.prepare(
          'UPDATE scheduled_games SET home = CASE WHEN home_team_id = ? THEN ? ELSE home END, ' +
          'away = CASE WHEN away_team_id = ? THEN ? ELSE away END, revision = revision + 1 ' +
          'WHERE ((home_team_id = ? AND home <> ?) OR (away_team_id = ? AND away <> ?)) ' +
          'AND EXISTS (SELECT 1 FROM club_teams WHERE id = ? AND revision = ? AND name = ?)'
        ).bind(id, name, id, name, id, name, id, name, id, revision + 1, name),
      ]);
      if (updated.results[0]) return fieldResponse(updated.results[0]);
    }
    const current = await env.DB.prepare('SELECT id, division, name, revision FROM club_teams WHERE id = ?').bind(id).first();
    if (current?.revision === revision + 1 && current.name === name && current.division === division) return fieldResponse(current);
    return fieldResponse({ error: 'The team name is already in use or this team changed. Refresh and try again.' }, 409);
  } catch (error) {
    console.error('Could not read or save teams', error);
    return fieldResponse({ error: 'Teams are unavailable. Try again.' }, 503);
  }
}
