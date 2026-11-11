async function clubDivisions(env) {
  return (await env.DB.prepare('SELECT name, league, original_name AS originalName FROM club_divisions ORDER BY name').all()).results;
}

function divisionName(value) {
  return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
}

async function renameClubDivision(env, name, league, newName) {
  if (!['travel', 'rec'].includes(league) || !newName || newName.length > 60) {
    return fieldResponse({ error: 'Enter a division name from 1 to 60 characters.' }, 400);
  }

  // Each write uses the same source and duplicate checks. The catalog changes last.
  const guard = 'EXISTS (SELECT 1 FROM club_divisions WHERE name = ? COLLATE BINARY AND league = ? ' +
    'AND NOT EXISTS (SELECT 1 FROM club_divisions WHERE name = ? AND name <> ? COLLATE BINARY))';
  const checks = [name, league, newName, name];
  const assignment = "json_extract(item.value, '$.division') = ? COLLATE BINARY";
  const [, , , updated] = await env.DB.batch([
    env.DB.prepare('UPDATE club_teams SET division = ?, revision = revision + 1 WHERE division = ? AND ' + guard)
      .bind(newName, name, ...checks),
    env.DB.prepare('UPDATE scheduled_games SET division = ?, revision = revision + 1 WHERE division = ? AND ' + guard)
      .bind(newName, name, ...checks),
    env.DB.prepare(
      'UPDATE club_accounts SET schedule_teams_json = (SELECT json_group_array(CASE WHEN ' + assignment +
      " THEN json_set(item.value, '$.division', ?) ELSE json(item.value) END) FROM json_each(schedule_teams_json) AS item) " +
      'WHERE EXISTS (SELECT 1 FROM json_each(schedule_teams_json) AS item WHERE ' + assignment + ') AND ' + guard
    ).bind(name, newName, name, ...checks),
    env.DB.prepare(
      'UPDATE club_divisions SET name = ?, original_name = COALESCE(original_name, name) ' +
      'WHERE name = ? COLLATE BINARY AND league = ? AND ' + guard + ' RETURNING name, league, original_name AS originalName'
    ).bind(newName, name, league, ...checks),
  ]);
  if (updated.results[0]) return fieldResponse(updated.results[0]);
  const duplicate = await env.DB.prepare('SELECT name FROM club_divisions WHERE name = ?').bind(newName).first();
  return fieldResponse({ error: duplicate ? 'A division with that name already exists.' : 'This division changed. Refresh and try again.' }, 409);
}

async function divisionApi(request, env, origin) {
  try {
    if (request.method === 'GET') return fieldResponse(await clubDivisions(env));
    if (!['POST', 'PATCH', 'DELETE'].includes(request.method)) return fieldResponse({ error: 'Method not allowed.' }, 405);
    const failure = validateWrite(request, origin);
    if (failure) return failure;
    const user = env.SUPABASE_URL ? await currentClubUser(request, new URL('/auth/v1', env.SUPABASE_URL).href) : null;
    const account = await getClubAccountState(env, user);
    if (account?.is_active !== 1 || !effectiveClubRoles(env, user, account).includes('Owner')) {
      return fieldResponse({ error: 'Only the Owner can manage divisions.' }, 403);
    }
    const input = await request.json().catch(() => null);
    const name = divisionName(input?.name);
    if (!name || name.length > 60) return fieldResponse({ error: 'Enter a division name from 1 to 60 characters.' }, 400);
    if (request.method === 'POST') {
      if (!['travel', 'rec'].includes(input.league)) {
        return fieldResponse({ error: 'Choose Classic Travel or Rec League.' }, 400);
      }
      const row = await env.DB.prepare(
        'INSERT INTO club_divisions (name, league) VALUES (?, ?) ON CONFLICT DO NOTHING RETURNING name, league'
      ).bind(name, input.league).first();
      return row ? fieldResponse(row) : fieldResponse({ error: 'A division with that name already exists.' }, 409);
    }
    if (request.method === 'PATCH') {
      const newName = divisionName(input.newName);
      if (name === newName) {
        const current = await env.DB.prepare(
          'SELECT name, league, original_name AS originalName FROM club_divisions WHERE name = ? COLLATE BINARY AND league = ?'
        ).bind(name, input.league ?? '').first();
        return current ? fieldResponse(current) : fieldResponse({ error: 'This division changed. Refresh and try again.' }, 409);
      }
      return await renameClubDivision(env, name, input.league, newName);
    }
    const deleted = await env.DB.prepare(
      'DELETE FROM club_divisions WHERE name = ? COLLATE BINARY AND league = ? ' +
      'AND NOT EXISTS (SELECT 1 FROM club_teams WHERE division = club_divisions.name COLLATE BINARY) ' +
      'AND NOT EXISTS (SELECT 1 FROM scheduled_games WHERE division = club_divisions.name COLLATE BINARY) ' +
      "AND NOT EXISTS (SELECT 1 FROM club_accounts, json_each(schedule_teams_json) AS item WHERE json_extract(item.value, '$.division') = club_divisions.name COLLATE BINARY) " +
      'RETURNING name'
    ).bind(name, input.league ?? '').first();
    if (deleted) return fieldResponse({ deleted: true });
    const current = await env.DB.prepare('SELECT league FROM club_divisions WHERE name = ? COLLATE BINARY').bind(name).first();
    if (!current) return fieldResponse({ deleted: true });
    return fieldResponse({ error: 'This division still has teams, games, or staff assignments, or its league changed. Remove or move those records before deleting it.' }, 409);
  } catch (error) {
    console.error('Could not read or change divisions', error);
    return fieldResponse({ error: 'Divisions are unavailable. Try again.' }, 503);
  }
}
