import { accountApi } from './api.js';
import { firstSignInMerge } from './sync.js';
import { clearAccountSession, readAccountSession, saveAccountSession } from './session.js';
import { ACCOUNT_API } from '../core/config.js';

let sheet;
let returnFocus;
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));

function render(state, values = {}) {
  const panel = sheet.querySelector('.account-panel');
  const close = '<button class="icon-close account-close" aria-label="Close sign in">×</button>';
  if (state === 'code') {
    panel.innerHTML = `${close}<p class="eyebrow">Check your email</p><h2 id="account-title">Enter your code</h2>
      <p class="account-copy">We sent a 6-digit code to <strong>${escapeHtml(values.email)}</strong>.</p>
      <form class="account-form" data-step="code"><label>6-digit code<input name="code" required maxlength="6" pattern="[0-9]{6}" inputmode="numeric" autocomplete="one-time-code" placeholder="000000"></label>
      <button class="primary" type="submit">Verify and save</button></form><p class="account-status" aria-live="polite"></p>`;
  } else if (state === 'signed-in') {
    panel.innerHTML = `${close}<p class="eyebrow">Account</p><h2 id="account-title">Progress saved</h2>
      <p class="account-copy">Signed in as <strong>${escapeHtml(values.emailHint || '')}</strong>. Your progress is now on your account.</p>
      <button class="primary account-done" type="button">Done</button>
      <button class="account-signout" type="button">Sign out</button>`;
  } else {
    panel.dataset.email = 'off';
    panel.innerHTML = `${close}<p class="eyebrow">Where on Earth account</p><h2 id="account-title">Save your progress</h2>
      <p class="account-copy">Keep your passport and scores safe across your devices.</p>
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

async function completeSignIn(result) {
  status('Merging your progress...');
  const saved = await finishSignIn(result);
  render('signed-in', saved);
}

// The Google path is a plain full-page redirect to the account worker,
// which runs the OAuth round trip and lands back here carrying a one-time
// exchange code in the URL fragment (see consumeAuthReturn). No Google
// script ever loads on this page, so nothing here can be blocked or left
// hanging by a script that never arrives, and there is no in-page prompt
// that can silently show nothing.
function googleSignInUrl() {
  const url = new URL('/v1/auth/google/start', ACCOUNT_API);
  url.searchParams.set('return', `${window.location.origin}/?accounts=1`);
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
    armRedirect("Couldn't check the sign-in service — tap Continue to try in your browser.");
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

function bind(values) {
  sheet.querySelector('.account-close')?.addEventListener('click', closeAccountSheet);
  sheet.querySelector('.account-done')?.addEventListener('click', closeAccountSheet);
  sheet.querySelector('.account-signout')?.addEventListener('click', () => {
    clearAccountSession();
    window.dispatchEvent(new CustomEvent('account-session-change'));
    render('email', {});
    enableGoogle();
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
  const session = readAccountSession();
  render(session?.sessionToken ? 'signed-in' : 'email', session || {});
  if (!session?.sessionToken) enableGoogle();
  sheet.querySelector('input, button')?.focus();
}

export function closeAccountSheet() {
  if (!sheet) return;
  sheet.hidden = true;
  returnFocus?.focus();
}
