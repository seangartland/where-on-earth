#!/usr/bin/env python3
"""Automated location audit for Where on Earth.
Run before every batch merge: python3 scripts/audit-locations.py
"""
import json
import math
import re
import sys
from collections import Counter
from difflib import SequenceMatcher
from pathlib import Path

DEMO = Path(__file__).parent.parent
LOCATIONS = DEMO / "assets" / "locations.json"

def haversine(lat1, lng1, lat2, lng2):
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng/2)**2
    return 2 * R * math.asin(math.sqrt(a))

def main():
    with open(LOCATIONS) as f:
        locs = json.load(f)

    print(f"Total locations: {len(locs)}")
    issues = 0

    # 1. Exact ID dupes
    ids = [l['id'] for l in locs]
    dupes = {k: v for k, v in Counter(ids).items() if v > 1}
    print(f"\n=== Exact ID dupes: {len(dupes)} ===")
    if dupes:
        issues += len(dupes)
        for k, v in list(dupes.items())[:10]:
            print(f"  FAIL: {k} appears {v}x")

    # 2. Name similarity
    print(f"\n=== Name similarity (>0.85) ===")
    similar = []
    names = [(l['id'], l['short'].lower()) for l in locs]
    for i in range(len(names)):
        for j in range(i+1, len(names)):
            id1, n1 = names[i]
            id2, n2 = names[j]
            if n1 == n2 and n1:
                similar.append((id1, id2, n1, 1.0))
            elif len(n1) > 4 and len(n2) > 4:
                ratio = SequenceMatcher(None, n1, n2).ratio()
                if ratio > 0.85:
                    similar.append((id1, id2, f"{n1}/{n2}", ratio))
    print(f"Found {len(similar)} similar pairs")
    if similar:
        issues += len(similar)
        for id1, id2, n, r in similar[:15]:
            print(f"  CHECK: {r:.2f} {id1} <-> {id2}")

    # 3. Tight proximity
    print(f"\n=== Tight proximity (<500m) ===")
    close = []
    for i in range(len(locs)):
        for j in range(i+1, len(locs)):
            l1, l2 = locs[i], locs[j]
            try:
                d = haversine(l1['lat'], l1['lng'], l2['lat'], l2['lng'])
                if d < 0.5:
                    close.append((l1['id'], l2['id'], d))
            except (KeyError, TypeError):
                pass
    print(f"Found {len(close)} pairs within 500m")
    if close:
        # Don't count as issues automatically, many are city+landmark
        for id1, id2, d in close[:15]:
            print(f"  INFO: {d*1000:.0f}m {id1} <-> {id2}")

    # 4. Missing fields
    print(f"\n=== Missing fields ===")
    required = ['id', 'short', 'clue', 'lat', 'lng', 'difficulty', 'image']
    missing = 0
    for loc in locs:
        for field in required:
            if field not in loc or loc[field] is None or loc[field] == '':
                print(f"  FAIL: {loc.get('id', '?')} missing {field}")
                missing += 1
                break
    print(f"Records with missing fields: {missing}")
    issues += missing

    # 5. Invalid coordinates
    print(f"\n=== Invalid coordinates ===")
    bad_coords = 0
    for loc in locs:
        lat, lng = loc.get('lat'), loc.get('lng')
        if lat is None or lng is None:
            continue
        if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
            print(f"  FAIL: {loc['id']} has invalid coords ({lat}, {lng})")
            bad_coords += 1
        elif abs(lat) < 0.1 and abs(lng) < 0.1:
            print(f"  FAIL: {loc['id']} at null island (0,0)")
            bad_coords += 1
    print(f"Bad coordinates: {bad_coords}")
    issues += bad_coords

    # 6. Image URL format
    print(f"\n=== Image URL issues ===")
    bad_img = 0
    for loc in locs:
        img = loc.get('image', '')
        if not img:
            continue
        if img.endswith('.svg'):
            print(f"  FAIL: {loc['id']} uses SVG")
            bad_img += 1
        elif not img.startswith(('http://', 'https://')):
            print(f"  FAIL: {loc['id']} bad URL format")
            bad_img += 1
    print(f"Image issues: {bad_img}")
    issues += bad_img

    print(f"\n{'='*40}")
    print(f"Total issues: {issues}")
    return 1 if issues > 0 else 0

if __name__ == '__main__':
    sys.exit(main())
