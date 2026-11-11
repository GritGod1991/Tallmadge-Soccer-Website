const fieldIds = new Set(['1', '2A', '2B', '3A', '3B', '4A', '4B', '5A', '5B', '6A', '6B']);
const fieldStatuses = new Set(['Unknown', 'Open', 'Closed']);

function fieldResponse(body, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

const publisherRoles = new Set(['Field Manager', 'Manager', 'Admin', 'Super Admin']);

function visitorEmail(request) {
  return request.headers.get('oai-authenticated-user-id')
    ? request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase()
    : undefined;
}

function isOwner(email, env) {
  return Boolean(email && email === env.FIELD_STATUS_OWNER_EMAIL?.trim().toLowerCase());
}

function validateWrite(request, origin) {
  if (request.headers.get('Origin') !== origin) {
    return fieldResponse({ error: 'Open this tool on the Tallmadge Soccer site and try again.' }, 403);
  }
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return fieldResponse({ error: 'Expected a JSON request.' }, 415);
  }
}

async function manageFieldPublishers(request, env, origin) {
  const email = visitorEmail(request);
  if (!email) return fieldResponse({ error: 'Sign in with your club owner account.' }, 401);
  if (!isOwner(email, env)) return fieldResponse({ error: 'Only the site owner can manage field publishing access.' }, 403);
  try {
    if (request.method === 'GET') {
      const result = await env.DB.prepare('SELECT email, role FROM field_publishers ORDER BY email').all();
      return fieldResponse(result.results);
    }
    if (request.method !== 'POST') return fieldResponse({ error: 'Method not allowed.' }, 405);
    const failure = validateWrite(request, origin);
    if (failure) return failure;
    const input = await request.json().catch(() => null);
    const staffEmail = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '';
    const role = input?.role;
    if (staffEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(staffEmail) || (!publisherRoles.has(role) && role !== null)) {
      return fieldResponse({ error: 'Enter a valid account email and choose a field role.' }, 400);
    }
    if (isOwner(staffEmail, env)) return fieldResponse({ error: 'The site owner already has publishing access.' }, 400);
    if (role === null) {
      await env.DB.prepare('DELETE FROM field_publishers WHERE email = ?').bind(staffEmail).run();
    } else {
      await env.DB.prepare('INSERT INTO field_publishers (email, role) VALUES (?, ?) ON CONFLICT(email) DO UPDATE SET role = excluded.role').bind(staffEmail, role).run();
    }
    return fieldResponse({ email: staffEmail, role });
  } catch (error) {
    console.error('Could not manage field publishing access', error);
    return fieldResponse({ error: 'Could not update field publishing access. Try again.' }, 503);
  }
}

// A signed-in club account takes precedence over the hosting identity.
async function fieldActor(request, env) {
  const clubUser = env.SUPABASE_URL
    ? await currentClubUser(request, new URL('/auth/v1', env.SUPABASE_URL).href)
    : null;
  if (clubUser) {
    return { clubId: clubUser.sub, email: clubUser.email.trim().toLowerCase() };
  }
  if (request.headers.has('X-Tallmadge-Club-Session')) return null;
  const email = visitorEmail(request);
  return email ? { clubId: null, email } : null;
}

const fieldPermissionSql = `CASE WHEN ? IS NULL THEN
  (? = 1 OR EXISTS (SELECT 1 FROM field_publishers WHERE email = ?))
  ELSE EXISTS (
    SELECT 1 FROM club_accounts AS account
    WHERE account.user_id = ? AND account.is_active = 1 AND (
      ? = 1 OR EXISTS (
        SELECT 1 FROM json_each(COALESCE(account.club_roles_json, json_array(account.club_role))) AS role
        WHERE role.value IN (SELECT value FROM json_each(?))
      )
    )
  ) END`;

function fieldPermissionArgs(actor, env) {
  const owner = Number(isOwner(actor.email, env));
  return [actor.clubId, owner, actor.email, actor.clubId, owner, JSON.stringify([...publisherRoles])];
}

const fieldPermissionDenied = 'Your account does not have permission to publish field statuses.';

async function readFieldEditorAccess(request, env) {
  try {
    const actor = await fieldActor(request, env);
    if (!actor) return fieldResponse({ error: 'Sign in to manage fields.' }, 401);
    const permission = await env.DB.prepare(`SELECT ${fieldPermissionSql} AS allowed`)
      .bind(...fieldPermissionArgs(actor, env)).first();
    if (!permission?.allowed) return fieldResponse({ error: fieldPermissionDenied }, 403);
    return fieldResponse({ canManageAccess: isOwner(visitorEmail(request), env) && isOwner(actor.email, env) });
  } catch (error) {
    console.error('Could not check field staff access', error);
    return fieldResponse({ error: 'Could not check your access. Please try again.' }, 503);
  }
}

async function saveFieldStatus(request, env, origin, ctx) {
  const failure = validateWrite(request, origin);
  if (failure) return failure;
  const input = await request.json().catch(() => null);
  if (!fieldIds.has(input?.field) || !fieldStatuses.has(input?.status)) {
    return fieldResponse({ error: 'Choose a valid field and status.' }, 400);
  }
  try {
    const actor = await fieldActor(request, env);
    if (!actor) return fieldResponse({ error: 'Sign in to publish field statuses.' }, 401);
    const permissions = fieldPermissionArgs(actor, env);
    const changed = await env.DB.prepare(
      `INSERT INTO fields (field_id, status) SELECT ?, ? WHERE ${fieldPermissionSql} ` +
      'ON CONFLICT(field_id) DO UPDATE SET status = excluded.status, updated_at = CURRENT_TIMESTAMP ' +
      'WHERE fields.status <> excluded.status RETURNING field_id'
    ).bind(input.field, input.status, ...permissions).first();
    if (!changed) {
      const permission = await env.DB.prepare(`SELECT ${fieldPermissionSql} AS allowed`).bind(...permissions).first();
      if (!permission?.allowed) return fieldResponse({ error: fieldPermissionDenied }, 403);
    } else {
      queueNewsCopy(env, ctx, input.field, ['field']);
    }
    return fieldResponse({ field: input.field, status: input.status });
  } catch (error) {
    console.error('Could not save field status', error);
    return fieldResponse({ error: 'Could not publish field status. Try again.' }, 503);
  }
}

function staffPageMessage(message, status, head) {
  return new Response(head ? null : `<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>Field Staff Access</title>
<link rel="stylesheet" href="/styles.css"><main class="wrap team-schedule"><h1>Field Staff Access</h1>
<p>${message}</p><a class="link" href="/field-status.html">View Field Status</a></main></html>`, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

function checkFieldAccessPage(request, env, pathname, head) {
  const email = visitorEmail(request);
  if (!email) {
    const signIn = new URL('/signin-with-chatgpt', request.url);
    signIn.searchParams.set('return_to', pathname);
    return Response.redirect(signIn, 302);
  }
  if (isOwner(email, env)) return;
  return staffPageMessage('Only the site owner can assign field publishing access.', 403, head);
}

// The build prepends the existing site assets to this Worker.
export default {
  async fetch(request, env, ctx) {
    const { pathname, searchParams, origin } = new URL(request.url);
    if (pathname === '/api/rosters') return rosterApi(request, env, origin, searchParams);
    if (pathname === '/api/seasons') return seasonsApi(request, env, origin, searchParams);
    if (pathname === '/api/divisions') return divisionApi(request, env, origin);
    if (pathname === '/api/teams') return teamsApi(request, env, origin);
    if (pathname === '/api/scores') return scoreApi(request, env, origin, searchParams, ctx);
    if (pathname === '/api/news') return newsApi(request, env);
    if (pathname === '/manage-ai-news.html' && ['GET', 'HEAD'].includes(request.method)) {
      return new Response(null, { status: 302, headers: { Location: '/news.html', 'Cache-Control': 'no-store' } });
    }
    if (pathname === '/api/upcoming-games') return upcomingGames(request, env);
    if (pathname === '/api/schedules') return scheduleApi(request, env, origin, searchParams);
    if (pathname === '/api/club-accounts') return clubDirectory(request, env, origin);
    if (pathname === '/api/club-account') return clubAccount(request, env, origin);
    if (pathname === '/api/field-publishers') return manageFieldPublishers(request, env, origin);
    if (pathname === '/api/fields' && request.method === 'POST') {
      return saveFieldStatus(request, env, origin, ctx);
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response(null, { status: 405, headers: { Allow: pathname === '/api/fields' ? 'GET, HEAD, POST' : 'GET, HEAD' } });
    }
    const head = request.method === 'HEAD';
    if (pathname === '/field-access.html') {
      const failure = checkFieldAccessPage(request, env, pathname, head);
      if (failure) return failure;
    }

    if (pathname === '/api/fields') {
      if (!head && searchParams.get('view') === 'editor') return readFieldEditorAccess(request, env);
      const headers = { 'Cache-Control': 'no-store' };
      try {
        const allFields = searchParams.get('view') === 'all';
        const query = 'SELECT field_id AS field, status FROM fields';
        const field = allFields
          ? (await env.DB.prepare(query + " WHERE field_id <> 'away' ORDER BY field_id").all()).results
          : await env.DB.prepare(query + ' WHERE field_id = ?').bind('2A').first();
        return new Response(head ? null : JSON.stringify(field ?? { error: 'Field 2A not found' }), {
          status: field ? 200 : 404,
          headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
        });
      } catch (error) {
        console.error('Could not read field status', error);
        return new Response(head ? null : 'Field status unavailable', { status: 503, headers });
      }
    }

    const travelDivision = /^\/classic-travel-(u(?:9|1[1-4])|u10-(?:boys|girls|legacy))\.html$/.exec(pathname);
    if (travelDivision) {
      const slug = travelDivision[1] === 'u10-legacy' ? 'u10' : travelDivision[1];
      const division = slug.split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join(' ');
      return new Response(null, { status: 302, headers: {
        Location: '/division.html?' + new URLSearchParams({ division }),
        'Cache-Control': 'no-store',
      } });
    }

    const asset = assets.get(pathname === '/' ? '/index.html' : pathname);
    if (!asset) return new Response(head ? null : 'Not found', { status: 404 });
    const { contentType, text, base64 } = asset;
    const body = head ? null : base64 ? Uint8Array.from(atob(base64), (byte) => byte.charCodeAt(0)) : text;
    const headers = { 'Content-Type': contentType };
    if (['/field-access.html', '/manage-fields.html', '/manage-accounts.html'].includes(pathname)) headers['Cache-Control'] = 'no-store';
    return new Response(body, { headers });
  },
};
