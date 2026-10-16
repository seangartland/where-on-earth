# Grep an entry's cached Wikipedia text (from the fact pass) for a regex.
# Usage: python3 scripts/trivia-uniqueness/wgrep.py <id> <regex> [<id> <regex> ...]
import json, re, sys, os
c = json.load(open(os.path.join(os.path.dirname(__file__), '../trivia-fact-pass/wiki-cache.json')))
a = sys.argv[1:]
for i in range(0, len(a), 2):
    t = c.get(a[i], {}).get('text', '')
    hits = [t[max(0, m.start()-120):m.end()+120].replace('\n', ' ') for m in re.finditer(a[i+1], t, re.I)][:3]
    print(f'== {a[i]} /{a[i+1]}/: {len(hits)}')
    for h in hits: print('   ', h)
