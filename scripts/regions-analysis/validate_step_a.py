#!/usr/bin/env python3
"""Strict reconciliation checks for step-a-changes.json."""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
d = json.loads((Path(__file__).with_name("step-a-changes.json")).read_text())
source = json.loads((ROOT / "assets/locations.json").read_text())
entries = d["entries"]
errors = []

ids = [e["id"] for e in entries]
if len(entries) != 754: errors.append(f"expected 754 entries, got {len(entries)}")
if len(ids) != len(set(ids)): errors.append("duplicate entry IDs")
if set(ids) != {x["id"] for x in source}: errors.append("entry IDs do not exactly match locations.json")
if d["missingPageviews"]: errors.append(f'{len(d["missingPageviews"])} missing pageview inputs')
if sum(d["counts"].get(k, 0) for k in ("already-region", "gains-clue", "not-applicable", "same-name", "territory-unit", "unmatched")) != 754:
    errors.append("status counts do not reconcile to 754")
for e in entries:
    if e["status"] in {"not-applicable", "territory-unit", "unmatched"} and e["region"] is not None:
        errors.append(f'{e["id"]}: out-of-scope entry gained a region')
    if e["status"] == "gains-clue" and e["rescore"] is None:
        errors.append(f'{e["id"]}: clue gain lacks a re-score')
    if e["status"] != "gains-clue" and e["rescore"] is not None:
        errors.append(f'{e["id"]}: out-of-scope re-score')
    if e["region"] and e["region"]["name"].casefold() == e["short"].casefold() and e["region"]["name"] in e["proposedClue"].split(", ")[1:-1]:
        errors.append(f'{e["id"]}: clue duplicates city as region')
for i in ("portland-oregon-usa", "denpasar-indonesia", "kochi-india", "st-johns-canada"):
    e = next(e for e in entries if e["id"] == i)
    if e["rescore"] is not None: errors.append(f"{i}: already-region entry was re-scored")

print(f"entries={len(entries)} unique={len(set(ids))} errors={len(errors)}")
for error in errors: print("ERROR", error)
sys.exit(bool(errors))
