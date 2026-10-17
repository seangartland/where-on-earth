import { ACCOUNT_API } from '../core/config.js';

export class AccountError extends Error {
  constructor(code, message, status = 0) {
    super(message || code);
    this.name = 'AccountError';
    this.code = code;
    this.status = status;
  }
}

export async function accountApi(path, { method = 'GET', body, token } = {}) {
  let response;
  try {
    response = await fetch(`${ACCOUNT_API}${path}`, {
      method,
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch {
    throw new AccountError('UNAVAILABLE', "Sign-in isn't available right now");
  }
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new AccountError(data?.code || 'REQUEST_FAILED', data?.message, response.status);
  return data;
}
