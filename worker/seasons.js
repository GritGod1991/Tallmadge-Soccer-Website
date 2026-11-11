async function findSeason(env, id, includeTest = false) {
  if (id !== undefined && id !== null && (typeof id !== 'string' || !id || id.length > 80)) return null;
  return env.DB.prepare(
    'SELECT id, name, is_active, is_test FROM club_seasons WHERE ' +
    (id == null ? 'is_active = 1' : 'id = ?') + (includeTest ? '' : ' AND is_test = 0')
  ).bind(...(id == null ? [] : [id])).first();
}

async function seasonsApi(request, env, origin, params) {
  try {
    if (request.method === 'GET') {
      const staff = params.get('staff') === '1';
      if (staff && !(await currentScheduleAccess(request, env, true) || await currentScheduleAccess(request, env))) {
        return fieldResponse({ error: 'Sign in with a schedule or score management account.' }, 403);
      }
      const { results } = await env.DB.prepare(
        'SELECT id, name, is_active, is_test FROM club_seasons ' +
        (staff ? '' : 'WHERE is_test = 0 ') + 'ORDER BY is_active DESC, is_test, rowid DESC'
      ).all();
      return fieldResponse(results);
    }
    if (request.method !== 'POST') return fieldResponse({ error: 'Method not allowed.' }, 405);
    const failure = validateWrite(request, origin);
    if (failure) return failure;
    const user = env.SUPABASE_URL ? await currentClubUser(request, new URL('/auth/v1', env.SUPABASE_URL).href) : null;
    const account = await getClubAccountState(env, user);
    if (account?.is_active !== 1 || !effectiveClubRoles(env, user, account).includes('Owner')) {
      return fieldResponse({ error: 'Only the Owner can manage seasons.' }, 403);
    }
    const input = await request.json().catch(() => null);
    if (!['create', 'rename', 'delete', 'activate'].includes(input?.action)) {
      return fieldResponse({ error: 'Choose a valid season action.' }, 400);
    }
    const { action, id } = input;
    if (action !== 'create' && (typeof id !== 'string' || !id || id.length > 80)) {
      return fieldResponse({ error: 'Choose a valid season.' }, 400);
    }
    if (action === 'create' || action === 'rename') {
      const name = typeof input.name === 'string' ? input.name.trim().replace(/\s+/g, ' ') : '';
      if (!name || name.length > 60) return fieldResponse({ error: 'Enter a season name from 1 to 60 characters.' }, 400);
      const saved = action === 'create' ? await env.DB.prepare(
        'INSERT INTO club_seasons (id, name) VALUES (?, ?) ON CONFLICT(name) DO NOTHING RETURNING id, name, is_active, is_test'
      ).bind(crypto.randomUUID(), name).first() : await env.DB.prepare(
        'UPDATE OR IGNORE club_seasons SET name = ? WHERE id = ? RETURNING id, name, is_active, is_test'
      ).bind(name, id).first();
      if (saved) return fieldResponse(saved);
      if (action === 'rename' && !await findSeason(env, id, true)) {
        return fieldResponse({ error: 'This season no longer exists. Refresh to update the list.' }, 404);
      }
      return fieldResponse({ error: 'A season with that name already exists.' }, 409);
    }
    if (action === 'delete') {
      const deleted = await env.DB.prepare(
        'DELETE FROM club_seasons WHERE id = ? AND is_active = 0 ' +
        'AND NOT EXISTS (SELECT 1 FROM scheduled_games WHERE season_id = club_seasons.id) ' +
        'AND NOT EXISTS (SELECT 1 FROM roster_players WHERE season_id = club_seasons.id) RETURNING id'
      ).bind(id).first();
      if (deleted) return fieldResponse({ deleted: true });
      const current = await findSeason(env, id, true);
      if (!current) return fieldResponse({ deleted: true });
      return fieldResponse({ error: current.is_active ? 'Make another season active before deleting this one.' :
        'This season still has games or roster entries. Clear those records before deleting it.' }, 409);
    }
    // Check that the target still exists in the same transaction as the switch.
    const [, activated] = await env.DB.batch([
      env.DB.prepare(
        'UPDATE club_seasons SET is_active = 0 WHERE is_active = 1 AND id <> ? ' +
        'AND EXISTS (SELECT 1 FROM club_seasons WHERE id = ? AND is_test = 0)'
      ).bind(id, id),
      env.DB.prepare('UPDATE club_seasons SET is_active = 1 WHERE id = ? AND is_test = 0 RETURNING id, name, is_active, is_test').bind(id),
    ]);
    return activated.results[0] ? fieldResponse(activated.results[0]) :
      fieldResponse({ error: 'Choose an official season to make active.' }, 400);
  } catch (error) {
    console.error('Could not read or save seasons', error);
    return fieldResponse({ error: 'Seasons are unavailable. Try again.' }, 503);
  }
}
