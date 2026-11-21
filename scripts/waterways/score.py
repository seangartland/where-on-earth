"""Waterways batch: fame and v2 difficulty through the FROZEN scorer.
Fame (BRIEF-waterways.md): en.wikipedia user pageviews of the article verified to be the feature itself, daily, trailing
365 days (2025-11-20..2026-11-19); mean = sum / 365, median = median day (missing days count as 0). An article moved
inside the window reads each day from the title the article had that day (landmark-pass PREMOVE precedent; redirect
hits under the other titles are not added). Under 100/day median goes to quarantine, not the bank.
Difficulty: scripts/difficulty/v2-data/score_v2.py's own definitions exec'd up to its production loop (CUTS frozen),
then rate() verbatim from scripts/mountain-ranges/score.py. Spike rule (landmark-pass/score.py): contaminated when the
mean is above the median and either at least 3x the median or the two land in different rarity bands; a contaminated
entry is scored on the median. Fallback centre: the clue's displayed US state (US/CA, US/NY; skill rule 4), else the
population centre of the country holding the largest coastline share (geometry.py; the seas precedent), else, for
single-country canals, that country.
Usage (from demo/): python3 scripts/waterways/score.py <id> [<id> ...]  ->  .build-tmp/waterways/score-<id>.json"""
import json, math, os, statistics, sys, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import TMP, CANDIDATES, get

H = os.path.dirname(os.path.abspath(__file__))
V2 = os.path.join(H, '../difficulty/v2-data')
src = open(os.path.join(V2, 'score_v2.py'), encoding='utf-8').read()
src = src[:src.index('via_views = ')]
cwd = os.getcwd(); os.chdir(V2); g = {'__name__': 'score_v2_defs'}; exec(src, g); os.chdir(cwd)

ISO3_TO_2 = {}
for l in open(os.path.join(V2, 'countryInfo.txt'), encoding='utf-8'):
    if not l.startswith('#'): p = l.split('\t'); ISO3_TO_2[p[1]] = p[0]
BAND = lambda d: 'Common' if d <= 3 else 'Uncommon' if d <= 6 else 'Rare' if d <= 8 else 'Legendary'
# Canals and US-state clues: the displayed unit. Everything else: the largest coastline share.
UNIT = {'golden-gate': 'US/CA', 'erie-canal': 'US/NY', 'suez-canal': 'EG', 'corinth-canal': 'GR', 'kiel-canal': 'DE',
        'grand-canal-china': 'CN', 'canal-du-midi': 'FR'}
WINDOW = ('2025112000', '2026111900')


def rate(x, v, c):
    """scripts/mountain-ranges/score.py rate(), verbatim in substance; c is the fallback centre."""
    i = x['id']
    dfb = round(g['hav'](x['lat'], x['lng'], *c))
    d1m = round(min(d for d in (g['hav'](x['lat'], x['lng'], b[2], b[3]) for b in g['big']) if d > 15))
    p, k = g['p_know'](v), g['KID'].get(i, g['K'].get(x['country'], 0))
    miss_c = k * max(g['K_FLOOR'], d1m)
    miss_u = max(g['FLOOR_KM'], math.hypot(dfb, miss_c))
    known = g['KNOWN_KM'][0] + (g['KNOWN_KM'][1] - g['KNOWN_KM'][0]) * (1 - p)
    loss = round(p * g['L'](min(known, miss_u)) + (1 - p) * g['L'](miss_u), 1)
    D = g['level'](loss, g['CUTS'])
    why = f"p{round(p, 2):.2f}".replace('p0.', 'p.').replace('p1.00', 'p1') + f"·fb{dfb}·K{k}·iso{d1m} → {loss:.1f} → {D}"
    return dict(p=round(p, 2), K=k, dFb=dfb, d1M=d1m, loss=loss, D=D, why=why)


def daily(title):
    d = get('https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/'
            + urllib.parse.quote(title.replace(' ', '_'), safe='') + f'/daily/{WINDOW[0]}/{WINDOW[1]}')
    return {m['timestamp'][:8]: m['views'] for m in d['items']} if d else {}


def score(i):
    c = CANDIDATES[i]
    geo = json.load(open(os.path.join(TMP, f'geometry-{i}.json')))
    dd = daily(c['title'])
    start = '00000000'
    for title, until in c.get('premove', []):   # each day is read from the title the article had that day
        dd = {**{k: v for k, v in dd.items() if not start <= k < until}, **{k: v for k, v in daily(title).items() if start <= k < until}}
        start = until
    days = list(dd.values()) + [0] * (365 - len(dd))
    mean, med = round(sum(days) / 365, 1), round(statistics.median(days), 1)
    if i in UNIT:
        unit = UNIT[i]; centre = g['centre'](unit); cc = unit.split('/')[0]; share = None
    else:
        iso3, _, share = next(s for s in geo['shares'] if s[0] in ISO3_TO_2)
        cc = ISO3_TO_2[iso3]; unit = cc; centre = g['centre'](cc)
    kname = next((n for n, code in g['ci'].items() if code == cc), None)
    lat, lng = geo['anchor']
    x = dict(id=i, lat=lat, lng=lng, country=kname)
    a, b = rate(x, mean, centre), rate(x, med, centre)
    row = dict(title=c['title'], premove=c.get('premove'), daysWithData=len(dd), meanViews=mean, medianViews=med,
               maxDay=max(days), scoringUnit=unit, scoringCountry=kname, scoringShare=share,
               centre=[round(centre[0], 4), round(centre[1], 4)], meanD=a['D'], meanWhy=a['why'], medianD=b['D'], medianWhy=b['why'],
               spike=False, basis='mean', quarantine=med < 100, **a)
    if mean > med and (mean >= 3 * med or BAND(a['D']) != BAND(b['D'])):
        row.update(b, spike=True, basis='median')
    json.dump(row, open(os.path.join(TMP, f'score-{i}.json'), 'w'), ensure_ascii=False, indent=1)
    return row


if __name__ == '__main__':
    for i in sys.argv[1:]:
        r = score(i)
        print(f"{i}: days {r['daysWithData']} mean {r['meanViews']} median {r['medianViews']} max {r['maxDay']} | {r['scoringUnit']} {r['scoringCountry']} "
              f"share {r['scoringShare']} | mean→{r['meanD']} median→{r['medianD']} | {r['basis']}: {r['why']}{' | QUARANTINE <100' if r['quarantine'] else ''}")
