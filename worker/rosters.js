async function currentRosterAccess(request, env) {
  if (!env.SUPABASE_URL) return false;
  const user = await currentClubUser(request, new URL('/auth/v1', env.SUPABASE_URL).href);
  const account = await getClubAccountState(env, user);
  return account?.is_active === 1 && canManageTeams(effectiveClubRoles(env, user, account));
}

const familyRosterColumns = 'display_name AS displayName, number, position';
const staffRosterColumns = 'id, name, birthday, revision, ' + familyRosterColumns;

function rosterPlayer(input) {
  if (!input || typeof input.id !== 'string' || !scheduleIdPattern.test(input.id) ||
      !Number.isSafeInteger(input.revision) || input.revision < 0 ||
      !Number.isInteger(input.number) || input.number < 0 || input.number > 999) return null;
  const fields = ['name', 'displayName', 'position', 'birthday'];
  if (fields.some((key) => typeof input[key] !== 'string')) return null;
  const [name, displayName, position, birthday] = fields.map((key) => input[key].trim());
  if (!name || name.length > 80 || displayName.length > 80 || position.length > 50) return null;
  if (birthday) {
    const date = new Date(birthday + 'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthday) || birthday.startsWith('0000') ||
        !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== birthday ||
        birthday > new Date().toISOString().slice(0, 10)) return null;
  }
  return { id: input.id.toLowerCase(), revision: input.revision, name, displayName, number: input.number, position, birthday: birthday || null };
}

async function saveRosterPlayer(env, teamId, seasonId, input) {
  const player = rosterPlayer(input);
  if (!player) return fieldResponse({ error: 'Enter a player name, a jersey number from 0 to 999, and valid optional details.' }, 400);
  const { id, revision, name, displayName, number, position, birthday } = player;
  const values = [name, displayName, number, position, birthday];
  const saved = revision === 0
    ? await env.DB.prepare(
      'INSERT INTO roster_players (id, team_id, season_id, name, display_name, number, position, birthday) ' +
      'VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING RETURNING ' + staffRosterColumns
    ).bind(id, teamId, seasonId, ...values).first()
    : await env.DB.prepare(
      'UPDATE roster_players SET name = ?, display_name = ?, number = ?, position = ?, birthday = ?, revision = revision + 1 ' +
      'WHERE id = ? AND team_id = ? AND season_id = ? AND revision = ? RETURNING ' + staffRosterColumns
    ).bind(...values, id, teamId, seasonId, revision).first();
  if (saved) return fieldResponse(saved);

  const current = await env.DB.prepare('SELECT ' + staffRosterColumns + ' FROM roster_players WHERE id = ? AND team_id = ? AND season_id = ?')
    .bind(id, teamId, seasonId).first();
  const keys = ['name', 'displayName', 'number', 'position', 'birthday'];
  if (current?.revision === revision + 1 && keys.every((key) => player[key] === current[key])) return fieldResponse(current);
  return fieldResponse({ error: 'This player changed in another session. Refresh before saving.' }, 409);
}

async function rosterApi(request, env, origin, params) {
  try {
    if (!['GET', 'POST'].includes(request.method)) return fieldResponse({ error: 'Method not allowed.' }, 405);
    const write = request.method === 'POST';
    const privateFields = params.get('view') === 'staff';
    const staff = write || privateFields || params.get('view') === 'preview';
    if (staff && !await currentRosterAccess(request, env)) {
      return fieldResponse({ error: 'Your account does not have access to staff rosters.' }, 403);
    }
    if (write) {
      const failure = validateWrite(request, origin);
      if (failure) return failure;
    }
    const teamId = params.get('teamId');
    const team = teamId && scheduleIdPattern.test(teamId) &&
      await env.DB.prepare('SELECT id FROM club_teams WHERE id = ?').bind(teamId).first();
    const season = await findSeason(env, params.get('season'), staff);
    if (!team || !season) return fieldResponse({ error: 'Team or season unavailable.' }, 404);
    if (write) return await saveRosterPlayer(env, team.id, season.id, await request.json().catch(() => null));
    const columns = privateFields ? staffRosterColumns : familyRosterColumns;
    const { results } = await env.DB.prepare('SELECT ' + columns + ' FROM roster_players WHERE team_id = ? AND season_id = ? ORDER BY number, id')
      .bind(team.id, season.id).all();
    return fieldResponse(results);
  } catch (error) {
    console.error('Could not load or save roster', error);
    return fieldResponse({ error: 'Roster unavailable. Try again.' }, 503);
  }
}
