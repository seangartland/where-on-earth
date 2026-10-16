// ---------------------------------------------------------------------------
// Audit mode: every place revealed in the Passport, with per-card review flags
// (wrong image, not a city), a flags panel, and Clear and Export.
//
// QUARANTINED (refactor Phase 4): Audit was retired 2026-10-12 by Sean's
// decision. It is kept intact here behind its existing flag, not deleted and
// not re-enabled. The Passport reaches it only through passportHost
// (addAuditFlagButton, mountAuditBanner); its styles stay in the Passport's
// stylesheet block (src/meta/passport.js), where they always applied.
// ---------------------------------------------------------------------------
// Audit mode retired 2026-10-12 (Sean), reinstated 2026-10-15 (Sean) so the
// full landmarks bank can be previewed in the Passport via ?audit=1.
const AUDIT_AVAILABLE = true;
export const AUDIT_MODE = AUDIT_AVAILABLE && new URLSearchParams(location.search).get('audit') === '1';

let host = null;
const AUDIT_FLAGS_KEY = 'where-on-earth-audit-flags';
const AUDIT_FLAG_TYPES = ['image', 'city'];
const AUDIT_FLAG_LABELS = { image: 'wrong image', city: 'not a city' };
const AUDIT_FLAG_EMOJIS = { image: '🔴', city: '🟡' };
let auditFlags = {};

function saveAuditFlags() {
  host.safeSetItem(AUDIT_FLAGS_KEY, JSON.stringify(auditFlags));
}

function removeOrphanedAuditFlags() {
  if (!host.landmarks) return; // landmarks still loading: never judge a flag orphaned yet
  const validIds = new Set([...host.locations, ...host.landmarks].map((item) => item.id));
  const cleanedFlags = Object.fromEntries(Object.entries(auditFlags).filter(([id]) => validIds.has(id)));
  if (Object.keys(cleanedFlags).length === Object.keys(auditFlags).length) return;
  auditFlags = cleanedFlags;
  saveAuditFlags();
}

// Run once locations arrive (audit mode only): drop flags on retired places
// and apply the one-time flag wipe.
export function auditFlagsLocationsLoaded() {
  if (AUDIT_MODE) { removeOrphanedAuditFlags(); if (!localStorage.getItem("where-on-earth-flags-wiped-v1")) { auditFlags = {}; try { localStorage.removeItem(AUDIT_FLAGS_KEY); localStorage.setItem("where-on-earth-flags-wiped-v1", "1"); } catch (e) {} } }
}

function nextAuditFlag(id) {
  const current = auditFlags[id];
  if (!current) return 'image';
  if (current === 'image') return 'city';
  delete auditFlags[id];
  return null;
}

export function addAuditFlagButton(photo, entry) {
  if (!AUDIT_MODE) return;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'pp-audit-flag';
  button.textContent = '🚩';
  button.setAttribute('aria-label', 'Flag location for review');
  const dot = document.createElement('span');
  dot.className = 'pp-audit-flag-dot';
  dot.setAttribute('aria-hidden', 'true');
  button.append(dot);
  const update = () => {
    const type = auditFlags[entry.item.id];
    button.dataset.flag = type || '';
    dot.textContent = type ? AUDIT_FLAG_EMOJIS[type] : '';
    button.setAttribute('aria-label', type ? `Flagged ${AUDIT_FLAG_LABELS[type]}. Tap to change.` : 'Flag location for review');
  };
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    const type = nextAuditFlag(entry.item.id);
    if (type) auditFlags[entry.item.id] = type;
    saveAuditFlags();
    update();
    window.__renderAuditFlags?.();
  });
  button.addEventListener('keydown', (event) => event.stopPropagation());
  update();
  photo.append(button);
}

// The Passport page's audit banner and flags panel, mounted before the
// progress block (passport.js initPassport, audit mode only).
export function mountAuditBanner(progressEl) {
  const banner = document.createElement('div');
  banner.className = 'pp-audit-banner';
  const bannerText = document.createElement('span');
  bannerText.textContent = 'AUDIT MODE · all places revealed for review';
  const flagsButton = document.createElement('button');
  flagsButton.type = 'button';
  flagsButton.className = 'pp-audit-flags-button';
  flagsButton.dataset.pp = 'audit-flags';
  const flagsPanel = document.createElement('div');
  flagsPanel.className = 'pp-audit-flags-panel';
  flagsPanel.hidden = true;
  flagsPanel.innerHTML = '<div class="pp-audit-flags-actions"><button type="button" data-audit-clear>Clear all</button><button type="button" data-audit-export>Export</button></div><ul data-audit-list></ul><p class="pp-audit-flags-status" data-audit-status role="status"></p>';
  banner.append(bannerText, flagsButton, flagsPanel);
  progressEl.before(banner);

  const flagsList = flagsPanel.querySelector('[data-audit-list]');
  const clearButton = flagsPanel.querySelector('[data-audit-clear]');
  const exportButton = flagsPanel.querySelector('[data-audit-export]');
  const flagsStatus = flagsPanel.querySelector('[data-audit-status]');
  const renderAuditFlags = () => {
    const entries = Object.entries(auditFlags);
    flagsButton.textContent = `Flags (${entries.length})`;
    flagsList.replaceChildren(...entries.map(([id, type]) => {
      const item = document.createElement('li');
      const location = host.findLocation ? host.findLocation(id) : host.passportLocation(id);
      item.textContent = `${id} · ${location?.short || location?.clue || 'Unknown location'} · ${AUDIT_FLAG_EMOJIS[type]} ${AUDIT_FLAG_LABELS[type]}`;
      return item;
    }));
    if (!entries.length) {
      flagsList.append(Object.assign(document.createElement('li'), { textContent: 'No flagged locations yet.' }));
    }
  };
  flagsButton.addEventListener('click', () => {
    flagsPanel.hidden = !flagsPanel.hidden;
    if (!flagsPanel.hidden) renderAuditFlags();
  });
  clearButton.addEventListener('click', () => {
    if (!window.confirm('Clear all audit flags?')) return;
    auditFlags = {};
    try {
      localStorage.removeItem(AUDIT_FLAGS_KEY);
      flagsStatus.textContent = 'All flags cleared.';
    } catch (error) {
      host.storageError('Clear failed', AUDIT_FLAGS_KEY, error);
    }
    renderAuditFlags();
  });
  exportButton.addEventListener('click', async () => {
    const byType = { image: [], city: [] };
    Object.entries(auditFlags).forEach(([id, type]) => { if (byType[type]) byType[type].push(id); });
    const sections = [];
    if (byType.image.length) sections.push('Wrong image:\n' + byType.image.join('\n'));
    if (byType.city.length) sections.push('Not a city:\n' + byType.city.join('\n'));
    const text = sections.join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      flagsStatus.textContent = text ? 'Flagged IDs copied.' : 'No flagged IDs to export.';
    } catch (error) {
      flagsStatus.textContent = 'Copy is unavailable on this browser.';
    }
  });
  window.__renderAuditFlags = renderAuditFlags;
  renderAuditFlags();
}

// Saved flags are read once, right before the Passport section is built.
export function initAudit(main) {
  host = main;
  try {
    const savedFlags = JSON.parse(localStorage.getItem(AUDIT_FLAGS_KEY) || '{}');
    if (savedFlags && typeof savedFlags === 'object' && !Array.isArray(savedFlags)) {
      auditFlags = Object.fromEntries(Object.entries(savedFlags).filter(([, type]) => AUDIT_FLAG_TYPES.includes(type)));
    }
  } catch (error) { host.storageError('Read failed', AUDIT_FLAGS_KEY, error); }
}
