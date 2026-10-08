"""Pre-fill pageviews-cache.json for every location (chunked so a crash loses <= 1 chunk)."""
import json, os, sys, time
import wiki
L = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'assets', 'locations.json')))
t0 = time.time()
for i in range(0, len(L), 100):
    ms = wiki.measure_all(L[i:i + 100])
    unres = sum(m['views'] is None for m in ms)
    print(f'{i + 100}/{len(L)} unresolved-in-chunk {unres} {time.time() - t0:.0f}s', flush=True)
