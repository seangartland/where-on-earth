import { accountApi } from './api.js';
import { firstSignInMerge } from './sync.js';
import { clearAccountSession, readAccountSession, saveAccountSession } from './session.js';
import { ACCOUNT_API } from '../core/config.js';
import { SEAL_DISCS, SEAL_MOTIFS, avatarName, renderAvatar, sealConfig } from './avatar.js';
import { renderXpBar, rewardLabel, stripWindow } from './progression-view.mjs';

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
  panel.dataset.view = state === 'signed-in' ? 'account' : 'auth';
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
      <button class="account-friend-profile" type="button">${escapeHtml(friend.displayName)}</button><button class="text-button account-remove" type="button">Remove</button></li>`).join('')
      : '<li class="account-friends-empty">No friends yet. Invite someone to see their pins on the Daily reveal.</li>';
    panel.innerHTML = `${close}<p class="eyebrow">Account</p><h2 id="account-title">Progress saved</h2>
      <p class="account-copy">Signed in as <strong>${escapeHtml(values.emailHint || '')}</strong>. Your progress is now on your account.</p><button class="primary account-open-profile" type="button">Profile</button>
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

function clearInviteGlow() {
  sheet.querySelectorAll('.account-invite-copy, .account-invite-share')
    .forEach((button) => button.classList.remove('cta-glow'));
}

function markInviteCopied() {
  clearInviteGlow();
  status('Link copied');
  const copyButton = sheet.querySelector('.account-invite-copy');
  if (!copyButton || copyButton.dataset.copied) return;
  copyButton.dataset.copied = '1';
  const label = copyButton.textContent;
  copyButton.textContent = 'Copied';
  setTimeout(() => { copyButton.textContent = label; delete copyButton.dataset.copied; }, 2500);
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
  // Make the next step obvious: illuminate Copy and Share until one is used,
  // and try an optimistic copy for platforms that allow it outside a tap
  // (iOS Safari refuses; the glow is the path there).
  sheet.querySelectorAll('.account-invite-copy, .account-invite-share')
    .forEach((button) => { if (!button.hidden) button.classList.add('cta-glow'); });
  input.select();
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(inviteMessage(url)).then(
      () => markInviteCopied(),
      () => { /* refused: the illuminated buttons carry it from here */ },
    );
  }
}

function inviteMessage(url) {
  return `Add me as a friend on Where on Earth and compare Daily pins: ${url}`;
}

async function copyInviteLinkNow(input) {
  const text = inviteMessage(input.value);
  try {
    await navigator.clipboard.writeText(text);
    markInviteCopied();
    return;
  } catch {
    // Safari rejects clipboard writes outside a live tap gesture; fall back below.
  }
  try {
    const temp = document.createElement('textarea');
    temp.value = text;
    temp.setAttribute('readonly', '');
    temp.style.position = 'absolute';
    temp.style.left = '-9999px';
    document.body.appendChild(temp);
    temp.select();
    temp.setSelectionRange(0, text.length);
    const copied = document.execCommand('copy');
    document.body.removeChild(temp);
    if (copied) {
      markInviteCopied();
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
    const url = `${location.origin}/friend-invite/${encodeURIComponent(invite.token)}`;
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

function dateLabel(timestamp) { return timestamp ? new Date(timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ''; }
function statGrid(stats) {
  return [['Dailies played', stats.dailies], ['Average Daily score', stats.averageScore], ['Best Daily score', stats.bestScore], ['Bullseyes', stats.bullseyes], ['Postcards', stats.postcards], ['Best streak', stats.bestStreak], ['Countries visited', stats.countries]].map(([label, value]) => `<div><strong>${Number(value).toLocaleString()}</strong><span>${label}</span></div>`).join('');
}
export async function openTravelerProfile(friendId = '') {
  try {
    const profile = await friendApi(friendId ? `/v1/progression/friend?${new URLSearchParams({ friendId })}` : '/v1/progression');
    const mine = !friendId; const panel = sheet.querySelector('.account-panel');
    const earned = new Map(profile.achievements.map((item) => [item.id, item]));
    const definitions = profile.achievementDefinitions || [];
    const visible = definitions.filter((item) => mine || earned.has(item.id)).sort((a, b) => (earned.get(b.id)?.earnedAt || 0) - (earned.get(a.id)?.earnedAt || 0));
    panel.dataset.view = 'profile';
    const strip = mine ? `<div class="profile-xp">${renderXpBar(profile)}<p>${profile.totalXp} XP total</p><div class="level-strip">${stripWindow(profile.level).map((level) => `<i class="${level < profile.level ? 'complete' : ''}${level === profile.level ? ' current' : ''}${level === 5 ? ' silver' : ''}${level === 10 ? ' gold' : ''}" title="Level ${level}">${level}</i>`).join('')}</div></div>` : '';
    panel.innerHTML = `<button class="icon-close account-profile-back" aria-label="Back">×</button><section class="traveler-profile ${mine ? 'own' : 'friend'}"><div class="traveler-card" data-card="${escapeHtml(profile.loadout.cardId)}"><div class="traveler-avatar"></div><div class="traveler-identity"><p class="traveler-level">LEVEL ${profile.level}</p><h2>${escapeHtml(profile.displayName)}</h2><p class="traveler-title">${escapeHtml(avatarName(profile.loadout.titleId))}</p></div></div>${strip}<div class="traveler-stats">${statGrid(profile.stats)}</div><section class="traveler-achievement-preview"><div class="traveler-section-head"><h3>Achievements</h3><span>${earned.size}/${definitions.length}</span></div><ul class="traveler-achievements">${visible.slice(0, mine ? 3 : definitions.length).map((item) => { const achievement = earned.get(item.id); return `<li class="${achievement ? 'earned' : 'locked'}"><i aria-hidden="true"></i><div><strong>${escapeHtml(item.name)}</strong><span>${achievement ? `Earned ${dateLabel(achievement.earnedAt)}` : escapeHtml(item.condition)}${item.communityPercentage ? ` · ${item.communityPercentage} earned` : ''}</span></div></li>`; }).join('')}</ul>${mine ? '<div class="traveler-actions"><button class="text-button account-open-cabinet" type="button">View cabinet</button><button class="primary account-customize" type="button">Customize</button></div>' : ''}</section></section>`;
    panel.querySelector('.traveler-avatar').append(renderAvatar(profile.loadout.avatar, 132, false, { name: profile.displayName, level: profile.level }));
    panel.querySelector('.account-profile-back').addEventListener('click', () => render('signed-in', readAccountSession() || {}));
    panel.querySelector('.account-open-cabinet')?.addEventListener('click', () => renderCabinet(profile));
    panel.querySelector('.account-customize')?.addEventListener('click', () => renderCustomizer(profile));
  } catch (error) { status(error.message || 'Could not load profile', true); }
}
function renderCabinet(profile) {
  const panel = sheet.querySelector('.account-panel'); const earned = new Map(profile.achievements.map((item) => [item.id, item]));
  const groups = ['consistency', 'precision', 'breadth'].map((category) => `<section class="cabinet-group"><div class="cabinet-group-head"><h3>${category}</h3><span>${profile.achievementDefinitions.filter((item) => item.category === category && earned.has(item.id)).length}/${profile.achievementDefinitions.filter((item) => item.category === category).length}</span></div>${profile.achievementDefinitions.filter((item) => item.category === category).map((item) => { const got = earned.get(item.id); const progress = item.progress ? `${item.progress.label}: ${item.progress.current} of ${item.progress.target}` : ''; return `<article class="cabinet-item ${got ? 'earned' : 'locked'}"><i aria-hidden="true"></i><div><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.condition)} · ${escapeHtml(rewardLabel(item.reward, IDENTITY_CATALOG))}</span><small>${got ? `Earned ${dateLabel(got.earnedAt)}` : progress}${item.communityPercentage ? ` · ${item.communityPercentage} earned` : ''}</small></div></article>`; }).join('')}</section>`).join('');
  panel.dataset.view = 'cabinet';
  panel.innerHTML = `<button class="icon-close account-cabinet-back" aria-label="Back">×</button><section class="traveler-profile cabinet"><h2>Achievement cabinet</h2>${groups}</section>`;
  panel.querySelector('.account-cabinet-back').addEventListener('click', () => openTravelerProfile());
}
const IDENTITY_CATALOG = {
  Titles: [['traveler', 'Traveler', 'Available now'], ['window-seat', 'Window Seat', 'Choose at Level 2; both at Level 5'], ['aisle-seat', 'Aisle Seat', 'Choose at Level 2; both at Level 5'], ['day-tripper', 'Day Tripper', 'Earn First Departure'], ['weekender', 'Weekender', 'Earn One Week Abroad'], ['globetrotter', 'Globetrotter', 'Earn No Fixed Address'], ['postmarked', 'Postmarked', 'Earn Postmarked'], ['sharp-eye', 'Sharp Eye', 'Earn Sharp Eye'], ['dead-reckoner', 'Dead Reckoner', 'Earn Perfect Itinerary'], ['border-crosser', 'Border Crosser', 'Earn Border Crosser'], ['early-explorer', 'Early Explorer', 'Earn Continental Breakfast'], ['frequent-flyer', 'Frequent Flyer', 'Earn Frequent Flyer']],
  'Calling Cards': [['blue-horizon', 'Blue Horizon', 'Available now'], ['airmail', 'Airmail', 'Reach Level 5'], ['return-ticket', 'Return Ticket', 'Earn Return Ticket'], ['regular-route', 'Regular Route', 'Earn Regular Route'], ['seasoned-traveler', 'Seasoned Traveler', 'Earn Seasoned Traveler'], ['right-on-the-map', 'Right on the Map', 'Earn Right on the Map'], ['five-star-landing', 'Five-Star Landing', 'Earn Five-Star Landing'], ['high-flyer', 'High-Flyer', 'Earn High-Flyer'], ['worldly', 'Worldly', 'Earn Worldly'], ['around-the-world', 'Around the World', 'Earn Around the World']],
};
function renderCustomizer(profile) {
  const panel = sheet.querySelector('.account-panel'); const draft = sealConfig(profile.loadout.avatar, profile.displayName); const loadout = { ...profile.loadout }; let kind = 'Seal';
  const earnedRewards = new Set(profile.achievements.map((achievement) => profile.achievementDefinitions.find((item) => item.id === achievement.id)?.reward).filter(Boolean));
  const identityOwned = (type, id) => id === (type === 'title' ? 'traveler' : 'blue-horizon')
    || (type === 'title' && ['window-seat', 'aisle-seat'].includes(id) && profile.level >= 2 && (profile.level >= 5 || !profile.loadout.levelTwoTitle || id === profile.loadout.levelTwoTitle))
    || (type === 'card' && id === 'airmail' && profile.level >= 5)
    || earnedRewards.has(`${type}:${id}`);
  const redraw = () => {
    const choices = IDENTITY_CATALOG[kind] || [];
    const type = kind === 'Titles' ? 'title' : 'card';
    const provenance = (id, condition, owned) => { if (!owned) return condition; if (id === 'traveler' || id === 'blue-horizon') return 'Available now'; if (['window-seat', 'aisle-seat'].includes(id)) return profile.loadout?.levelTwoTitle === id ? 'Chosen at Level 2' : 'Level 5'; return condition.startsWith('Earn ') ? `Unlocked by ${condition.slice(5)}` : condition.replace('Reach ', ''); };
    const content = kind === 'Seal' ? `<div class="seal-builder"><div class="customize-preview"></div><label class="seal-initials">Initials<input data-initials maxlength="2" value="${escapeHtml(draft.initials)}" aria-label="Seal initials"></label><div class="seal-section"><strong>Disc</strong><div class="seal-swatches">${Object.entries(SEAL_DISCS).map(([id, color]) => `<button type="button" data-disc="${id}" class="${draft.disc === id ? 'selected' : ''}" aria-label="${avatarName(id)} disc" style="--seal-disc:${color}"></button>`).join('')}</div></div><div class="seal-section"><strong>Motif</strong><div class="seal-motifs">${SEAL_MOTIFS.map((id) => { const achievement = { plane: 'Frequent Flyer', compass: 'Border Crosser', camera: 'Postmarked', mountain: 'Around the World', star: 'New Stamp' }[id]; const unlocked = id === 'globe' || profile.achievements.some((item) => item.id === ({ plane: 'frequent-flyer', compass: 'border-crosser', camera: 'postmarked', mountain: 'around-the-world', star: 'new-stamp' })[id]); return `<button type="button" data-motif="${id}" class="${draft.motif === id ? 'selected' : ''}" ${unlocked ? '' : 'disabled'}><span>${avatarName(id)}</span><small>${id === 'globe' ? 'Default' : unlocked ? `Unlocked by ${achievement}` : `Earn ${achievement}`}</small></button>`; }).join('')}</div></div></div>` : `<div class="avatar-parts identity-parts">${choices.map(([id, name, condition]) => { const owned = identityOwned(type, id); return `<button type="button" data-identity="${id}" class="${loadout[kind === 'Titles' ? 'titleId' : 'cardId'] === id ? 'selected' : ''}" ${owned ? '' : 'disabled'}><span>${name}</span><small>${provenance(id, condition, owned)}</small></button>`; }).join('')}</div>`;
    panel.dataset.view = 'customize';
    panel.innerHTML = `<button class="icon-close account-customize-back" aria-label="Back">×</button><section class="traveler-profile customizer"><h2>Customize</h2><div class="customize-kind-tabs">${['Titles', 'Calling Cards', 'Seal'].map((item) => `<button type="button" data-kind="${item}" aria-pressed="${kind === item}">${item}</button>`).join('')}</div>${content}<button class="primary account-save-avatar" type="button">Save ${kind === 'Seal' ? 'seal' : kind.toLowerCase()}</button></section>`;
    panel.querySelector('.customize-preview')?.append(renderAvatar(draft, 96, false, { name: profile.displayName, level: profile.level }));
    panel.querySelector('.account-customize-back').addEventListener('click', () => openTravelerProfile());
    panel.querySelectorAll('.customize-kind-tabs button').forEach((button) => button.addEventListener('click', () => { kind = button.dataset.kind; redraw(); }));
    panel.querySelector('[data-initials]')?.addEventListener('input', (event) => { draft.initials = event.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2); event.target.value = draft.initials; panel.querySelector('.customize-preview').replaceChildren(renderAvatar(draft, 96, false, { name: profile.displayName, level: profile.level })); });
    panel.querySelectorAll('[data-disc]').forEach((button) => button.addEventListener('click', () => { draft.disc = button.dataset.disc; redraw(); }));
    panel.querySelectorAll('[data-motif]').forEach((button) => button.addEventListener('click', () => { draft.motif = button.dataset.motif; redraw(); }));
    panel.querySelectorAll('[data-identity]').forEach((button) => button.addEventListener('click', () => { loadout[kind === 'Titles' ? 'titleId' : 'cardId'] = button.dataset.identity; redraw(); }));
    panel.querySelector('.account-save-avatar').addEventListener('click', async () => { try { await friendApi('/v1/progression/loadout', { method: 'POST', body: { avatar: draft, titleId: loadout.titleId, cardId: loadout.cardId } }); await openTravelerProfile(); } catch (error) { status(error.code === 'UNOWNED_COSMETIC' ? 'That item is not unlocked.' : 'Could not save customization.', true); } });
  }; redraw();
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
  sheet.querySelector('.account-open-profile')?.addEventListener('click', () => openTravelerProfile());
  sheet.querySelectorAll('.account-friend-profile').forEach((button) => button.addEventListener('click', () => openTravelerProfile(button.closest('.account-friend').dataset.friendId)));
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
      // No separate url field: iOS Messages drops the text when both are
      // present and sends the bare link. The message text carries the URL.
      await navigator.share({ title: 'Where on Earth?', text: inviteMessage(input.value) });
      clearInviteGlow();
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

export async function openFriendProfile(friendId, trigger) {
  await openAccountSheet(trigger);
  await openTravelerProfile(friendId);
}

export function closeAccountSheet() {
  if (!sheet) return;
  sheet.hidden = true;
  returnFocus?.focus();
}
