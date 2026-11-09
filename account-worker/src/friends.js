const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
const FRIEND_LIMIT = 50;
const INVITE_LIMIT = 10;
const INVITE_LIFETIME = 7 * DAY;
const ATTEMPT_LIMIT = 30;
const LOCATION_PATTERN = /^[a-z0-9-]{1,80}$/;
const DEVICE_PATTERN = /^dev_[A-Za-z0-9_-]+$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const SHARE_CARD_IMAGE = 'https://where-on.earth/assets/og-v4.jpg';
const GAME_URL = 'https://where-on.earth/';

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json' },
});

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

async function accountId(auth, request) {
  const session = await auth.api.getSession({ headers: request.headers });
  return session?.user?.id || null;
}

async function body(request) {
  try { return await request.json(); } catch { return null; }
}

function validName(value) {
  return typeof value === 'string'
    && value === value.trim()
    && [...value].length >= 1
    && [...value].length <= 20
    && !/[\u0000-\u001f\u007f-\u009f]/.test(value);
}

function utcDateAt(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function validDate(value, now) {
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  return DATE_PATTERN.test(value || '')
    && Number.isFinite(parsed)
    && utcDateAt(parsed) === value
    && value >= utcDateAt(now - 36 * HOUR)
    && value <= utcDateAt(now + 14 * HOUR);
}

function finiteInteger(value, min, max) {
  return Number.isFinite(value) && Number.isInteger(value) && value >= min && value <= max;
}

function validGuess(value) {
  return finiteInteger(value?.slot, 0, 4)
    && LOCATION_PATTERN.test(value?.locationId || '')
    && Number.isFinite(value?.guess?.lat) && value.guess.lat >= -90 && value.guess.lat <= 90
    && Number.isFinite(value?.guess?.lng) && value.guess.lng >= -180 && value.guess.lng <= 180
    && finiteInteger(value?.distanceKm, 0, 20040)
    && finiteInteger(value?.score, 0, 1000)
    && DEVICE_PATTERN.test(value?.deviceId || '');
}

function defaultName(user) {
  if (!user?.has_google) return null;
  const candidate = user?.name?.trim();
  if (!candidate || candidate.toLowerCase() === user?.email?.trim().toLowerCase()) return null;
  const first = candidate.split(/\s+/)[0];
  return validName(first) ? first : null;
}

async function profile(env, id) {
  let row = await env.DB.prepare(
    'SELECT display_name, share_pins FROM profiles WHERE account_id = ?',
  ).bind(id).first();
  if (row) return row;
  const user = await env.DB.prepare(`SELECT u.name, u.email,
    EXISTS (SELECT 1 FROM account a WHERE a.userId = u.id AND a.providerId = 'google') AS has_google
    FROM "user" u WHERE u.id = ?`).bind(id).first();
  const name = defaultName(user);
  await env.DB.prepare(`INSERT OR IGNORE INTO profiles
    (account_id, display_name, share_pins, updated_at) VALUES (?, ?, 1, ?)`)
    .bind(id, name, Date.now()).run();
  row = await env.DB.prepare(
    'SELECT display_name, share_pins FROM profiles WHERE account_id = ?',
  ).bind(id).first();
  return row;
}

function meShape(row) {
  return { displayName: row?.display_name || null, sharePins: row?.share_pins === 1 };
}

function tokenBytes() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function tokenHash(token) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{22}$/.test(token)) return null;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function reserveAttempt(env, id, now) {
  const result = await env.DB.prepare(`INSERT INTO friend_attempt_events (account_id, created_at)
    SELECT ?, ? WHERE (SELECT COUNT(*) FROM friend_attempt_events
      WHERE account_id = ? AND created_at > ?) < ?`)
    .bind(id, now, id, now - HOUR, ATTEMPT_LIMIT).run();
  return result.meta.changes === 1;
}

async function validInvite(env, token, now) {
  const hash = await tokenHash(token);
  if (!hash) return null;
  return env.DB.prepare(`SELECT i.token_hash, i.inviter_id, p.display_name
    FROM friend_invites i JOIN profiles p ON p.account_id = i.inviter_id
    WHERE i.token_hash = ? AND i.used_at IS NULL AND i.expires_at > ?`)
    .bind(hash, now).first();
}

function inviteLandingHtml({ inviterName, gameUrl }) {
  const title = 'Friend invite · Where on Earth';
  const description = inviterName
    ? `${inviterName} invited you to be friends on Where on Earth. Play the Daily and compare pins.`
    : 'This invite link is no longer valid.';
  const heading = inviterName
    ? `${escapeHtml(inviterName)} invited you to play Where on Earth`
    : 'This invite link is no longer valid';
  const copy = inviterName
    ? 'Play the Daily and compare your pins with friends.'
    : 'Open the game to keep playing the Daily.';
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeGameUrl = escapeHtml(gameUrl);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${safeTitle}</title>
<meta property="og:title" content="${safeTitle}">
<meta property="og:description" content="${safeDescription}">
<meta property="og:image" content="${SHARE_CARD_IMAGE}">
<meta property="og:url" content="${safeGameUrl}">
<meta property="og:type" content="website">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${safeTitle}">
<meta name="twitter:description" content="${safeDescription}">
<meta name="twitter:image" content="${SHARE_CARD_IMAGE}">
<meta http-equiv="refresh" content="1;url=${safeGameUrl}">
<script>setTimeout(function () { window.location.replace(${JSON.stringify(gameUrl)}); }, 600);</script>
<style>
body { background: #03060f; color: #fff; font-family: -apple-system, system-ui, sans-serif;
  display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0;
  text-align: center; padding: 24px; box-sizing: border-box; }
a.button { display: inline-block; margin-top: 20px; padding: 12px 24px; background: #2d7dff;
  color: #fff; border-radius: 999px; text-decoration: none; font-weight: 600; }
</style>
</head>
<body>
<div>
<h1>${heading}</h1>
<p>${escapeHtml(copy)}</p>
<a class="button" href="${safeGameUrl}">Open Where on Earth</a>
</div>
</body>
</html>`;
}

export async function inviteLandingPage(env, token) {
  const invite = await validInvite(env, token, Date.now());
  const gameUrl = invite
    ? `${GAME_URL}?accounts=1&friend=${encodeURIComponent(token)}`
    : GAME_URL;
  const html = inviteLandingHtml({ inviterName: invite?.display_name || null, gameUrl });
  return new Response(html, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

const PINS_SQL = `SELECT mine.location_id, mine.lat AS mine_lat, mine.lng AS mine_lng,
  g.account_id AS friend_id,
  p.display_name, g.lat, g.lng, g.submitted_at
FROM daily_guesses mine
LEFT JOIN friendships f ON f.account_id = mine.account_id
  AND EXISTS (SELECT 1 FROM profiles own
    WHERE own.account_id = mine.account_id AND own.share_pins = 1)
LEFT JOIN daily_guesses g ON g.account_id = f.friend_id
  AND g.date = mine.date AND g.location_id = mine.location_id
LEFT JOIN profiles p ON p.account_id = g.account_id AND p.share_pins = 1
WHERE mine.account_id = ? AND mine.date = ?
  AND (? IS NULL OR mine.location_id = ?)
ORDER BY mine.slot, g.submitted_at, g.account_id`;

async function pins(env, id, date, locationId = null) {
  const rows = await env.DB.prepare(PINS_SQL).bind(id, date, locationId, locationId).all();
  const locations = {};
  for (const row of rows.results || []) {
    if (!locations[row.location_id]) locations[row.location_id] = {
      mine: { lat: row.mine_lat, lng: row.mine_lng }, friends: [],
    };
    if (row.friend_id && row.display_name) locations[row.location_id].friends.push({
      friendId: row.friend_id,
      displayName: row.display_name,
      guess: { lat: row.lat, lng: row.lng },
      submittedAt: row.submitted_at,
    });
  }
  return locations;
}

function storedShape(row) {
  return {
    date: row.date, slot: row.slot, locationId: row.location_id,
    guess: { lat: row.lat, lng: row.lng }, submittedAt: row.submitted_at,
  };
}

async function listFriends(request, env, id) {
  const own = await profile(env, id);
  const rows = await env.DB.prepare(`SELECT f.friend_id, p.display_name, f.created_at
    FROM friendships f JOIN profiles p ON p.account_id = f.friend_id
    WHERE f.account_id = ? ORDER BY p.display_name, f.friend_id`).bind(id).all();
  const inviteCount = await env.DB.prepare(`SELECT COUNT(*) AS count FROM friend_invites
    WHERE inviter_id = ? AND used_at IS NULL AND expires_at > ?`).bind(id, Date.now()).first();
  return json({
    me: meShape(own),
    friends: (rows.results || []).map((row) => ({
      friendId: row.friend_id, displayName: row.display_name, since: row.created_at,
    })),
    openInvites: Number(inviteCount?.count) || 0,
  });
}

async function updateProfile(request, env, id) {
  const input = await body(request);
  if (!input || (!Object.hasOwn(input, 'displayName') && !Object.hasOwn(input, 'sharePins'))) {
    return json({ code: 'INVALID_BODY' }, 400);
  }
  const current = await profile(env, id);
  let name = current.display_name;
  let sharing = current.share_pins;
  if (Object.hasOwn(input, 'displayName')) {
    if (!validName(input.displayName)) return json({ code: 'INVALID_NAME' }, 400);
    name = input.displayName;
  }
  if (Object.hasOwn(input, 'sharePins')) {
    if (typeof input.sharePins !== 'boolean') return json({ code: 'INVALID_BODY' }, 400);
    sharing = input.sharePins ? 1 : 0;
  }
  await env.DB.prepare(`UPDATE profiles SET display_name = ?, share_pins = ?, updated_at = ?
    WHERE account_id = ?`).bind(name, sharing, Date.now(), id).run();
  return json({ me: { displayName: name, sharePins: sharing === 1 } });
}

async function createInvite(request, env, id) {
  const own = await profile(env, id);
  if (!own.display_name) return json({ code: 'NAME_REQUIRED' }, 409);
  const now = Date.now();
  const token = tokenBytes();
  const hash = await tokenHash(token);
  const expiresAt = now + INVITE_LIFETIME;
  const inserted = await env.DB.prepare(`INSERT INTO friend_invites
    (token_hash, inviter_id, created_at, expires_at)
    SELECT ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM friend_invites
      WHERE inviter_id = ? AND used_at IS NULL AND expires_at > ?) < ?`)
    .bind(hash, id, now, expiresAt, id, now, INVITE_LIMIT).run();
  if (inserted.meta.changes !== 1) return json({ code: 'INVITE_LIMIT' }, 429);
  return json({ token, expiresAt });
}

async function previewInvite(request, env, id) {
  const now = Date.now();
  if (!(await reserveAttempt(env, id, now))) return json({ code: 'RATE_LIMITED' }, 429);
  const input = await body(request);
  const invite = await validInvite(env, input?.token, now);
  if (!invite) return json({ code: 'INVITE_INVALID' }, 404);
  return json({ inviterName: invite.display_name });
}

async function acceptInvite(request, env, id) {
  const now = Date.now();
  if (!(await reserveAttempt(env, id, now))) return json({ code: 'RATE_LIMITED' }, 429);
  const input = await body(request);
  const invite = await validInvite(env, input?.token, now);
  if (!invite) return json({ code: 'INVITE_INVALID' }, 404);
  if (invite.inviter_id === id) return json({ code: 'SELF_INVITE' }, 400);
  const own = await profile(env, id);
  if (!own.display_name) return json({ code: 'NAME_REQUIRED' }, 409);
  const existing = await env.DB.prepare(`SELECT created_at FROM friendships
    WHERE account_id = ? AND friend_id = ?`).bind(id, invite.inviter_id).first();
  if (existing) {
    await env.DB.prepare(`UPDATE friend_invites SET used_by = ?, used_at = ?
      WHERE token_hash = ? AND used_at IS NULL`).bind(id, now, invite.token_hash).run();
    return json({ friend: {
      friendId: invite.inviter_id, displayName: invite.display_name, since: existing.created_at,
    } });
  }
  const results = await env.DB.batch([
    env.DB.prepare(`INSERT INTO friendships (account_id, friend_id, created_at)
      SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM friend_invites
        WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?)
      AND (SELECT COUNT(*) FROM friendships WHERE account_id = ?) < ?
      AND (SELECT COUNT(*) FROM friendships WHERE account_id = ?) < ?`)
      .bind(id, invite.inviter_id, now, invite.token_hash, now,
        id, FRIEND_LIMIT, invite.inviter_id, FRIEND_LIMIT),
    env.DB.prepare(`INSERT INTO friendships (account_id, friend_id, created_at)
      SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM friendships
        WHERE account_id = ? AND friend_id = ? AND created_at = ?)`)
      .bind(invite.inviter_id, id, now, id, invite.inviter_id, now),
    env.DB.prepare(`UPDATE friend_invites SET used_by = ?, used_at = ?
      WHERE token_hash = ? AND used_at IS NULL AND EXISTS
        (SELECT 1 FROM friendships WHERE account_id = ? AND friend_id = ? AND created_at = ?)`)
      .bind(id, now, invite.token_hash, id, invite.inviter_id, now),
  ]);
  if (results[2].meta.changes !== 1) {
    const stillValid = await validInvite(env, input.token, now);
    return stillValid
      ? json({ code: 'FRIEND_LIMIT' }, 409)
      : json({ code: 'INVITE_INVALID' }, 404);
  }
  return json({ friend: {
    friendId: invite.inviter_id, displayName: invite.display_name, since: now,
  } });
}

async function removeFriend(request, env, id) {
  const input = await body(request);
  const friendId = typeof input?.friendId === 'string' ? input.friendId : '';
  await env.DB.batch([
    env.DB.prepare('DELETE FROM friendships WHERE account_id = ? AND friend_id = ?').bind(id, friendId),
    env.DB.prepare('DELETE FROM friendships WHERE account_id = ? AND friend_id = ?').bind(friendId, id),
  ]);
  return new Response(null, { status: 204 });
}

async function submitGuess(request, env, id) {
  const input = await body(request);
  const now = Date.now();
  if (!validDate(input?.date, now)) return json({ code: 'INVALID_DAILY_DATE' }, 400);
  if (!validGuess(input)) return json({ code: 'INVALID_GUESS' }, 400);
  const lat = Math.round(input.guess.lat * 10000) / 10000;
  const lng = Math.round(input.guess.lng * 10000) / 10000;
  await profile(env, id);
  await env.DB.prepare(`INSERT INTO daily_guesses
    (account_id, date, slot, location_id, lat, lng, distance_km, score, device_id, submitted_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING`)
    .bind(id, input.date, input.slot, input.locationId, lat, lng,
      input.distanceKm, input.score, input.deviceId, now).run();
  const stored = await env.DB.prepare(`SELECT date, slot, location_id, lat, lng, submitted_at
    FROM daily_guesses WHERE account_id = ? AND date = ? AND location_id = ?`)
    .bind(id, input.date, input.locationId).first();
  if (!stored) return json({ code: 'SLOT_CONFLICT' }, 409);
  const location = (await pins(env, id, input.date, input.locationId))[input.locationId];
  const friends = location?.friends || [];
  const output = { stored: storedShape(stored), friends };
  if (stored.slot !== input.slot || stored.lat !== lat || stored.lng !== lng) {
    return json({ code: 'GUESS_LOCKED', ...output }, 409);
  }
  return json(output);
}

async function getDailyFriends(request, env, id) {
  const date = new URL(request.url).searchParams.get('date');
  if (!validDate(date, Date.now())) return json({ code: 'INVALID_DAILY_DATE' }, 400);
  return json({ date, locations: await pins(env, id, date) });
}

export async function handleFriends(request, env, auth) {
  const id = await accountId(auth, request);
  if (!id) return json({ code: 'UNAUTHORIZED' }, 401);
  const { pathname } = new URL(request.url);
  if (pathname === '/v1/friends' && request.method === 'GET') return listFriends(request, env, id);
  if (pathname === '/v1/friends/profile' && request.method === 'POST') return updateProfile(request, env, id);
  if (pathname === '/v1/friends/invites' && request.method === 'POST') return createInvite(request, env, id);
  if (pathname === '/v1/friends/invites/preview' && request.method === 'POST') return previewInvite(request, env, id);
  if (pathname === '/v1/friends/invites/accept' && request.method === 'POST') return acceptInvite(request, env, id);
  if (pathname === '/v1/friends/remove' && request.method === 'POST') return removeFriend(request, env, id);
  if (pathname === '/v1/daily/guesses' && request.method === 'POST') return submitGuess(request, env, id);
  if (pathname === '/v1/daily/friends' && request.method === 'GET') return getDailyFriends(request, env, id);
  return json({ code: 'NOT_FOUND' }, 404);
}
