import { ACCOUNT_API } from '../core/config.js';

export class AccountError extends Error {
  constructor(code, message, status = 0) {
    super(message || code);
    this.name = 'AccountError';
    this.code = code;
    this.status = status;
  }
}

// Every account call is bounded. A fetch that never settles (a filtered or
// dead network path) must surface as UNAVAILABLE, not as a UI that waits
// forever; the abort also covers a response body that trickles and stalls.
const DEFAULT_TIMEOUT_MS = 6000;

export async function accountApi(path, { method = 'GET', body, token, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  let data;
  try {
    response = await fetch(`${ACCOUNT_API}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    data = response.status === 204 ? null : await response.json().catch(() => ({}));
  } catch {
    throw new AccountError('UNAVAILABLE', "Sign-in isn't available right now");
  } finally {
    clearTimeout(timer);
  }
  if (!response.ok) throw new AccountError(data?.code || 'REQUEST_FAILED', data?.message, response.status);
  return data;
}
