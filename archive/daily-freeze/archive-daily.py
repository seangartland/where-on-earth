#!/usr/bin/env python3
"""Generate today's daily game archive entry.

Replicates the client's dailyIds() logic exactly:
- 5 difficulty bands: [1-2], [3-4], [5-6], [7-8], [9-10]
- Each band shuffled deterministically with seed "band-{b}"
- Day N takes index N mod band length
- Landmarks are excluded using the same name terms as the daily game

Appends {date: [5 location IDs]} to assets/daily-archive.json.
"""
import json
import hashlib
from datetime import date, datetime, timezone
from pathlib import Path

DEMO_DIR = Path(__file__).parent.parent
LOCATIONS_PATH = DEMO_DIR / "assets" / "locations.json"
ARCHIVE_PATH = DEMO_DIR / "assets" / "daily-archive.json"

LANDMARK_TERMS = (
    "temple", "cathedral", "church", "mosque", "palace", "castle", "museum",
    "tower", "bridge", "statue", "monument", "ruins", "abbey", "shrine",
    "fort", "citadel", "basilica", "chapel", "synagogue", "pagoda",
    "house of", "hall of", "tomb of",
)

def is_landmark(location):
    """Return whether a location's short name identifies it as a landmark."""
    return any(term in str(location.get("short", "")).lower() for term in LANDMARK_TERMS)

def hash_seed(s):
    """Match client's hashSeed: simple string hash to 32-bit int."""
    h = 0
    for c in s:
        h = (h * 31 + ord(c)) & 0xFFFFFFFF
    return h

def random_from(seed):
    """Match client's mulberry32 PRNG."""
    state = seed & 0xFFFFFFFF
    def rand():
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        t = state
        t = ((t ^ (t >> 15)) * (t | 1)) & 0xFFFFFFFF
        t ^= t + ((t ^ (t >> 7)) * (t | 61)) & 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296
    return rand

def daily_ids(date_str, locations):
    bands = []
    for lo, hi in [(1,2), (3,4), (5,6), (7,8), (9,10)]:
        band = [l for l in locations
                if not is_landmark(l) and l.get('image') and lo <= (l.get('difficulty') or 5) <= hi]
        bands.append(band)
    
    epoch = datetime(2026, 10, 1, tzinfo=timezone.utc).timestamp() / 86400
    day_num = int(datetime.fromisoformat(f"{date_str}T12:00:00+00:00").timestamp() / 86400) - int(epoch)
    
    result = []
    for b, band in enumerate(bands):
        if not band:
            continue
        shuffled = band[:]
        rand = random_from(hash_seed(f"band-{b}"))
        for i in range(len(shuffled) - 1, 0, -1):
            j = int(rand() * (i + 1))
            shuffled[i], shuffled[j] = shuffled[j], shuffled[i]
        idx = day_num % len(shuffled)
        result.append(shuffled[idx]['id'])
    return result

def main():
    today = date.today().isoformat()
    
    with open(LOCATIONS_PATH) as f:
        locations = json.load(f)
    
    archive = {}
    if ARCHIVE_PATH.exists():
        with open(ARCHIVE_PATH) as f:
            archive = json.load(f)
    
    if today in archive:
        print(f"{today} already archived")
        return
    
    picks = daily_ids(today, locations)
    # Store as [{id, round}] to preserve round assignments even if difficulties change later
    archive[today] = [{"id": id, "round": i+1} for i, id in enumerate(picks)]
    
    with open(ARCHIVE_PATH, 'w') as f:
        json.dump(archive, f, indent=2)
    
    print(f"Archived {today}: {picks}")

if __name__ == '__main__':
    main()
