const clubSessionCookie = '__Host-tallmadge-club';
const clubCookieAttributes = 'Path=/; Secure; HttpOnly; SameSite=Lax';
// Public signing key for the configured Supabase project. Update on signing-key rotation.
const clubSigningKey = {
  kid: '35597c26-81e7-48e8-af33-c1bfb8d8006d', kty: 'EC', crv: 'P-256',
  x: 'xe1IqlT2omKduFQl1NuM_MuTWvTn7_RoYRpZD1AOhpQ',
  y: 'PVylllFP1bMMMFWliwUeIQBfTv2HJzmD5EWT2NavTlw',
};

function clubResponse(body, status = 200, cookie) {
  const headers = { 'Cache-Control': 'no-store' };
  if (cookie) headers['Set-Cookie'] = cookie;
  return Response.json(body, { status, headers });
}

function jwtBytes(value) {
  return Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), (char) => char.charCodeAt(0));
}

async function verifyClubToken(token, issuer) {
  if (typeof token !== 'string' || token.length > 3800 || !/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) return null;
  try {
    const [head, body, signature] = token.split('.');
    const decoder = new TextDecoder();
    const header = JSON.parse(decoder.decode(jwtBytes(head)));
    if (header.alg !== 'ES256' || header.kid !== clubSigningKey.kid) return null;
    const key = await crypto.subtle.importKey('jwk', clubSigningKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, key, jwtBytes(signature), new TextEncoder().encode(head + '.' + body));
    if (!valid) return null;
    const claims = JSON.parse(decoder.decode(jwtBytes(body)));
    const now = Math.floor(Date.now() / 1000);
    if (claims.iss !== issuer || claims.aud !== 'authenticated' || claims.role !== 'authenticated' ||
        !Number.isInteger(claims.exp) || claims.exp <= now || (claims.nbf ?? 0) > now ||
        typeof claims.sub !== 'string' || !claims.sub || typeof claims.email !== 'string' || !claims.email) return null;
    return claims;
  } catch {
    return null;
  }
}

function clubRequestToken(request) {
  return request.headers.get('Cookie')?.split(';').map((part) => part.trim())
    .find((part) => part.startsWith(clubSessionCookie + '='))?.slice(clubSessionCookie.length + 1);
}

function profileName(value) {
  return typeof value === 'string' ? value.trim().slice(0, 80) || null : null;
}

async function recordClubAccount(env, user) {
  const firstName = profileName(user.user_metadata?.first_name);
  const lastName = profileName(user.user_metadata?.last_name);
  await env.DB.prepare(
    'INSERT INTO club_accounts (user_id, email, first_name, last_name) SELECT ?, ?, ?, ? ' +
    'WHERE NOT EXISTS (SELECT 1 FROM deleted_club_accounts WHERE user_id = ?) ' +
    'ON CONFLICT(user_id) DO UPDATE SET email = excluded.email, ' +
    'first_name = COALESCE(excluded.first_name, club_accounts.first_name), ' +
    'last_name = COALESCE(excluded.last_name, club_accounts.last_name) ' +
    'WHERE club_accounts.is_active = 1 AND (club_accounts.email <> excluded.email OR ' +
    '(excluded.first_name IS NOT NULL AND club_accounts.first_name IS NOT excluded.first_name) OR ' +
    '(excluded.last_name IS NOT NULL AND club_accounts.last_name IS NOT excluded.last_name))'
  ).bind(user.sub, user.email.trim().toLowerCase(), firstName, lastName, user.sub).run();
  return (await getClubAccountState(env, user))?.is_active === 1;
}

async function currentClubUser(request, issuer) {
  return await verifyClubToken(clubRequestToken(request), issuer)
    ?? await verifyClubToken(request.headers.get('X-Tallmadge-Club-Session'), issuer);
}

const clubRoles = new Set([
  'Parent', 'Concession', 'Score Keeper', 'Field Manager', 'Assistant Coach',
  'Head Coach', 'Manager', 'Admin', 'Super Admin',
]);

function assignedClubRoles(account) {
  if (!account) return [];
  if (account.club_roles_json === null || account.club_roles_json === undefined) {
    return clubRoles.has(account.club_role) ? [account.club_role] : [];
  }
  return JSON.parse(account.club_roles_json).filter((role) => clubRoles.has(role));
}

function effectiveClubRoles(env, user, account) {
  if (!user) return [];
  return isOwner(user.email.trim().toLowerCase(), env) ? ['Owner'] : assignedClubRoles(account);
}

function getClubAccountState(env, user) {
  if (!user) return null;
  return env.DB.prepare('SELECT club_role, club_roles_json, is_active, schedule_teams_json FROM club_accounts WHERE user_id = ?').bind(user.sub).first();
}

function canManageClubAccounts(env, user, account) {
  return Boolean(user && account?.is_active === 1 &&
    (isOwner(user.email.trim().toLowerCase(), env) || assignedClubRoles(account).includes('Super Admin')));
}

function authDirectoryRequest(env, name, body) {
  return fetch(new URL('/rest/v1/rpc/' + name, env.SUPABASE_URL), {
    method: 'POST',
    headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(4000),
    // Do not forward the lookup or delete credential to a redirect target.
    redirect: 'manual',
  });
}

async function currentAuthIds(env, userIds) {
  if (!env.CLUB_AUTH_DIRECTORY_TOKEN || !env.SUPABASE_PUBLISHABLE_KEY) return null;
  const current = new Set();
  try {
    for (let offset = 0; offset < userIds.length; offset += 200) {
      const ids = userIds.slice(offset, offset + 200);
      const response = await authDirectoryRequest(env, 'tallmadge_current_auth_ids', {
        requested_ids: ids, lookup_token: env.CLUB_AUTH_DIRECTORY_TOKEN,
      });
      if (!response.ok) return null;
      const matches = await response.json();
      if (!Array.isArray(matches) || !matches.every((id) => ids.includes(id))) return null;
      for (const id of matches) current.add(id);
    }
    return current;
  } catch {
    return null;
  }
}

async function removeClubProfiles(env, userIds) {
  const ids = JSON.stringify(userIds);
  const matching = ' WHERE user_id IN (SELECT value FROM json_each(?))';
  // Remember only the ID so a still-valid token cannot recreate the deleted profile.
  await env.DB.batch([
    env.DB.prepare('INSERT OR IGNORE INTO deleted_club_accounts (user_id) SELECT user_id FROM club_accounts' + matching).bind(ids),
    env.DB.prepare('DELETE FROM club_accounts' + matching).bind(ids),
  ]);
}

async function listClubAccounts(env, user, sync) {
  const { results } = await env.DB.prepare(
    'SELECT user_id, email, first_name, last_name, club_role, club_roles_json, schedule_teams_json, is_active, first_seen_at FROM club_accounts ORDER BY email'
  ).all();
  const current = await currentAuthIds(env, results.map((account) => account.user_id));
  const deleted = current ? results.filter((account) => !current.has(account.user_id)).map((account) => account.user_id) : [];
  if (sync && deleted.length) {
    await removeClubProfiles(env, deleted);
  }
  if (current && !current.has(user.sub)) {
    return clubResponse({ error: 'This Tallmadge Soccer account has been deleted.' }, 403);
  }
  return clubResponse(results.filter((account) => !sync || !current || current.has(account.user_id))
    .map(({ club_role, club_roles_json, schedule_teams_json, ...account }) => {
      const authStatus = !current ? 'unknown' : current.has(account.user_id) ? 'current' : 'deleted';
      const owner = isOwner(account.email, env);
      const editable = authStatus !== 'deleted' && account.user_id !== user.sub && !owner;
      return {
        ...account, authStatus, roles: owner ? ['Owner'] : assignedClubRoles({ club_role, club_roles_json }),
        scheduleTeams: JSON.parse(schedule_teams_json),
        editable, deletable: editable && authStatus === 'current' && Boolean(env.CLUB_AUTH_DELETE_TOKEN),
      };
    }));
}

async function deleteClubAccount(env, user, userId) {
  const ownerEmail = env.FIELD_STATUS_OWNER_EMAIL?.trim().toLowerCase();
  if (!ownerEmail || !env.CLUB_AUTH_DELETE_TOKEN) {
    return clubResponse({ error: 'Account deletion has not been connected to Supabase yet.' }, 503);
  }
  const target = await env.DB.prepare('SELECT email FROM club_accounts WHERE user_id = ?').bind(userId).first();
  if (!target) return clubResponse({ deleted: true });
  if (userId === user.sub || isOwner(target.email, env)) {
    return clubResponse({ error: 'The owner account and your own account are protected.' }, 403);
  }
  const response = await authDirectoryRequest(env, 'tallmadge_delete_auth_user', {
    target_id: userId, expected_email: target.email, actor_id: user.sub, protected_email: ownerEmail,
    delete_token: env.CLUB_AUTH_DELETE_TOKEN,
  });
  if (!response.ok) {
    return clubResponse({ error: 'Supabase could not delete this account. Check that the delete function is installed and that the user owns no Supabase Storage files.' }, 503);
  }
  if (await response.json() !== true) {
    return clubResponse({ error: 'This account could not be deleted. Its email or your access may have changed. Refresh and try again.' }, 409);
  }
  await removeClubProfiles(env, [userId]);
  return clubResponse({ deleted: true });
}

async function clubDirectory(request, env, origin) {
  if (!['GET', 'POST'].includes(request.method)) return clubResponse({ error: 'Method not allowed.' }, 405);
  try {
    const issuer = new URL('/auth/v1', env.SUPABASE_URL).href;
    const user = await currentClubUser(request, issuer);
    if (!user) return clubResponse({ error: 'Sign in with your Tallmadge Soccer account to view club accounts.' }, 401);
    if (!canManageClubAccounts(env, user, await getClubAccountState(env, user))) {
      return clubResponse({ error: 'Only active owners and Super Admins can manage club accounts.' }, 403);
    }
    if (request.method === 'GET') return await listClubAccounts(env, user, false);

    const failure = validateWrite(request, origin);
    if (failure) return failure;
    const input = await request.json().catch(() => null);
    if (input?.action === 'sync') return await listClubAccounts(env, user, true);
    if (input?.action === 'delete') {
      if (typeof input.userId !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(input.userId)) {
        return clubResponse({ error: 'Choose a valid account to delete.' }, 400);
      }
      return await deleteClubAccount(env, user, input.userId);
    }
    if (typeof input?.userId !== 'string' || !input.userId || input.userId.length > 100 ||
        (!Array.isArray(input.roles) || input.roles.length > clubRoles.size || !input.roles.every((role) => clubRoles.has(role))) || typeof input.active !== 'boolean') {
      return clubResponse({ error: 'Choose valid roles and an account status.' }, 400);
    }
    const parsedTeams = input.scheduleTeams === undefined ? undefined : scheduleAssignments(input.scheduleTeams);
    const teams = parsedTeams ? await resolveTeamAssignments(env, parsedTeams) : parsedTeams;
    if (teams === null || teams?.includes(null)) return clubResponse({ error: 'Choose a valid club team for each assignment.' }, 400);
    const scheduleTeams = input.roles.some((role) => scoreTeamRoles.includes(role)) ? teams : [];
    const serializedTeams = scheduleTeams === undefined ? null : JSON.stringify(scheduleTeams);
    const target = await getClubAccountState(env, { sub: input.userId });
    if (target) {
      const current = await currentAuthIds(env, [input.userId]);
      if (current && !current.has(input.userId)) {
        return clubResponse({ error: 'This Supabase user was deleted. Refresh the directory to remove its old profile.' }, 409);
      }
    }
    const owner = isOwner(user.email.trim().toLowerCase(), env);
    const changed = await env.DB.prepare(
      'UPDATE club_accounts SET club_roles_json = ?, is_active = ?, schedule_teams_json = COALESCE(?, schedule_teams_json) ' +
      'WHERE user_id = ? AND user_id <> ? AND email <> ? ' +
      'AND (? = 1 OR EXISTS (SELECT 1 FROM club_accounts AS actor ' +
      'JOIN json_each(COALESCE(actor.club_roles_json, json_array(actor.club_role))) AS role ' +
      'WHERE actor.user_id = ? AND role.value = ? AND actor.is_active = 1)) ' +
      "AND NOT EXISTS (SELECT 1 FROM json_each(?) AS item WHERE NOT EXISTS (SELECT 1 FROM club_divisions WHERE name = json_extract(item.value, '$.division') COLLATE BINARY) OR (json_extract(item.value, '$.teamId') IS NOT NULL " +
      "AND NOT EXISTS (SELECT 1 FROM club_teams WHERE id = json_extract(item.value, '$.teamId')))) " +
      'RETURNING club_role, club_roles_json, is_active, schedule_teams_json'
    ).bind(JSON.stringify([...new Set(input.roles)]), Number(input.active), serializedTeams, input.userId, user.sub,
      env.FIELD_STATUS_OWNER_EMAIL?.trim().toLowerCase() ?? '', Number(owner), user.sub, 'Super Admin', serializedTeams).first();
    if (!changed) return clubResponse({ error: 'This account cannot be changed, or your access has changed.' }, 403);
    return clubResponse({ roles: assignedClubRoles(changed), is_active: changed.is_active, scheduleTeams: JSON.parse(changed.schedule_teams_json) });
  } catch {
    return clubResponse({ error: 'Could not load or save club accounts. Try again.' }, 503);
  }
}

async function clubAccount(request, env, origin) {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) {
    return clubResponse({ error: 'Club sign-in is unavailable.' }, 503);
  }
  const issuer = new URL('/auth/v1', env.SUPABASE_URL).href;
  const clear = `${clubSessionCookie}=; ${clubCookieAttributes}; Max-Age=0`;
  if (request.method === 'GET') {
    const token = clubRequestToken(request);
    let user = await currentClubUser(request, issuer);
    let account;
    try {
      account = await getClubAccountState(env, user);
    } catch {
      return clubResponse({ error: 'Could not check your club account.' }, 503);
    }
    if (account?.is_active !== 1) user = null;
    const canManageAccounts = canManageClubAccounts(env, user, account);
    const roles = effectiveClubRoles(env, user, account);
    const schedules = scheduleAccess(roles, account);
    const scoreDivisions = roles.some((role) => scoreTeamRoles.includes(role)) ? await clubDivisions(env) : [];
    const canManageFields = roles.includes('Owner') || roles.some((role) => publisherRoles.has(role));
    return clubResponse({ email: user?.email ?? null, roles, canManageAccounts, canManageFields, canManageTeams: canManageTeams(roles), canUpdateSchedules: Boolean(schedules), canEnterScores: Boolean(scheduleAccess(roles, account, true, scoreDivisions)), scheduleTeams: schedules?.teams ?? [], issuer, publishableKey: env.SUPABASE_PUBLISHABLE_KEY }, 200, token && !user ? clear : undefined);
  }
  if (request.method !== 'POST') return clubResponse({ error: 'Method not allowed.' }, 405);
  const failure = validateWrite(request, origin);
  if (failure) return failure;
  const input = await request.json().catch(() => null);
  if (input?.action === 'signout') return clubResponse({ email: null }, 200, clear);
  if (input?.action === 'record-account') {
    const user = await currentClubUser(request, issuer);
    if (!user) return clubResponse({ error: 'Sign in to record this account.' }, 401);
    try {
      if (!await recordClubAccount(env, user)) {
        return clubResponse({ error: 'This Tallmadge Soccer account is inactive or deleted.' }, 403, clear);
      }
      return clubResponse({ recorded: true });
    } catch {
      return clubResponse({ error: 'Could not record this account.' }, 503);
    }
  }
  if (input?.action !== 'session') return clubResponse({ error: 'Choose a valid account action.' }, 400);
  const user = await verifyClubToken(input.token, issuer);
  if (!user) return clubResponse({ error: 'Could not verify the club sign-in session.' }, 401);
  try {
    if (!await recordClubAccount(env, user)) {
      return clubResponse({ error: 'This Tallmadge Soccer account is inactive or deleted. Contact the club owner.' }, 403, clear);
    }
  } catch {
    return clubResponse({ error: 'Could not record this account. Try signing in again.' }, 503);
  }
  const seconds = Math.min(user.exp - Math.floor(Date.now() / 1000), 3600);
  return clubResponse({ email: user.email }, 200, `${clubSessionCookie}=${input.token}; ${clubCookieAttributes}; Max-Age=${seconds}`);
}
