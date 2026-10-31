import { accountApi } from './api.js';
import { firstSignInMerge } from './sync.js';
import { readAccountSession, saveAccountSession } from './session.js';

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
      <button class="primary account-done" type="button">Done</button>`;
  } else {
    panel.innerHTML = `${close}<p class="eyebrow">Where on Earth account</p><h2 id="account-title">Save your progress</h2>
      <p class="account-copy">Keep your passport and scores safe across your devices.</p>
      <button class="account-google" type="button" disabled>Continue with Google</button>
      <p class="account-google-note">Google sign-in is not available yet.</p>
      <div class="account-divider"><span>or use email</span></div>
      <form class="account-form" data-step="email"><label>Email address<input name="email" required type="email" autocomplete="email" placeholder="you@example.com"></label>
      <button class="primary" type="submit">Email me a code</button></form><p class="account-status" aria-live="polite"></p>`;
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

async function completeSignIn(result) {
  const saved = saveAccountSession(result.session || result, result.user || result.account, readAccountSession() || {});
  status('Merging your progress...');
  await firstSignInMerge();
  render('signed-in', saved);
  window.dispatchEvent(new CustomEvent('account-session-change'));
}

async function enableGoogle() {
  const button = sheet.querySelector('.account-google');
  const note = sheet.querySelector('.account-google-note');
  if (!button) return;
  try {
    const health = await accountApi('/health');
    if (!health.googleAvailable || !health.googleClientId) return;
    await new Promise((resolve, reject) => {
      if (window.google?.accounts?.id) return resolve();
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
    button.disabled = false;
    note.textContent = '';
    button.addEventListener('click', () => {
      window.google.accounts.id.initialize({
        client_id: health.googleClientId,
        callback: async ({ credential }) => {
          loading(button, true, 'Signing in...');
          try {
            const result = await accountApi('/v1/auth/google', { method: 'POST', body: { idToken: credential } });
            await completeSignIn(result);
          } catch (error) {
            loading(button, false);
            status(error.message || 'Google sign-in did not work', true);
          }
        },
      });
      window.google.accounts.id.prompt();
    }, { once: true });
  } catch {
    note.textContent = 'Google sign-in is not available yet.';
  }
}

function bind(values) {
  sheet.querySelector('.account-close')?.addEventListener('click', closeAccountSheet);
  sheet.querySelector('.account-done')?.addEventListener('click', closeAccountSheet);
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
