const scheduleColumns = 'id, division, home, away, date, time, field_id AS field, away_field_name AS awayFieldName, revision, final_score_json, home_team_id AS homeTeamId, away_team_id AS awayTeamId, season_id AS seasonId';
const scoreTeamRoles = ['Head Coach', 'Assistant Coach', 'Score Keeper'];

function withFinalScore({ final_score_json, ...game }) {
  return { ...game, score: final_score_json ? JSON.parse(final_score_json) : null };
}
const scheduleIdPattern = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const scheduleInputs = ['division', 'home', 'away', 'date', 'time', 'field'];

function scheduleAssignments(input) {
  if (!Array.isArray(input) || input.length > 20) return null;
  const assignments = new Map();
  for (const item of input) {
    if (typeof item?.teamId === 'string' && scheduleIdPattern.test(item.teamId)) {
      const teamId = item.teamId.toLowerCase();
      assignments.set(teamId, { teamId });
      continue;
    }
    const division = typeof item?.division === 'string' ? item.division.trim() : '';
    const team = typeof item?.team === 'string' ? item.team.trim() : '';
    if (!division || division.length > 60 || !team || team.length > 80) return null;
    assignments.set(JSON.stringify([division, team.toLowerCase()]), { division, team });
  }
  return [...assignments.values()];
}

function scheduleAccess(roles, account, scores = false, divisions = []) {
  if (roles.some((role) => ['Owner', 'Admin', 'Super Admin'].includes(role)) ||
      (scores && roles.includes('Manager'))) return { all: true };
  const teamRoles = scores ? scoreTeamRoles : ['Head Coach'];
  if (!roles.some((role) => teamRoles.includes(role))) return null;
  const teams = JSON.parse(account?.schedule_teams_json ?? '[]')
    .filter(({ division }) => !scores || divisions.some((item) => item.name === division && item.league === 'travel'));
  return teams.length ? { teams } : null;
}

function canChangeScheduledGame(access, game) {
  if (access.all) return true;
  return access.teams.some((assignment) => assignment.division === game.division &&
    ['home', 'away'].some((side) => {
      const linkedId = game[side + 'TeamId'];
      return assignment.teamId && linkedId ? assignment.teamId === linkedId :
        game[side].toLowerCase() === assignment.team.toLowerCase();
    }));
}

async function currentScheduleAccess(request, env, scores = false) {
  if (!env.SUPABASE_URL) return null;
  const user = await currentClubUser(request, new URL('/auth/v1', env.SUPABASE_URL).href);
  const account = await getClubAccountState(env, user);
  return account?.is_active === 1 ? scheduleAccess(effectiveClubRoles(env, user, account), account, scores, scores ? await clubDivisions(env) : []) : null;
}

async function checkScheduledGameScope(access, game, env) {
  if (access.all || game.revision === 0) return;
  const saved = await env.DB.prepare('SELECT ' + scheduleColumns + ' FROM scheduled_games WHERE id = ?')
    .bind(game.id).first();
  if (saved && !canChangeScheduledGame(access, saved)) {
    return fieldResponse({ error: 'You can only change games for your assigned teams.' }, 403);
  }
}

function scheduleInput(input) {
  if (!input || typeof input.id !== 'string' ||
      !scheduleIdPattern.test(input.id) ||
      !Number.isSafeInteger(input.revision) || input.revision < 0 ||
      scheduleInputs.some((key) => typeof input[key] !== 'string')) return null;

  const game = Object.fromEntries(scheduleInputs.map((key) => [key, input[key].trim()]));
  const { division, home, away, date, time, field } = game;
  if (!division || division.length > 60 || (field !== 'away' && !fieldIds.has(field)) ||
      !home || !away || home.length > 80 || away.length > 80 ||
      home.toLowerCase() === away.toLowerCase() ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date) || date.startsWith('0000') ||
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return null;
  const day = new Date(date + 'T00:00:00Z');
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== date) return null;
  const awayFieldName = field === 'away' && typeof input.awayFieldName === 'string' ? input.awayFieldName.trim() : null;
  if (field === 'away' && (!awayFieldName || awayFieldName.length > 120)) return null;
  return { id: input.id.toLowerCase(), revision: input.revision, ...game, awayFieldName };
}

async function saveScheduledGame(input, env, access) {
  const game = scheduleInput(input);
  if (!game) return fieldResponse({ error: 'Choose a division, two different teams, a valid date and time, and a club field or an away venue name.' }, 400);

  if (!(await clubDivisions(env)).some((division) => division.name === game.division)) {
    return fieldResponse({ error: 'Choose an available division.' }, 400);
  }
  const teams = await clubTeams(env);
  for (const side of ['home', 'away']) {
    const id = input[side + 'TeamId'];
    const match = teams.find((team) => team.division === game.division &&
      (id ? team.id === id : team.name.toLowerCase() === game[side].toLowerCase()));
    if (id && !match) return fieldResponse({ error: 'Choose a club team from this division.' }, 400);
    game[side + 'TeamId'] = match?.id ?? null;
    if (match) game[side] = match.name;
  }
  if (game.home.toLowerCase() === game.away.toLowerCase()) {
    return fieldResponse({ error: 'Choose two different teams.' }, 400);
  }
  if (!canChangeScheduledGame(access, game)) {
    return fieldResponse({ error: 'Choose a game involving one of your assigned teams.' }, 403);
  }
  const failure = await checkScheduledGameScope(access, game, env);
  if (failure) return failure;
  const previous = game.revision > 0 && input.seasonId == null ? await env.DB.prepare(
    'SELECT season_id AS seasonId FROM scheduled_games WHERE id = ?'
  ).bind(game.id).first() : null;
  const season = await findSeason(env, input.seasonId ?? previous?.seasonId, true);
  if (!season) return fieldResponse({ error: 'Choose a valid season for this game.' }, 400);
  game.seasonId = season.id;
  const values = scheduleInputs.map((key) => game[key]);
  const teamIds = [game.homeTeamId, game.awayTeamId];
  const currentNames = ' AND EXISTS (SELECT 1 FROM club_divisions WHERE name = ? COLLATE BINARY)' +
    ' AND (? IS NULL OR EXISTS (SELECT 1 FROM club_teams WHERE id = ? AND name = ?))' +
    ' AND (? IS NULL OR EXISTS (SELECT 1 FROM club_teams WHERE id = ? AND name = ?))';
  const nameChecks = [game.division, game.homeTeamId, game.homeTeamId, game.home, game.awayTeamId, game.awayTeamId, game.away];
  const write = game.revision === 0
    ? env.DB.prepare(
      'INSERT INTO scheduled_games (division, home, away, date, time, field_id, away_field_name, id, home_team_id, away_team_id, season_id) ' +
      'SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE 1 = 1' + currentNames + ' ON CONFLICT(id) DO NOTHING RETURNING ' + scheduleColumns
    ).bind(...values, game.awayFieldName, game.id, ...teamIds, game.seasonId, ...nameChecks)
    : env.DB.prepare(
      'UPDATE scheduled_games SET division = ?, home = ?, away = ?, date = ?, time = ?, field_id = ?, away_field_name = ?, home_team_id = ?, away_team_id = ?, ' +
      'revision = revision + 1 WHERE id = ? AND revision = ? AND season_id = ? ' +
      'AND (final_score_json IS NULL OR (division = ? AND home = ? AND away = ?))' + currentNames + ' RETURNING ' + scheduleColumns
    ).bind(...values, game.awayFieldName, ...teamIds, game.id, game.revision, game.seasonId, game.division, game.home, game.away, ...nameChecks);

  // A reserved reference satisfies the field foreign key without listing away venues as club fields.
  let saved;
  if (game.field === 'away') {
    const [, result] = await env.DB.batch([
      env.DB.prepare("INSERT INTO fields (field_id, status) VALUES ('away', 'Unknown') ON CONFLICT(field_id) DO NOTHING"),
      write,
    ]);
    saved = result.results[0];
  } else {
    saved = await write.first();
  }

  if (saved) return fieldResponse(withFinalScore(saved));
  const current = await env.DB.prepare('SELECT ' + scheduleColumns + ' FROM scheduled_games WHERE id = ?').bind(game.id).first();
  if (current?.revision === game.revision + 1 && [...scheduleInputs, 'awayFieldName', 'homeTeamId', 'awayTeamId', 'seasonId'].every((key) => game[key] === current[key])) {
    return fieldResponse(withFinalScore(current));
  }
  if (current?.revision === game.revision && current.final_score_json) {
    return fieldResponse({ error: 'The division and teams of a game with a final score are locked.' }, 409);
  }
  return fieldResponse({ error: 'This game changed in another session. Refresh the schedule before editing it again.' }, 409);
}

async function deleteScheduledGame(input, env, access) {
  if (typeof input?.id !== 'string' || !scheduleIdPattern.test(input.id) ||
      !Number.isSafeInteger(input.revision) || input.revision < 1) {
    return fieldResponse({ error: 'Choose a valid saved game to delete.' }, 400);
  }
  const id = input.id.toLowerCase();
  const failure = await checkScheduledGameScope(access, { id, revision: input.revision }, env);
  if (failure) return failure;
  const deleted = await env.DB.prepare('DELETE FROM scheduled_games WHERE id = ? AND revision = ? RETURNING id')
    .bind(id, input.revision).first();
  if (!deleted && await env.DB.prepare('SELECT id FROM scheduled_games WHERE id = ?').bind(id).first()) {
    return fieldResponse({ error: 'This game changed in another session. Refresh before deleting it.' }, 409);
  }
  return fieldResponse({ deleted: true });
}

const upcomingGameClock = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

async function upcomingGames(request, env) {
  if (request.method !== 'GET') return fieldResponse({ error: 'Method not allowed.' }, 405);
  try {
    const [date, time] = upcomingGameClock.format(new Date()).split(' ');
    const { results } = await env.DB.prepare(
      'SELECT games.division, games.home, games.away, games.date, games.time, games.field_id AS field, games.away_field_name AS awayFieldName, ' +
      'games.home_team_id AS homeTeamId, games.away_team_id AS awayTeamId, games.season_id AS seasonId, ' +
      'division.league, season.name AS seasonName FROM scheduled_games AS games ' +
      'JOIN club_seasons AS season ON season.id = games.season_id AND season.is_test = 0 ' +
      'JOIN club_divisions AS division ON games.division = division.name ' +
      'WHERE games.final_score_json IS NULL AND (games.date, games.time) >= (?, ?) ' +
      'ORDER BY games.date, games.time, games.id LIMIT 8'
    ).bind(date, time).all();
    return fieldResponse(results);
  } catch (error) {
    console.error('Could not read upcoming games', error);
    return fieldResponse({ error: 'Upcoming games are unavailable.' }, 503);
  }
}

async function scheduleApi(request, env, origin, searchParams) {
  try {
    if (request.method === 'GET') {
      const division = searchParams.get('division');
      if (division === null) {
        const access = await currentScheduleAccess(request, env);
        if (!access) return fieldResponse({ error: 'Your account does not have access to Update Schedules.' }, 403);
        const season = await findSeason(env, searchParams.get('season'), true);
        if (!season) return fieldResponse({ error: 'Season unavailable.' }, 404);
        const { results } = await env.DB.prepare('SELECT ' + scheduleColumns + ' FROM scheduled_games WHERE season_id = ? ORDER BY date, time, id')
          .bind(season.id).all();
        return fieldResponse(results.filter((game) => canChangeScheduledGame(access, game)).map(withFinalScore));
      }

      const team = searchParams.get('team')?.trim();
      const teamId = searchParams.get('teamId');
      if (!(await clubDivisions(env)).some((item) => item.name === division) || (teamId !== null && !scheduleIdPattern.test(teamId)) || (team !== undefined && (!team || team.length > 80))) {
        return fieldResponse({ error: 'Choose a valid division and team.' }, 400);
      }
      const season = await findSeason(env, searchParams.get('season'));
      if (!season) return fieldResponse({ error: 'Season unavailable.' }, 404);
      const { results } = await env.DB.prepare(
        'SELECT ' + scheduleColumns + ' FROM scheduled_games WHERE division = ? AND season_id = ? ORDER BY date, time, id'
      ).bind(division, season.id).all();
      const teamKey = team?.toLowerCase();
      const matching = results.filter((game) => ['home', 'away'].some((side) => {
        const linkedId = game[side + 'TeamId'];
        if (teamId && linkedId) return linkedId === teamId;
        return teamKey ? game[side].toLowerCase() === teamKey : !teamId;
      }));
      return fieldResponse(matching.map(withFinalScore));
    }
    if (request.method !== 'POST' && request.method !== 'DELETE') {
      return fieldResponse({ error: 'Method not allowed.' }, 405);
    }
    const access = await currentScheduleAccess(request, env);
    if (!access) return fieldResponse({ error: 'Your account does not have access to Update Schedules.' }, 403);
    const failure = validateWrite(request, origin);
    if (failure) return failure;
    const input = await request.json().catch(() => null);
    return await (request.method === 'DELETE' ? deleteScheduledGame(input, env, access) : saveScheduledGame(input, env, access));
  } catch (error) {
    console.error('Could not read or change schedules', error);
    return fieldResponse({ error: 'Schedules are unavailable. Try again.' }, 503);
  }
}

async function scoreApi(request, env, origin, searchParams, ctx) {
  try {
    if (!['GET', 'POST'].includes(request.method)) return fieldResponse({ error: 'Method not allowed.' }, 405);
    const access = await currentScheduleAccess(request, env, true);
    if (!access) return fieldResponse({ error: 'Your account does not have access to Enter Scores.' }, 403);
    if (request.method === 'GET') {
      const season = await findSeason(env, searchParams.get('season'), true);
      if (!season) return fieldResponse({ error: 'Season unavailable.' }, 404);
      const { results } = await env.DB.prepare(
        'SELECT ' + scheduleColumns + " FROM scheduled_games WHERE season_id = ? AND division IN (SELECT name FROM club_divisions WHERE league = 'travel') ORDER BY date, time, id"
      ).bind(season.id).all();
      return fieldResponse(results.filter((game) => canChangeScheduledGame(access, game)).map(withFinalScore));
    }

    const failure = validateWrite(request, origin);
    if (failure) return failure;
    const input = await request.json().catch(() => null);
    if (typeof input?.id !== 'string' || !scheduleIdPattern.test(input.id) ||
        !Number.isSafeInteger(input.revision) || input.revision < 1 ||
        !Array.isArray(input.score) || input.score.length !== 2 ||
        !input.score.every((goals) => Number.isSafeInteger(goals) && goals >= 0 && goals <= 99)) {
      return fieldResponse({ error: 'Choose a saved game and enter both goal totals from 0 to 99.' }, 400);
    }

    const id = input.id.toLowerCase();
    const game = await env.DB.prepare('SELECT ' + scheduleColumns + ' FROM scheduled_games WHERE id = ?').bind(id).first();
    if (!game) return fieldResponse({ error: 'This game no longer exists. Refresh to see the current schedule.' }, 404);
    if (!(await clubDivisions(env)).some((item) => item.name === game.division && item.league === 'travel') || !canChangeScheduledGame(access, game)) {
      return fieldResponse({ error: 'You can only enter scores for Classic Travel games you manage.' }, 403);
    }
    const score = JSON.stringify(input.score);
    if (game.final_score_json === score && (game.revision === input.revision || game.revision === input.revision + 1)) {
      return fieldResponse(withFinalScore(game));
    }

    const saved = await env.DB.prepare(
      'UPDATE scheduled_games SET final_score_json = ?, score_updated_at = CURRENT_TIMESTAMP, revision = revision + 1 WHERE id = ? AND revision = ? RETURNING ' + scheduleColumns
    ).bind(score, id, input.revision).first();
    if (!saved) return fieldResponse({ error: 'This game changed in another session. Refresh before saving the score.' }, 409);
    queueNewsCopy(env, ctx, id, ['result', 'standings']);
    return fieldResponse(withFinalScore(saved));
  } catch (error) {
    console.error('Could not read or save scores', error);
    return fieldResponse({ error: 'Scores are unavailable. Try again.' }, 503);
  }
}
