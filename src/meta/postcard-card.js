let postcardCardStyle;

export function postcardDisplayName(item, flagForLocation) {
  const flag = flagForLocation(item);
  return `${item.short || ''}${flag ? ` ${flag}` : ''}`;
}

export function buildPostcardCard(item, passportState, options) {
  const {
    flagForLocation,
    applyCardTier,
    addAuditFlagButton,
    variant = 'postcard',
    loading = 'lazy',
    element,
    className = '',
  } = options;
  const compact = variant === 'slot';
  const card = element || document.createElement(compact ? 'li' : 'article');
  card.className = `${compact ? 'pp-slot' : 'pp-post'}${className ? ` ${className}` : ''}`;
  card.replaceChildren();
  delete card.dataset.earn;
  if (passportState.earnName) card.dataset.earn = passportState.earnName;
  if (Number.isFinite(passportState.earned)) applyCardTier(card, item, passportState.earned);

  const photo = document.createElement('div');
  photo.className = compact ? 'pp-slot-photo' : 'pp-photo';
  if (item.image && passportState.photo !== 'flag') {
    const img = document.createElement('img');
    img.src = item.image;
    img.alt = '';
    img.loading = loading;
    img.decoding = 'async';
    img.addEventListener('error', () => img.remove(), { once: true });
    photo.append(img);
  } else if (compact && passportState.photo === 'flag') {
    const flag = document.createElement('span');
    flag.className = 'pps-flag';
    flag.textContent = flagForLocation(item);
    photo.append(flag);
  }
  if (compact && passportState.scoreText != null) {
    const score = document.createElement('span');
    score.className = 'pp-slot-score';
    if (passportState.scoreTier) score.dataset.tier = passportState.scoreTier;
    score.textContent = passportState.scoreText;
    photo.append(score);
  }
  if (compact) addAuditFlagButton?.(photo, passportState.entry);

  const name = document.createElement('p');
  name.className = compact ? 'pp-slot-name' : 'pp-name';
  name.textContent = postcardDisplayName(item, flagForLocation);
  if (compact) name.title = name.textContent;
  card.append(photo, name);

  if (!compact) {
    const meta = document.createElement('p');
    meta.className = 'pp-meta';
    meta.textContent = passportState.meta || '';
    card.append(meta);
  }
  return card;
}

export function ensurePostcardCardStyles() {
  if (postcardCardStyle) return;
  postcardCardStyle = document.createElement('style');
  postcardCardStyle.dataset.postcardCard = '';
  postcardCardStyle.textContent = `
.pp-post { position: relative; min-width: 0; padding: 5px 5px 8px; border: 2px solid var(--rarity, rgba(214,220,232,.16)); border-radius: 4px; background: #1a1f2e; box-shadow: 0 8px 22px rgba(0,0,0,.45), 0 1px 0 rgba(255,255,255,.12) inset; transition: transform .16s ease-out, filter .16s ease-out; cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
.pp-post:active { transform: scale(.965); filter: brightness(.95); }
.pp-post:focus-visible { outline: 2px solid #67e8ff; outline-offset: 3px; }
.pp-post.pp-lifted { visibility: hidden; }
.pp-photo { position: relative; aspect-ratio: 4 / 3; border-radius: 2px; overflow: hidden; background: linear-gradient(135deg, #1b2c5a, #3b2a6e); }
.pp-photo::after { content: '🌍'; position: absolute; inset: 0; display: grid; place-items: center; font-size: 26px; opacity: .45; }
.pp-photo img { position: relative; z-index: 1; display: block; width: 100%; height: 100%; object-fit: cover; object-position: center 20%; }
.pp-stamp { position: absolute; z-index: 2; right: 8px; top: 8px; display: grid; place-items: center; width: 42px; height: 42px; border-radius: 50%; border: 2px dashed currentColor; background: rgba(8,14,32,.82); color: #9fb6cc; font-size: 15px; font-weight: 900; line-height: 1; font-variant-numeric: tabular-nums; transform: rotate(12deg); box-shadow: 0 0 0 3px rgba(8,14,32,.82); text-align: center; }
.pp-stamp small { display: block; margin-top: 2px; font-size: 10px; font-weight: 800; letter-spacing: .08em; opacity: .9; text-align: center; }
.pp-stamp[data-tier="gold"] { color: #ffd166; text-shadow: 0 0 10px rgba(255,209,102,.45); }
.pp-stamp[data-tier="cyan"] { color: #67e8ff; }
.pp-post[data-earn="seen"] { background: #151923; }
.pp-post[data-earn="seen"] .pp-photo img { filter: grayscale(1) contrast(.92) brightness(.82); }
.pp-post[data-earn="seen"] .pp-name { color: #8992a8; }
.pp-name { margin: 7px 2px 0; overflow: hidden; color: #eef2ff; font-size: 13px; font-weight: 800; line-height: 1.2; letter-spacing: -.01em; text-overflow: ellipsis; white-space: nowrap; }
.pp-meta { min-height: 12px; margin: 4px 2px 0; color: #a8b0c3; font-size: 10px; font-weight: 700; font-variant-numeric: tabular-nums; }
.pp-meta span { white-space: nowrap; }
.pp-tier-date { color: rgba(193,224,250,.66); font-weight: 650; }
@media (max-width: 360px) { .pp-stamp { width: 36px; height: 36px; font-size: 13px; } }
`;
  document.head.append(postcardCardStyle);
}
