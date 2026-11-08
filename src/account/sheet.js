import { accountApi } from './api.js';
import { firstSignInMerge } from './sync.js';
import { clearAccountSession, readAccountSession, saveAccountSession } from './session.js';
import { ACCOUNT_API } from '../core/config.js';

let sheet;
let returnFocus;
let friendsState;
let pendingFriendToken;
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

function sessionToken() {
  return readAccountSession()?.sessionToken;
}

async function friendApi(path, options = {}) {
  return accountApi(path, { ...options, token: sessionToken() });
}

async function readPendingFriendToken() {
  if (pendingFriendToken) return pendingFriendToken;
  const windowValue = window.getPendingFriendToken?.()
    || window.getPendingFriendInvite?.()
    || window.__woePendingFriendToken
    || window.__WOE_PENDING_FRIEND_TOKEN__;
  if (windowValue) return String(windowValue);
  try {
    const friends = await import('./friends.js');
    const value = friends.getPendingFriendToken?.()
      || friends.getPendingFriendInvite?.()
      || friends.pendingFriendToken;
    if (value) return String(value);
  } catch {
    // Lane 2 owns this optional module. The account sheet still works without it.
  }
  return '';
}

async function clearPendingInvite() {
  pendingFriendToken = '';
  window.clearPendingFriendToken?.();
  window.clearPendingFriendInvite?.();
  try {
    const friends = await import('./friends.js');
    friends.clearPendingFriendToken?.();
    friends.clearPendingFriendInvite?.();
  } catch {
    // Lane 2 owns this optional module.
  }
}

function render(state, values = {}) {
  const panel = sheet.querySelector('.account-panel');
  const close = '<button class="icon-close account-close" aria-label="Close sign in">×</button>';
  if (state === 'code') {
    panel.innerHTML = `${close}<p class="eyebrow">Check your email</p><h2 id="account-title">Enter your code</h2>
      <p class="account-copy">We sent a 6-digit code to <strong>${escapeHtml(values.email)}</strong>.</p>
      <form class="account-form" data-step="code"><label>6-digit code<input name="code" required maxlength="6" pattern="[0-9]{6}" inputmode="numeric" autocomplete="one-time-code" placeholder="000000"></label>
      <button class="primary" type="submit">Verify and save</button></form><p class="account-status" aria-live="polite"></p>`;
  } else if (state === 'invite' || state === 'invite-name') {
    panel.innerHTML = `${close}<p class="eyebrow">Friend invite</p><h2 id="account-title">Add ${escapeHtml(values.inviterName)} as a friend?</h2>
      <p class="account-copy">You'll see each other's pins after you both play a Daily location.</p>
      ${state === 'invite-name' ? '<form class="account-invite-name"><label for="account-invite-display-name">Your name for friends</label><input id="account-invite-display-name" name="displayName" maxlength="20" placeholder="Add your name" required><button class="primary" type="submit">Save and add</button></form>' : ''}
      <div class="account-invite-actions">${state === 'invite' ? '<button class="primary account-accept" type="button">Add</button>' : ''}<button class="text-button account-not-now" type="button">Not now</button></div>
      <p class="account-status" aria-live="polite"></p>`;
  } else if (state === 'invite-invalid') {
    panel.innerHTML = `${close}<p class="eyebrow">Friend invite</p><h2 id="account-title">This invite link is no longer valid.</h2>
      <button class="primary account-done" type="button">Done</button>`;
  } else if (state === 'signed-in') {
    const me = friendsState?.me || {};
    const friends = friendsState?.friends || [];
    const friendRows = friends.length ? friends.map((friend) => `<li class="account-friend" data-friend-id="${escapeHtml(friend.friendId)}">
      <span>${escapeHtml(friend.displayName)}</span><button class="text-button account-remove" type="button">Remove</button></li>`).join('')
      : '<li class="account-friends-empty">No friends yet. Invite someone to see their pins on the Daily reveal.</li>';
    panel.innerHTML = `${close}<p class="eyebrow">Account</p><h2 id="account-title">Progress saved</h2>
      <p class="account-copy">Signed in as <strong>${escapeHtml(values.emailHint || '')}</strong>. Your progress is now on your account.</p>
      <section class="account-friends" aria-labelledby="account-friends-title">
        <h3 id="account-friends-title">Friends</h3>
        <form class="account-name-form"><label for="account-friend-name">Your name for friends</label><div class="account-inline-edit"><input id="account-friend-name" name="displayName" maxlength="20" value="${escapeHtml(me.displayName || '')}" placeholder="Add your name" required><button class="text-button" type="submit">Save</button></div></form>
        <button class="primary account-invite" type="button">Invite a friend</button>
        <div class="account-invite-link" hidden>
          <input class="account-invite-link-input" type="text" readonly aria-label="Friend invite link">
          <div class="account-invite-link-actions">
            <button class="account-invite-copy" type="button">Copy</button>
            <button class="account-invite-share" type="button" hidden>Share</button>
          </div>
        </div>
        <p class="account-small-print">Links work once and expire in 7 days.</p>
        <p class="account-status" aria-live="polite"></p>
        <ul class="account-friends-list">${friendRows}</ul>
        <label class="account-share-row"><span><strong>Share my Daily pins with friends</strong><small>Turning this off also stops you seeing friends' pins.</small></span><input class="account-share-input" type="checkbox" ${me.sharePins !== false ? 'checked' : ''}><span class="account-toggle" aria-hidden="true"></span></label>
      </section>
      <button class="primary account-done" type="button">Done</button>
      <button class="account-signout" type="button">Sign out</button>`;
  } else {
    panel.dataset.email = 'off';
    const inviteCopy = pendingFriendToken ? 'Sign in to accept a friend invite' : 'Keep your passport and scores safe across your devices.';
    panel.innerHTML = `${close}<p class="eyebrow">Where on Earth account</p><h2 id="account-title">Save your progress</h2>
      <p class="account-copy">${inviteCopy}</p>
      <button class="account-google" type="button" disabled>Continue with Google</button>
      <p class="account-google-note">Checking Google sign-in...</p>
      <div class="account-divider"><span>or use email</span></div>
      <form class="account-form" data-step="email"><label>Email address<input name="email" required type="email" autocomplete="email" placeholder="you@example.com"></label>
      <button class="primary" type="submit">Email me a code</button></form><p class="account-email-note">Email sign-in is coming soon.</p><p class="account-status" aria-live="polite"></p>`;
  }
  bind(values);
}

function status(message, error = false) {
  const line = sheet.querySelector('.account-status');
  if (!line) return;
  line.textContent = message;
  line.classList.toggle('is-error', error);
}

function loading(button, active, label) {
  button.disabled = active;
  if (active) {
    button.dataset.label = button.textContent;
    button.textContent = label;
  } else button.textContent = button.dataset.label || button.textContent;
}

async function finishSignIn(result) {
  const saved = saveAccountSession(result.session || result, result.user || result.account, readAccountSession() || {});
  await firstSignInMerge();
  window.dispatchEvent(new CustomEvent('account-session-change'));
  return saved;
}

async function showPendingInvite(saved) {
  if (!pendingFriendToken) return false;
  try {
    const [preview, state] = await Promise.all([
      friendApi('/v1/friends/invites/preview', { method: 'POST', body: { token: pendingFriendToken } }),
      friendApi('/v1/friends'),
    ]);
    friendsState = state;
    render('invite', { ...saved, inviterName: preview.inviterName });
  } catch (error) {
    if (error.code === 'INVITE_INVALID') render('invite-invalid');
    else {
      await loadFriends(saved);
      status(error.message || 'Could not load this invite', true);
    }
  }
  return true;
}

async function loadFriends(saved, message = '') {
  try {
    friendsState = await friendApi('/v1/friends');
    render('signed-in', saved);
    if (message) status(message);
  } catch (error) {
    friendsState = { me: { displayName: '', sharePins: true }, friends: [] };
    render('signed-in', saved);
    status(error.message || 'Could not load friends', true);
  }
}

async function completeSignIn(result) {
  status('Merging your progress...');
  const saved = await finishSignIn(result);
  if (!await showPendingInvite(saved)) await loadFriends(saved);
}

// The Google path is a plain full-page redirect to the account worker,
// which runs the OAuth round trip and lands back here carrying a one-time
// exchange code in the URL fragment (see consumeAuthReturn). No Google
// script ever loads on this page, so nothing here can be blocked or left
// hanging by a script that never arrives, and there is no in-page prompt
// that can silently show nothing.
function googleSignInUrl() {
  const url = new URL('/v1/auth/google/start', ACCOUNT_API);
  const returnUrl = new URL('/', window.location.origin);
  returnUrl.searchParams.set('accounts', '1');
  if (pendingFriendToken) returnUrl.searchParams.set('friend', pendingFriendToken);
  url.searchParams.set('return', returnUrl.toString());
  return url.toString();
}

async function enableGoogle() {
  const button = sheet.querySelector('.account-google');
  const note = sheet.querySelector('.account-google-note');
  if (!button) return;
  const armRedirect = (noteText) => {
    button.disabled = false;
    note.textContent = noteText;
    button.addEventListener('click', () => { window.location.href = googleSignInUrl(); }, { once: true });
  };
  let health;
  try {
    health = await accountApi('/health');
  } catch {
    // The check itself failed or timed out. The button still gets its real
    // action: the redirect is a browser navigation, which is exactly the
    // path that can succeed when an in-page fetch cannot.
    armRedirect("Couldn't check the sign-in service - tap Continue to try in your browser.");
    return;
  }
  if (health.emailSender === 'resend') sheet.querySelector('.account-panel').dataset.email = 'on';
  if (!health.googleAvailable) {
    note.textContent = 'Google sign-in is turned off right now.';
    return;
  }
  armRedirect('');
}

// After the worker's Google round trip, the browser lands back on the game
// with a one-time exchange code in the URL fragment. Consume it once at
// boot: strip the fragment before anything can read or log it, trade the
// code for the session, and finish the sign-in exactly like the email path.
export async function consumeAuthReturn() {
  const params = new URLSearchParams((window.location.hash || '').replace(/^#/, ''));
  const code = params.get('woe_auth');
  if (!code && !params.has('woe_auth_error')) return false;
  window.history.replaceState(null, '', window.location.pathname + window.location.search);
  if (!code) return false;
  try {
    const result = await accountApi('/v1/auth/exchange', { method: 'POST', body: { code } });
    await finishSignIn(result);
    return true;
  } catch {
    return false;
  }
}

async function saveName() {
  const input = sheet.querySelector('#account-friend-name');
  const displayName = input?.value.trim() || '';
  if (!displayName) {
    status('Add your name first.', true);
    input?.focus();
    return false;
  }
  try {
    const result = await friendApi('/v1/friends/profile', { method: 'POST', body: { displayName } });
    friendsState.me = result.me;
    input.value = result.me.displayName;
    status('Name saved');
    return true;
  } catch (error) {
    status(error.code === 'INVALID_NAME' ? 'Use a name from 1 to 20 characters.' : (error.message || 'Could not save your name'), true);
    input?.focus();
    return false;
  }
}

function showInviteLink(url) {
  const wrap = sheet.querySelector('.account-invite-link');
  const input = sheet.querySelector('.account-invite-link-input');
  const shareButton = sheet.querySelector('.account-invite-share');
  if (!wrap || !input) return;
  input.value = url;
  wrap.hidden = false;
  if (shareButton) shareButton.hidden = !navigator.share;
  status('Invite link ready. Tap Copy, or long-press the link to copy it.');
}

async function copyInviteLinkNow(input) {
  try {
    await navigator.clipboard.writeText(input.value);
    status('Link copied');
    return;
  } catch {
    // Safari rejects clipboard writes outside a live tap gesture; fall back below.
  }
  try {
    input.focus();
    input.select();
    input.setSelectionRange(0, input.value.length);
    if (document.execCommand('copy')) {
      status('Link copied');
      return;
    }
  } catch {
    // Fall through to the manual-copy hint; the link stays visible either way.
  }
  status('Could not copy automatically. Long-press the link above to copy it.', true);
}

async function createInvite(button) {
  if (!friendsState?.me?.displayName && !await saveName()) return;
  loading(button, true, 'Making link...');
  try {
    const invite = await friendApi('/v1/friends/invites', { method: 'POST' });
    const url = `https://where-on.earth/?accounts=1&friend=${encodeURIComponent(invite.token)}`;
    loading(button, false);
    showInviteLink(url);
  } catch (error) {
    loading(button, false);
    if (error.code === 'NAME_REQUIRED') {
      status('Add your name first.', true);
      sheet.querySelector('#account-friend-name')?.focus();
    } else if (error.code === 'INVITE_LIMIT') status('You already have too many open invite links.', true);
    else status(error.message || 'Could not create an invite', true);
  }
}

function confirmRemove(row) {
  const friend = friendsState.friends.find((item) => item.friendId === row.dataset.friendId);
  if (!friend) return;
  row.innerHTML = `<span class="account-remove-copy">Remove ${escapeHtml(friend.displayName)}? You'll stop seeing each other's pins.</span><span class="account-remove-actions"><button class="text-button account-remove-confirm" type="button">Remove</button><button class="text-button account-remove-cancel" type="button">Cancel</button></span>`;
  row.querySelector('.account-remove-cancel').addEventListener('click', () => render('signed-in', readAccountSession() || {}));
  row.querySelector('.account-remove-confirm').addEventListener('click', async () => {
    try {
      await friendApi('/v1/friends/remove', { method: 'POST', body: { friendId: friend.friendId } });
      friendsState.friends = friendsState.friends.filter((item) => item.friendId !== friend.friendId);
      render('signed-in', readAccountSession() || {});
      status(`${friend.displayName} removed`);
    } catch (error) {
      status(error.message || 'Could not remove this friend', true);
    }
  });
}

function bind(values) {
  sheet.querySelector('.account-close')?.addEventListener('click', closeAccountSheet);
  sheet.querySelector('.account-done')?.addEventListener('click', closeAccountSheet);
  sheet.querySelector('.account-signout')?.addEventListener('click', () => {
    clearAccountSession();
    window.dispatchEvent(new CustomEvent('account-session-change'));
    render('email', {});
    enableGoogle();
  });
  sheet.querySelector('.account-not-now')?.addEventListener('click', closeAccountSheet);
  sheet.querySelector('.account-accept')?.addEventListener('click', async (event) => {
    if (!friendsState?.me?.displayName) {
      render('invite-name', values);
      sheet.querySelector('#account-invite-display-name')?.focus();
      return;
    }
    const button = event.currentTarget;
    loading(button, true, 'Adding...');
    try {
      await friendApi('/v1/friends/invites/accept', { method: 'POST', body: { token: pendingFriendToken } });
      await clearPendingInvite();
      await loadFriends(readAccountSession() || {}, `${values.inviterName} added`);
    } catch (error) {
      loading(button, false);
      if (error.code === 'INVITE_INVALID') render('invite-invalid');
      else if (error.code === 'FRIEND_LIMIT') status('You or this friend already has 50 friends.', true);
      else if (error.code === 'SELF_INVITE') status("You can't accept your own invite.", true);
      else if (error.code === 'NAME_REQUIRED') {
        render('invite-name', values);
        sheet.querySelector('#account-invite-display-name')?.focus();
      } else status(error.message || 'Could not add this friend', true);
    }
  });
  sheet.querySelector('.account-invite-name')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button');
    const displayName = String(new FormData(form).get('displayName')).trim();
    loading(button, true, 'Saving...');
    try {
      await friendApi('/v1/friends/profile', { method: 'POST', body: { displayName } });
      await friendApi('/v1/friends/invites/accept', { method: 'POST', body: { token: pendingFriendToken } });
      await clearPendingInvite();
      await loadFriends(readAccountSession() || {}, `${values.inviterName} added`);
    } catch (error) {
      loading(button, false);
      if (error.code === 'INVALID_NAME') status('Use a name from 1 to 20 characters.', true);
      else if (error.code === 'INVITE_INVALID') render('invite-invalid');
      else if (error.code === 'FRIEND_LIMIT') status('You or this friend already has 50 friends.', true);
      else if (error.code === 'SELF_INVITE') status("You can't accept your own invite.", true);
      else status(error.message || 'Could not add this friend', true);
    }
  });
  sheet.querySelector('.account-name-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    await saveName();
  });
  sheet.querySelector('.account-invite')?.addEventListener('click', (event) => createInvite(event.currentTarget));
  sheet.querySelector('.account-invite-copy')?.addEventListener('click', (event) => {
    event.preventDefault();
    const input = sheet.querySelector('.account-invite-link-input');
    if (input?.value) copyInviteLinkNow(input);
  });
  sheet.querySelector('.account-invite-share')?.addEventListener('click', async (event) => {
    event.preventDefault();
    const input = sheet.querySelector('.account-invite-link-input');
    if (!input?.value) return;
    try {
      await navigator.share({ title: 'Where on Earth?', text: 'Add me as a friend on Where on Earth?', url: input.value });
    } catch (error) {
      if (error.name !== 'AbortError') status('Could not share automatically. Long-press the link above to copy it.', true);
    }
  });
  sheet.querySelectorAll('.account-remove').forEach((button) => button.addEventListener('click', () => confirmRemove(button.closest('.account-friend'))));
  sheet.querySelector('.account-share-input')?.addEventListener('change', async (event) => {
    const input = event.currentTarget;
    try {
      const result = await friendApi('/v1/friends/profile', { method: 'POST', body: { sharePins: input.checked } });
      friendsState.me = result.me;
      status('Sharing preference saved');
    } catch (error) {
      input.checked = !input.checked;
      status(error.message || 'Could not save sharing preference', true);
    }
  });
  const form = sheet.querySelector('.account-form');
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = form.querySelector('button');
    const data = new FormData(form);
    if (form.dataset.step === 'email') {
      loading(button, true, 'Sending code...');
      try {
        const email = String(data.get('email')).trim().toLowerCase();
        await accountApi('/v1/auth/email/send', { method: 'POST', body: { email } });
        render('code', { email });
        sheet.querySelector('input')?.focus();
      } catch (error) {
        loading(button, false);
        status(error.message || 'Could not send a code', true);
      }
      return;
    }
    loading(button, true, 'Checking code...');
    try {
      const result = await accountApi('/v1/auth/email/verify', {
        method: 'POST', body: { email: values.email, code: String(data.get('code')) },
      });
      await completeSignIn(result);
    } catch (error) {
      loading(button, false);
      status(error.message || 'That code did not work', true);
    }
  });
}

export async function openAccountSheet(trigger) {
  returnFocus = trigger || document.activeElement;
  if (!sheet) {
    sheet = document.createElement('section');
    sheet.className = 'screen account-sheet';
    sheet.setAttribute('role', 'presentation');
    sheet.innerHTML = '<div class="settings-card glass account-panel" role="dialog" aria-modal="true" aria-labelledby="account-title"></div>';
    document.getElementById('game').appendChild(sheet);
    sheet.addEventListener('click', (event) => { if (event.target === sheet) closeAccountSheet(); });
  }
  sheet.hidden = false;
  pendingFriendToken = await readPendingFriendToken();
  const session = readAccountSession();
  if (!session?.sessionToken) {
    render('email', session || {});
    enableGoogle();
  } else if (!await showPendingInvite(session)) await loadFriends(session);
  sheet.querySelector('input, button')?.focus();
}

export function closeAccountSheet() {
  if (!sheet) return;
  sheet.hidden = true;
  returnFocus?.focus();
}
