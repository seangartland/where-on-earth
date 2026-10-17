import { ACCOUNT_KEY } from '../core/config.js';

export function readAccountSession() {
  try { return JSON.parse(localStorage.getItem(ACCOUNT_KEY) || 'null'); } catch { return null; }
}

export function isSignedIn() {
  const session = readAccountSession();
  return Boolean(session?.sessionToken && session.expiresAt > Date.now());
}

export function deviceId() {
  return readAccountSession()?.deviceId || `dev_${crypto.randomUUID().replaceAll('-', '')}`;
}

export function saveAccountSession(session, account = {}, existing = {}) {
  const value = {
    _v: 1,
    accountId: account.id || existing.accountId,
    sessionToken: session.token || session.sessionToken,
    expiresAt: new Date(session.expiresAt).getTime(),
    displayName: account.name || existing.displayName || '',
    emailHint: maskEmail(account.email || existing.emailHint || ''),
    deviceId: existing.deviceId || deviceId(),
    lastSyncAt: existing.lastSyncAt || 0,
    merged: Boolean(existing.merged),
  };
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(value));
  return value;
}

export function updateAccountSession(fields) {
  const current = readAccountSession();
  if (!current) return null;
  const next = { ...current, ...fields, _v: 1 };
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(next));
  return next;
}

export function clearAccountSession() {
  localStorage.removeItem(ACCOUNT_KEY);
}

function maskEmail(email) {
  if (email.includes('*')) return email;
  const [name, domain] = email.split('@');
  return name && domain ? `${name[0]}***@${domain}` : '';
}
