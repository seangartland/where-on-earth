import { renderAvatar } from './avatar.js';

export const LEVEL_UNLOCKS = Object.freeze([
  { level: 2, kind: 'title-pick', text: 'Level 2 title pick', detail: 'Choose your Level 2 title in Customize: Window Seat or Aisle Seat' },
  { level: 5, kind: 'silver-ring', text: 'Silver ring', detail: 'Silver seal ring finish unlocked' },
  { level: 5, kind: 'card', text: 'Airmail banner', detail: 'New banner: Airmail' },
  { level: 5, kind: 'titles', text: 'both titles', detail: 'Window Seat and Aisle Seat titles are now both yours' },
  { level: 10, kind: 'gold-ring', text: 'Gold ring', detail: 'Gold seal ring finish unlocked' },
]);

export function unlocksBetween(levelBefore, levelAfter) { return LEVEL_UNLOCKS.filter((unlock) => unlock.level > levelBefore && unlock.level <= levelAfter); }
export function stripWindow(level) { const start = Math.max(1, Math.min(level - 4, 91)); return Array.from({ length: 10 }, (_, index) => start + index); }
export function rewardLabel(reward, catalogs) {
  if (reward === 'motif:star') return 'Star seal motif';
  if (reward === 'topper:santa-hat') return 'Santa Hat topper';
  if (reward === 'topper:antlers') return 'Antlers topper';
  const [type, id] = String(reward || '').split(':');
  const group = type === 'title' ? catalogs?.Titles : type === 'card' ? catalogs?.Banners : null;
  const found = group?.find(([itemId]) => itemId === id);
  return found ? `${found[1]} ${type === 'title' ? 'title' : 'banner'}` : 'Achievement reward';
}

function nextUnlock(level) { return LEVEL_UNLOCKS.find((unlock) => unlock.level > level); }
export function renderXpBar(profile, { awarded = null, compact = false, sealSize = 30 } = {}) {
  const span = Math.max(1, Number(profile.levelSpan) || 1); const into = Math.max(0, Number(profile.xpIntoLevel) || 0);
  const percent = Math.min(100, (into / span) * 100); const before = awarded && awarded.levelBefore === profile.level ? Math.max(0, into - awarded.total) : into;
  const beforePercent = Math.min(100, (before / span) * 100); const next = nextUnlock(profile.level);
  const seal = document.createElement('span'); seal.append(renderAvatar(profile.loadout?.avatar, sealSize, { compact: true, name: profile.displayName, level: profile.level }));
  return `<div class="xp-bar${compact ? ' xp-bar-compact' : ''}"><span class="xp-bar-seal">${seal.innerHTML}</span><div class="xp-bar-copy"><div class="xp-bar-top"><b>Level ${profile.level}</b><span>${profile.xpToNext} XP to ${compact ? 'go' : 'next level'}</span></div><div class="xp-bar-track"><i class="xp-bar-fill" style="width:${percent}%"></i>${awarded ? `<i class="xp-bar-earned" style="left:${beforePercent}%;width:${Math.max(0, percent - beforePercent)}%"></i>` : ''}</div>${compact ? '' : `<div class="xp-bar-bottom"><span>${into} of ${span} XP this level</span>${next ? `<span>Next: ${next.text} at Level ${next.level}</span>` : ''}</div>`}</div></div>`;
}
