// Temporary, query-gated extent practice. It deliberately uses the shared
// round scorer and reveal path, so extent geometry behaves exactly as it does
// in Survival.
let host = null;

export const extentTestEnabled = () => new URLSearchParams(location.search).get('extents') === '1';

export function extentTestPool(items) {
  return (Array.isArray(items) ? items : []).filter((item) => item?.kind === 'extent'
    && Number.isFinite(item.lat) && Number.isFinite(item.lng) && typeof item.image === 'string' && item.image.trim());
}

export function shuffleExtentPool(items, random = Math.random) {
  const picks = items.slice();
  for (let i = picks.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [picks[i], picks[j]] = [picks[j], picks[i]];
  }
  return picks;
}

export const extentTest = { active: false, round: 0, item: null, picks: [], results: [], total: 0 };

export function startExtentTest() {
  const pool = extentTestPool(host.landmarks);
  if (!pool.length) return;
  host.expeditionRun.active = false;
  host.endless.active = false;
  host.borders.active = false;
  host.survival.active = false;
  host.trivia.active = false;
  host.pack.active = false;
  extentTest.active = true;
  extentTest.round = 0;
  extentTest.picks = shuffleExtentPool(pool);
  extentTest.results = [];
  extentTest.total = 0;
  extentTestGo();
}

function extentTestGo() {
  extentTest.item = extentTest.picks[extentTest.round];
  extentTest.round += 1;
  host.showRound();
}

export function extentTestRoundHeader() {
  const { gameEls } = host;
  document.body.classList.add('extent-test');
  gameEls.number.textContent = `Round ${extentTest.round} of ${extentTest.picks.length}`;
  gameEls.weight.textContent = `Score ${extentTest.total.toLocaleString()}`;
  gameEls.weight.style.display = '';
  gameEls.dailyDate.hidden = true;
  gameEls.extentTestQuit.hidden = false;
}

export function extentTestRecordGuess(distance, score) {
  extentTest.total += score;
  extentTest.results.push({ item: extentTest.item, distance, score });
  host.gameEls.weight.textContent = `Score ${extentTest.total.toLocaleString()}`;
}

export function extentTestRevealCard(pill) {
  const { gameEls } = host;
  gameEls.score.textContent = `+${extentTest.results.at(-1).score}`;
  pill.textContent = `Score ${extentTest.total.toLocaleString()}`;
  gameEls.next.textContent = extentTest.round >= extentTest.picks.length ? 'Results' : 'Next';
}

export function extentTestNext() {
  if (extentTest.round >= extentTest.picks.length) showExtentTestResults();
  else extentTestGo();
}

function showExtentTestResults() {
  const { gameEls } = host;
  extentTest.active = false;
  host.clearReveal();
  host.hideScreens();
  host.gameMode = 'extent-test-results';
  window.__canGuess = false;
  gameEls.extentTestResults.hidden = false;
  gameEls.extentTestTotal.textContent = extentTest.total.toLocaleString();
  gameEls.extentTestRounds.textContent = `${extentTest.results.length.toLocaleString()} rounds played`;
  document.body.className = 'game-results extent-test';
}

export function initExtentTest(main) {
  host = main;
  if (!extentTestEnabled()) return;
  host.gameEls.extentTestEntry.hidden = false;
  const count = extentTestPool(host.landmarks).length;
  host.gameEls.extentTestCount.textContent = `${count.toLocaleString()} locations`;
  host.gameEls.extentTestEntry.disabled = !count;
  host.gameEls.extentTestEntry.addEventListener('click', startExtentTest);
  host.gameEls.extentTestHome.addEventListener('click', host.goHome);
  host.gameEls.extentTestQuit.addEventListener('click', host.goHome);
}
