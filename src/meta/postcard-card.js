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
    showFlagInName = true,
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
    const [distance, unit] = String(passportState.scoreText).split(/\s+/, 2);
    score.append(document.createTextNode(distance));
    if (unit) score.append(document.createElement('br'), document.createTextNode(unit));
    photo.append(score);
  }
  if (compact) addAuditFlagButton?.(photo, passportState.entry);

  const name = document.createElement('p');
  name.className = compact ? 'pp-slot-name' : 'pp-name';
  name.textContent = showFlagInName ? postcardDisplayName(item, flagForLocation) : (item.short || '');
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
.pp-post { position: relative; min-width: 0; padding: 5px 5px 8px; border: 2px solid rgba(214,220,232,.16); border-radius: 4px; background: #1a1f2e; box-shadow: 0 8px 22px rgba(0,0,0,.45), 0 1px 0 rgba(255,255,255,.12) inset; transition: transform .16s ease-out, filter .16s ease-out; cursor: pointer; touch-action: manipulation; -webkit-tap-highlight-color: transparent; }
.pp-post:active { transform: scale(.965); filter: brightness(.95); }
.pp-post:focus-visible { outline: 2px solid #67e8ff; outline-offset: 3px; }
.pp-post.pp-lifted { visibility: hidden; }
.pp-photo { position: relative; aspect-ratio: 4 / 3; border-radius: 2px; overflow: hidden; background: linear-gradient(135deg, #1b2c5a, #3b2a6e); }
.pp-photo::after { content: '🌍'; position: absolute; inset: 0; display: grid; place-items: center; font-size: 26px; opacity: .45; }
.pp-photo img { position: relative; z-index: 1; display: block; width: 100%; height: 100%; object-fit: cover; object-position: center 20%; }
.pp-post[data-earn="seen"] { background: #151923; }
.pp-post[data-earn="seen"] .pp-photo img { filter: grayscale(1) contrast(.92) brightness(.82); }
.pp-post[data-earn="seen"] .pp-name { color: #8992a8; }
.pp-name { margin: 7px 2px 0; overflow: hidden; color: #eef2ff; font-size: 13px; font-weight: 800; line-height: 1.2; letter-spacing: -.01em; text-overflow: ellipsis; white-space: nowrap; }
.pp-meta { min-height: 12px; margin: 4px 2px 0; color: #a8b0c3; font-size: 10px; font-weight: 700; font-variant-numeric: tabular-nums; }
.pp-meta span { white-space: nowrap; }
/* Passport shelf cards retain the compact component but use the mailed-paper face. */
.pp-dex .pp-slot { overflow: hidden; padding: 0 0 6px; border-radius: 4px; background: var(--mail-paper); box-shadow: 0 2px 6px rgba(0,0,0,.4), inset 0 0 0 1px rgba(101,78,38,.18); }
.pp-dex .pp-slot::before { content: ''; display: block; height: var(--mail-band-height); background: var(--mail-stripe); }
.pp-dex .pp-slot.is-mystery::before { background: repeating-linear-gradient(45deg, #a89e8c 0 9px, #e9e2d0 9px 18px, #8b93a3 18px 27px, #e9e2d0 27px 36px); opacity: .55; }
.pp-dex .pp-slot-photo { margin: 5px 5px 0; overflow: visible; border: 3px solid #fffdf6; border-radius: 0; background: #d9cdb2; box-shadow: 0 0 0 1px rgba(101,78,38,.22), 0 1px 3px rgba(101,78,38,.25), inset 0 0 8px rgba(90,70,30,.16); }
.pp-dex .pp-slot-score { top: -6px; right: -4px; bottom: auto; display: flex; align-items: center; justify-content: center; width: 24px; height: 24px; padding: 1px; border: 1.4px solid rgba(90,90,90,.55); background: rgba(245,242,235,.9); outline: 1.2px solid rgba(90,90,90,.55); outline-offset: 2px; color: rgba(90,90,90,.8); font-size: 7px; line-height: 1.15; text-align: center; white-space: normal; transform: rotate(-11deg); box-shadow: none; }
.pp-dex .pp-slot-score::after { content: ''; position: absolute; inset: 2.5px; border: 1px dashed rgba(90,90,90,.5); border-radius: 50%; pointer-events: none; }
.pp-dex .pp-slot-score[data-tier="bullseye"], .pp-dex .pp-slot-score[data-tier="pinpoint"] { border-color: #b27c20; background: rgba(250,243,225,.9); outline-color: #b27c20; color: #b27c20; }
.pp-dex .pp-slot-score[data-tier="bullseye"]::after, .pp-dex .pp-slot-score[data-tier="pinpoint"]::after { border-color: rgba(178,124,32,.55); }
.pp-dex .pp-slot-name { margin: 6px 7px 0; color: var(--mail-ink); }
.pp-dex .pp-slot[data-earn="seen"] .pp-slot-name { color: #526071; }
.pp-dex .pp-slot.is-mystery .pp-slot-photo { border-color: #fffdf6; }
.pp-dex .pp-slot.is-mystery .pp-slot-name { color: rgba(34,53,92,.55); }
.pp-dex .pps-flag { inset: 4px; border: 1.5px dashed rgba(101,78,38,.4); background: rgba(44,74,124,.05); filter: drop-shadow(0 2px 4px rgba(0,0,0,.18)); }
`;
  document.head.append(postcardCardStyle);
}
