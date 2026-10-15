// ---------------------------------------------------------------------------
// The localStorage wrapper (refactor Phase 5): versioned JSON reads and
// writes, corrupt-value backups, guarded writes and the boot-time schema
// migration. Moved out of main.js unchanged; keys live in config.js.
// ---------------------------------------------------------------------------
import { STORAGE_VERSION, HISTORY_KEY, PASSPORT_KEY, MUTE_KEY, VERSIONED_KEYS } from './config.js';

export function storageError(message, key, error) {
  console.error(`[storage] ${message}: ${key}`, error || '');
}

export function corruptBackupKey(key) {
  return `${key}.corrupt-backup`;
}

export function preserveCorruptStorage(key, raw, error) {
  storageError('Corrupt JSON preserved; refusing to overwrite', key, error);
  const backupKey = corruptBackupKey(key);
  try {
    // Never destroy an earlier recovery copy. If another corrupt value is seen,
    // leave the first backup intact and keep the current raw value at its key.
    if (localStorage.getItem(backupKey) === null) localStorage.setItem(backupKey, raw);
  } catch (backupError) {
    storageError('Could not create corrupt backup', backupKey, backupError);
  }
}

export function storedDataSize(key, value) {
  if (value == null) return 0;
  if (key === PASSPORT_KEY) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return 0;
    const visits = value.visits && typeof value.visits === 'object' ? Object.keys(value.visits).length : 0;
    const meta = value.meta && typeof value.meta === 'object' ? Object.keys(value.meta).length : 0;
    const order = Array.isArray(value.order) ? value.order.length : 0;
    return Math.max(visits, meta, order);
  }
  if (key === HISTORY_KEY) {
    const entries = Array.isArray(value) ? value : value && value.entries;
    return Array.isArray(entries) ? entries.length : 0;
  }
  if (Array.isArray(value)) return value.length;
  if (typeof value === 'object') {
    return Object.keys(value).filter((field) => field !== '_v').length;
  }
  return String(value).length;
}

export function safeSetItem(key, rawValue) {
  let oldRaw = null;
  try {
    oldRaw = localStorage.getItem(key);
    if (!VERSIONED_KEYS.has(key)) {
      localStorage.setItem(key, rawValue);
      return true;
    }

    let next;
    try {
      next = JSON.parse(rawValue);
    } catch (error) {
      storageError('Refusing non-JSON write to versioned key', key, error);
      return false;
    }

    if (oldRaw !== null) {
      let previous;
      try {
        previous = JSON.parse(oldRaw);
      } catch (error) {
        preserveCorruptStorage(key, oldRaw, error);
        return false;
      }

      const oldSize = storedDataSize(key, previous);
      const nextSize = storedDataSize(key, next);
      if (next == null || (oldSize > 0 && nextSize === 0)) {
        storageError('Refusing suspicious empty write', key);
        return false;
      }
      if (key === PASSPORT_KEY && nextSize < oldSize) {
        storageError(`Refusing passport write that shrinks from ${oldSize} to ${nextSize} entries`, key);
        return false;
      }
    }

    localStorage.setItem(key, rawValue);
    return true;
  } catch (error) {
    storageError('Write failed', key, error);
    return false;
  }
}

export function migrateValue(key, value) {
  // Every case spreads/copies old data first. Future rename migrations must do
  // the same: add the new field while retaining the old field.
  if (key === HISTORY_KEY) {
    if (Array.isArray(value)) return { _v: STORAGE_VERSION, entries: value };
    return { ...value, _v: STORAGE_VERSION, entries: Array.isArray(value.entries) ? value.entries : [] };
  }
  if (key === MUTE_KEY) {
    // The legacy raw strings `1` and `0` parse as JSON numbers.
    if (value === 1 || value === 0 || value === '1' || value === '0' || typeof value === 'boolean') {
      return { _v: STORAGE_VERSION, muted: value === 1 || value === '1' || value === true };
    }
    return { ...value, _v: STORAGE_VERSION, muted: Boolean(value && value.muted) };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  return { ...value, _v: STORAGE_VERSION };
}

export function migrateStorage() {
  for (const key of VERSIONED_KEYS) {
    let raw;
    try {
      raw = localStorage.getItem(key);
    } catch (error) {
      storageError('Read failed during migration', key, error);
      continue;
    }
    if (raw === null) continue;

    let value;
    try {
      value = JSON.parse(raw);
    } catch (error) {
      preserveCorruptStorage(key, raw, error);
      continue;
    }

    const version = value && typeof value === 'object' && Number.isInteger(value._v) ? value._v : 0;
    if (version > STORAGE_VERSION) {
      storageError(`Stored schema v${version} is newer than supported v${STORAGE_VERSION}; leaving untouched`, key);
      continue;
    }
    if (version === STORAGE_VERSION) continue;

    let migrated = value;
    for (let from = version; from < STORAGE_VERSION; from += 1) {
      // Add future step migrations here, keyed by `from`. They must copy the
      // prior object and add fields; never delete a legacy field.
      if (from === 0) migrated = migrateValue(key, migrated);
    }
    safeSetItem(key, JSON.stringify(migrated));
  }
}

export function readJSON(key) {
  let raw;
  try {
    raw = localStorage.getItem(key);
    if (raw === null) return null;
    const value = JSON.parse(raw);
    // Preserve existing call-site behavior while history is stored in a
    // versioned object wrapper.
    return key === HISTORY_KEY && value && !Array.isArray(value) ? value.entries : value;
  } catch (error) {
    if (raw != null) preserveCorruptStorage(key, raw, error);
    else storageError('Read failed', key, error);
    return null;
  }
}

export function versionedValue(key, value) {
  if (key === HISTORY_KEY) return { _v: STORAGE_VERSION, entries: value };
  if (key === MUTE_KEY) return { _v: STORAGE_VERSION, muted: Boolean(value) };
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { ...value, _v: STORAGE_VERSION };
  }
  return value;
}

export function writeJSON(key, value) {
  return safeSetItem(key, JSON.stringify(versionedValue(key, value)));
}
