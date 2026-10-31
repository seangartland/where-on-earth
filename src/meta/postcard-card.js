
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

