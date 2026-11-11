"""Mountain-ranges batch: fame and v2 difficulty through the FROZEN scorer.
Fame: en.wikipedia user pageviews of the range article, monthly 2025-10..2026-09, mean = sum / 365, median month / 30.4
(scripts/landmark-pass/resolve.py window and method). Difficulty: scripts/difficulty/v2-data/score_v2.py's own
definitions exec'd up to its production loop (CUTS frozen), then rate() copied verbatim from
scripts/landmark-pass/score.py, with the spike rule from that file (median month when the mean is at least 3x the
median or the two land in different rarity bands). score_v2.py and landmark-pass/score.py are not modified.
Fallback centre: a range spans several countries, so, as the seas precedent (gap adds chunk 4: the scorable country is
the largest share of the coastline), the range is scored on the population centre of the country holding the largest
share of its spine (geometry.py shares, game country outlines). The pin is the spine's midpoint.
Usage (from demo/): python3 scripts/mountain-ranges/score.py <id> [<id> ...]
Writes .build-tmp/mountain-ranges/score-<id>.json."""
import json, math, os, statistics, sys, urllib.parse
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import TMP, RANGES, get

H = os.path.dirname(os.path.abspath(__file__))
V2 = os.path.join(H, '../difficulty/v2-data')
src = open(os.path.join(V2, 'score_v2.py'), encoding='utf-8').read()
src = src[:src.index('via_views = ')]
cwd = os.getcwd(); os.chdir(V2); g = {'__name__': 'score_v2_defs'}; exec(src, g); os.chdir(cwd)

ISO3_TO_2 = {}
for l in open(os.path.join(V2, 'countryInfo.txt'), encoding='utf-8'):
    if not l.startswith('#'): p = l.split('\t'); ISO3_TO_2[p[1]] = p[0]
BAND = lambda d: 'Common' if d <= 3 else 'Uncommon' if d <= 6 else 'Rare' if d <= 8 else 'Legendary'


def rate(x, v, c):
    """scripts/landmark-pass/score.py rate(), verbatim in substance; c is the fallback centre."""
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


def score(rid):
    geo = json.load(open(os.path.join(TMP, f'geometry-{rid}.json')))
    title = RANGES[rid]
    d = get('https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/'
            + urllib.parse.quote(title.replace(' ', '_'), safe='') + '/monthly/2025100100/2026093000')
    mm = {m['timestamp'][:6]: m['views'] for m in d['items']}
    months = [mm[k] for k in sorted(mm)]
    assert len(months) == 12, (rid, len(months))
    mean = round(sum(months) / 365, 1)
    med = round(statistics.median([v / 30.4 for v in months]), 1)
    iso3, share = next((k, v) for k, v in geo['shareIso3'] if k in ISO3_TO_2)
    cc = ISO3_TO_2[iso3]; centre = g['centre'](cc)
    lat, lng = geo['midpoint']
    # K is keyed by the bank's country name; a span text has no K entry, so K comes from the scoring country.
    kname = next((n for n, code in g['ci'].items() if code == cc), None)
    x = dict(id=rid, lat=lat, lng=lng, country=kname)
    a, b = rate(x, mean, centre), rate(x, med, centre)
    row = dict(title=title, months=months, meanViews=mean, medianViews=med, maxOverMedian=round(max(months) / 30.4 / med, 2),
               scoringCountry=kname, scoringIso2=cc, scoringShare=share, centre=[round(centre[0], 4), round(centre[1], 4)],
               meanD=a['D'], meanWhy=a['why'], medianD=b['D'], medianWhy=b['why'], spike=False, basis='mean', **a)
    if mean > med and (mean >= 3 * med or BAND(a['D']) != BAND(b['D'])):
        row.update(b, spike=True, basis='median month')
    json.dump(row, open(os.path.join(TMP, f'score-{rid}.json'), 'w'), ensure_ascii=False, indent=1)
    return row


if __name__ == '__main__':
    for rid in sys.argv[1:]:
        r = score(rid)
        print(f"{rid}: mean {r['meanViews']} median {r['medianViews']} max/med {r['maxOverMedian']} | scored on {r['scoringCountry']} "
              f"({r['scoringShare']:.0%} of spine) | mean→{r['meanD']} median→{r['medianD']} | {r['basis']}: {r['why']}")
