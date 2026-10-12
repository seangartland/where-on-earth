"""Rating stability of selected ids across a grid of the ESTIMATE parameters (cuts recalibrated per run)."""
import json, math, itertools, collections as C
I = json.load(open('inputs-v2.json')); _k = json.load(open('k-proposed.json')); K, KID = _k['K'], _k['Kid']
def L(km): return 1000 - 1000 * math.exp(-((km / 3500) ** 1.13))
T = [5, 8, 11, 13, 14, 14, 12, 10, 8, 5]
ids = ['paris-france', 'houston-usa', 'seattle-usa', 'portland-oregon-usa', 'nagpur-in', 'hanoi-vietnam', 'bamako',
       'honolulu-usa', 'alice-springs', 'abala', 'funafuti-tuvalu', 'nuuk-greenland', 'tristan-da-cunha']
res = C.defaultdict(list); runs = 0
for KN, FL, V0, V1, KF in itertools.product([10, 20, 40], [75, 100, 150], [20, 30, 50], [2000, 2500, 4000], [600, 800, 1200]):
    def loss(o):
        p = 0.99 * min(1, max(0, math.log(max(o['views'], 1) / V0) / math.log(V1 / V0))); k = KID.get(o['id'], K.get(o['country'], 0))
        mu = max(FL, math.hypot(o['dFb'], k * max(KF, o['d1M']))); kn = KN + (100 - KN) * (1 - p)
        return p * L(min(kn, mu)) + (1 - p) * L(mu)
    ls = {i: loss(o) for i, o in I.items()}; s = sorted(ls.values()); n = len(s); acc = 0; cuts = []
    for t in T[:-1]: acc += t; cuts.append(s[min(n - 1, round(acc / 100 * n))])
    for i in ids: res[i].append(1 + sum(ls[i] >= c for c in cuts))
    runs += 1
print(runs, 'parameter combinations')
for i in ids: c = C.Counter(res[i]); print(f'{i:22s}', dict(sorted(c.items())))
