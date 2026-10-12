"""Difficulty v2 (analysis copy, 2026-10-12): expected points a typical player loses on this city,
under the game's own scoring curve, mapped to 1..10 by frozen cut points.
Inputs: inputs-v2.json (measure.py: views, dFb, d1M), k-proposed.json (K, judgment).
Usage: python3 model.py [--calibrate] [id-substrings...]   -> rated-v2.json"""
import json, math, sys, collections as C

I = json.load(open('inputs-v2.json'))
_k = json.load(open('k-proposed.json')); K, KID = _k['K'], _k['Kid']

V0, V1 = 30, 2500          # ESTIMATE: views/day where ~0% / 99% of players can place the city (V1 = v1's F0 threshold)
KNOWN_KM = (20, 100)       # ESTIMATE: miss when the player knows the city: 20 km at p=1, 100 km at p=0
FLOOR_KM = 100             # ESTIMATE: best-case miss when guessing from the clue's country/unit alone (borders-free globe)
K_FLOOR = 800              # ESTIMATE: minimum region-scale miss when the country can't be placed
TARGET = [5, 8, 11, 13, 14, 14, 12, 10, 8, 5]      # % per level on the current dataset
CUTS = [3.7, 6.4, 9.6, 15.2, 24.3, 44.5, 78.9, 112.9, 201.7]   # calibrated 2026-10-12 on 748 to TARGET; frozen for this analysis


def L(km):
    """Points lost at km: 1000 - distanceScore(km) from src/main.js."""
    return 1000 - 1000 * math.exp(-((km / 3500) ** 1.13))


def p_know(v):
    """Share of players who can place the city, log-linear in measured views/day."""
    return 0.99 * min(1, max(0, math.log(max(v, 1) / V0) / math.log(V1 / V0)))


def rate(o):
    p, k = p_know(o['views']), KID.get(o['id'], K.get(o['country'], 0))
    miss_c = k * max(K_FLOOR, o['d1M'])                      # can't place the country: miss grows with isolation
    miss_u = max(FLOOR_KM, math.hypot(o['dFb'], miss_c))      # city unknown: tap the clue unit's population centre
    known = KNOWN_KM[0] + (KNOWN_KM[1] - KNOWN_KM[0]) * (1 - p)
    loss = p * L(min(known, miss_u)) + (1 - p) * L(miss_u)
    return dict(p=round(p, 2), K=k, known=round(known), missC=round(miss_c), missU=round(miss_u),
                loss=round(loss, 1), D=1 + sum(loss >= c for c in CUTS) if CUTS else None)


R = {i: dict(o, **rate(o)) for i, o in I.items()}
if '--calibrate' in sys.argv:
    s = sorted(r['loss'] for r in R.values()); n = len(s); acc = 0; CUTS = []
    for t in TARGET[:-1]:
        acc += t; CUTS.append(round(s[min(n - 1, round(acc / 100 * n))], 1))
    print('calibrated cuts', CUTS)
    R = {i: dict(o, **rate(o)) for i, o in I.items()}
h = C.Counter(r['D'] for r in R.values()); print(len(R), 'per level', [h[k] for k in range(1, 11)])
json.dump(R, open('rated-v2.json', 'w'), indent=1, ensure_ascii=False)
for q in [a for a in sys.argv[1:] if not a.startswith('--')]:
    for i, r in R.items():
        if q in i:
            print(f"{i:28s} v={r['views']:<7} p={r['p']:<5} known={r['known']:<4} dFb={r['dFb']:<5} d1M={r['d1M']:<5} "
                  f"K{r['K']} missU={r['missU']:<5} loss={r['loss']:<6} -> {r['D']:<2} (cur {r['cur']})")
