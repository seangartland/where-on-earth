#!/usr/bin/env python3
"""Build the review-only Step A regions proposal. Never writes assets/locations.json."""
import collections as C
import json
import math
import re
import unicodedata
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
LOC = json.loads((ROOT / "assets/locations.json").read_text())
REG = json.loads((HERE / "regions.json").read_text())
PIP = json.loads((HERE / "pip-a1.json").read_text())
DISP = json.loads((HERE / "dispersion.json").read_text())
VIEWS = json.loads((HERE / "regviews.json").read_text())
RATED = json.loads((ROOT / "scripts/difficulty/v2-data/rated-v2-final.json").read_text())

THRESHOLD = 200
CUTS = [4.7, 7.0, 9.6, 15.2, 24.3, 44.5, 78.9, 112.9, 201.7]
V0, V1, FLOOR_KM, K_FLOOR = 30, 2500, 100, 800
KNOWN_KM = (20, 100)
UK = {"England", "Scotland", "Wales", "Northern Ireland"}
TERRITORY = {"ilulissat-greenland", "nuuk-greenland", "qaqortoq-greenland", "nanortalik-greenland", "san-juan",
             "noumea-new-caledonia", "papeete-tahiti", "hong-kong", "macau", "longyearbyen-svalbard"}
ALREADY = {"albuquerque-usa", "anchorage-usa", "columbus", "jacksonville", "portland-oregon-usa",
           "roswell-ufo-incident", "tampa-usa", "tucson-usa", "boise-usa", "oklahoma-city-usa",
           "des-moines-usa", "little-rock-usa", "buffalo-usa", "juneau-usa", "spokane-usa",
           "providence-usa", "washington-dc-usa", "denpasar-indonesia", "kochi-india", "st-johns-canada"}
DISPLAY = {"VN.79": "Ho Chi Minh City", "CA.05": "Newfoundland and Labrador", "US.DC": "District of Columbia"}
STOP = r"\b(city|region|province|state|oblast|krai|department|district|federal|capital|f d|d c|municipality|autonomous|metropolitan|of|the|special)\b"

def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    return re.sub(r"\s+", "", re.sub(STOP, " ", re.sub(r"[^a-z ]", " ", s)))

def pknow(v):
    return .99 * min(1, max(0, math.log(max(v, 1) / V0) / math.log(V1 / V0)))

def loss_curve(km):
    return 1000 - 1000 * math.exp(-((km / 3500) ** 1.13))

def level(loss):
    return 1 + sum(loss >= cut for cut in CUTS)

def flag_suffix(clue):
    m = re.search(r"\s([\U0001F1E6-\U0001F1FF]{2})$", clue)
    return f" {m.group(1)}" if m else ""

def proposed_clue(x, region, show):
    if not show:
        return x["clue"]
    return f'{x["short"]}, {region}, {x["country"]}{flag_suffix(x["clue"])}'

def applicable(threshold):
    return {k for k, d in DISP.items() if d and d["dCountry"] >= threshold and k not in UK}

def classify(x, threshold=THRESHOLD):
    r = REG[x["id"]]
    if x["id"] in TERRITORY:
        return "territory-unit"
    if x["country"] not in applicable(threshold):
        return "not-applicable"
    if not r["gn"] or r["dFbRegion"] is None:
        return "unmatched"
    name = DISPLAY.get(r["gn"], r["gnName"])
    # US "City" suffixes are meaningful proper names (Oklahoma City / Oklahoma), not tautologies.
    if norm(x["short"]) == norm(name) and x["country"] != "United States":
        return "same-name"
    if x["id"] in ALREADY:
        return "already-region"
    return "gains-clue"

def score(x, r, rv):
    old = RATED[x["id"]]
    p, q = pknow(old["views"]), pknow(rv)
    known = KNOWN_KM[0] + (KNOWN_KM[1] - KNOWN_KM[0]) * (1 - p)
    miss_c = max(FLOOR_KM, math.hypot(r["dFbCountry"], old["K"] * max(K_FLOOR, old["d1M"])))
    miss_r = min(max(FLOOR_KM, r["dFbRegion"]), miss_c)
    nonknown = q * loss_curve(miss_r) + (1 - q) * loss_curve(miss_c)
    known_loss = loss_curve(min(known, miss_r))
    loss = round(p * known_loss + (1 - p) * nonknown, 1)
    return {"oldLevel": x["difficulty"], "newLevel": level(loss), "q": round(q, 4), "loss": loss,
            "regionViewsPerDay": rv, "dFbCountryKm": r["dFbCountry"], "dFbRegionKm": r["dFbRegion"]}

def main():
    entries = []
    missing_views = []
    for x in LOC:
        i, r = x["id"], REG[x["id"]]
        status = classify(x)
        assigned = status in {"same-name", "already-region", "gains-clue"}
        name = DISPLAY.get(r["gn"], r["gnName"]) if assigned else None
        show = status in {"already-region", "gains-clue"}
        proposed = proposed_clue(x, name, show)
        rec = {"id": i, "country": x["country"], "short": x["short"], "status": status,
               "oldClue": x["clue"], "proposedClue": proposed, "clueChanged": proposed != x["clue"],
               "region": ({"code": r["gn"], "name": name, "populationCentre": {"lat": r["regionCentre"][0],
                           "lng": r["regionCentre"][1]}, "assignmentMethod": r["how"],
                           "coastalFallbackKm": r["km"]} if assigned else None), "rescore": None}
        if status == "gains-clue":
            rv = VIEWS.get(r["gn"], {}).get("views")
            if rv is None:
                missing_views.append({"id": i, "regionCode": r["gn"], "region": name})
            else:
                rec["rescore"] = score(x, r, rv)
        entries.append(rec)

    sensitivity = []
    for threshold in (150, 200, 250, 300):
        statuses = C.Counter(classify(x, threshold) for x in LOC)
        sensitivity.append({"thresholdKm": threshold, "countriesApplicable": len(applicable(threshold)),
                            "cluesChanged": statuses["gains-clue"], "entriesRescored": statuses["gains-clue"]})
    counts = C.Counter(e["status"] for e in entries)
    out = {"schemaVersion": 1, "pilotOnly": True,
           "sources": {"locations": "assets/locations.json", "admin1": "Natural Earth 1:10m Admin-1 cached extract",
                       "populationCentres": "GeoNames cities15000.txt", "pageviewWindow": "2025-10 through 2026-09",
                       "regionPageviews": "Wikimedia API monthly all-access user views; sum / 365, rounded to 0.1 views/day",
                       "difficultyModel": "scripts/difficulty/v2-data/score_v2.py", "frozenCuts": CUTS},
           "thresholdKm": THRESHOLD, "counts": {"input": len(entries), **dict(sorted(counts.items())),
                                                   "rescored": sum(e["rescore"] is not None for e in entries)},
           "sensitivity": sensitivity,
           "politicalOverrides": [
               {"case": "Somaliland", "locationIds": ["hargeysa"], "decision": "hold-unmatched",
                "reason": "Country build treats the pin as Somalia, while the NE feature is a Somaliland map unit; no silent sovereign-to-Admin-1 crosswalk."},
               {"case": "Jerusalem", "locationIds": ["jerusalem"], "decision": "retain-existing-Israel-unit-clue",
                "reason": "Israel is below the applicability gate; no new region text or rating."},
               {"case": "Crimea/Sevastopol", "locationIds": [], "decision": "Ukraine-worldview", "reason": "No current location is in Crimea or Sevastopol."},
               {"case": "Western Sahara", "locationIds": [], "decision": "country-build-worldview", "reason": "No current location is in Western Sahara."}],
           "missingPageviews": missing_views, "entries": entries}
    (HERE / "step-a-changes.json").write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"counts": out["counts"], "sensitivity": sensitivity, "missingPageviews": missing_views}, indent=2))

if __name__ == "__main__":
    main()
