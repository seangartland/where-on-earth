#!/usr/bin/env python3
"""Apply and verify the adopted Regions Step A policy verdict."""

import argparse
import copy
import json
import re
import subprocess
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
LOCATIONS = ROOT / "assets" / "locations.json"
CHANGES = Path(__file__).with_name("step-a-changes.json")
HELD_IDS = {"iqaluit-nunavut", "pevek-russia", "nouakchott-mr", "hargeysa"}
US_COUNTRY = "United States"
US_FLAG = "🇺🇸"


def load(path):
    return json.loads(path.read_text())


def original_locations():
    raw = subprocess.run(
        ["git", "show", "HEAD:assets/locations.json"],
        cwd=ROOT,
        check=True,
        capture_output=True,
        text=True,
    ).stdout
    return json.loads(raw)


def index(entries, label):
    by_id = {entry["id"]: entry for entry in entries}
    if len(by_id) != len(entries):
        raise ValueError(f"duplicate IDs in {label}")
    return by_id


def production_region(change):
    return {
        "id": change["region"]["code"],
        "name": change["region"]["name"],
        "outline": change["region"]["code"],
    }


def is_state_bearing_us(change):
    return change["country"] == US_COUNTRY and change["region"] is not None


def is_newly_state_bearing_us(change):
    return is_state_bearing_us(change) and change["status"] == "gains-clue"


def verdict_clue(change):
    source = change["proposedClue"] if is_newly_state_bearing_us(change) else change["oldClue"]
    clue = source.replace(f", {US_COUNTRY} {US_FLAG}", f" {US_FLAG}")
    if clue == source:
        raise ValueError(f"cannot substitute US country in clue for {change['id']}")
    return clue


def expected_from(old, changes):
    if len(old) != 754 or len(changes) != 754:
        raise ValueError(f"expected 754 entries, got old={len(old)} changes={len(changes)}")

    change_by_id = index(changes, "changes file")
    old_by_id = index(old, "original locations")
    if set(change_by_id) != set(old_by_id):
        raise ValueError("changes-file IDs do not match original location IDs")

    result = []
    for entry in old:
        change = change_by_id[entry["id"]]
        if change["oldClue"] != entry["clue"]:
            raise ValueError(f"old clue mismatch for {entry['id']}")

        updated = copy.deepcopy(entry)
        if is_state_bearing_us(change):
            updated["clue"] = verdict_clue(change)
        if is_newly_state_bearing_us(change):
            if change["rescore"] is None:
                raise ValueError(f"missing US rescore for {entry['id']}")
            updated["difficulty"] = change["rescore"]["newLevel"]
        if change["region"] is not None:
            region = production_region(change)
            # Keep the structured identity adjacent to its country without
            # disturbing the relative order or values of existing fields.
            updated = {
                key: value
                for old_key, old_value in updated.items()
                for key, value in (
                    ((old_key, old_value), ("region", region))
                    if old_key == "country"
                    else ((old_key, old_value),)
                )
            }
        result.append(updated)
    return result


def verify(old, new, changes):
    old_by_id = index(old, "original locations")
    new_by_id = index(new, "new locations")
    change_by_id = index(changes, "changes file")
    errors = []

    if len(new) != 754:
        errors.append(f"entry count: expected 754, got {len(new)}")
    if [entry["id"] for entry in new] != [entry["id"] for entry in old]:
        errors.append("entry order or IDs changed")

    clue_diff_ids = {i for i in old_by_id if old_by_id[i]["clue"] != new_by_id[i]["clue"]}
    expected_clue_ids = {e["id"] for e in changes if is_state_bearing_us(e)}
    if clue_diff_ids != expected_clue_ids:
        errors.append("clue diff ID set does not match changes file")
    for entry_id in expected_clue_ids:
        expected_clue = verdict_clue(change_by_id[entry_id])
        if new_by_id[entry_id]["clue"] != expected_clue:
            errors.append(f"verdict clue mismatch for {entry_id}")
        if not re.fullmatch(r".+, .+ 🇺🇸", new_by_id[entry_id]["clue"]):
            errors.append(f"US state clue format mismatch for {entry_id}")
    if any(old_by_id[i]["country"] != US_COUNTRY for i in clue_diff_ids):
        errors.append("a non-US clue changed")

    difficulty_diff_ids = {
        i for i in old_by_id if old_by_id[i]["difficulty"] != new_by_id[i]["difficulty"]
    }
    rescore_ids = {e["id"] for e in changes if is_newly_state_bearing_us(e)}
    expected_difficulty_ids = {
        entry_id
        for entry_id in rescore_ids
        if old_by_id[entry_id]["difficulty"]
        != change_by_id[entry_id]["rescore"]["newLevel"]
    }
    if difficulty_diff_ids != expected_difficulty_ids:
        errors.append("difficulty diff ID set does not match rescore set")
    for entry_id in rescore_ids:
        if new_by_id[entry_id]["difficulty"] != change_by_id[entry_id]["rescore"]["newLevel"]:
            errors.append(f"new difficulty mismatch for {entry_id}")

    expected_region_ids = {e["id"] for e in changes if e["region"] is not None}
    actual_region_ids = {e["id"] for e in new if "region" in e}
    if actual_region_ids != expected_region_ids:
        errors.append("region field presence does not match changes file")
    for entry_id in expected_region_ids:
        if new_by_id[entry_id]["region"] != production_region(change_by_id[entry_id]):
            errors.append(f"region object mismatch for {entry_id}")

    for entry_id in HELD_IDS:
        if old_by_id[entry_id] != new_by_id[entry_id]:
            errors.append(f"held entry {entry_id} changed")

    allowed = {"clue", "difficulty", "region"}
    other_diffs = []
    for entry_id, old_entry in old_by_id.items():
        new_entry = new_by_id[entry_id]
        for field in set(old_entry) | set(new_entry):
            if field not in allowed and old_entry.get(field) != new_entry.get(field):
                other_diffs.append((entry_id, field))
    if other_diffs:
        errors.append(f"other field diffs: {other_diffs[:10]}")

    expected = expected_from(old, changes)
    unexpected_entry_diffs = [
        entry["id"] for entry, expected_entry in zip(new, expected) if entry != expected_entry
    ]
    if unexpected_entry_diffs:
        errors.append(f"entries differ from verdict output: {unexpected_entry_diffs[:10]}")

    distribution = Counter(entry["difficulty"] for entry in new)
    if set(distribution) - set(range(1, 11)):
        errors.append(f"difficulty outside levels 1-10: {dict(distribution)}")

    result = {
        "entries": len(new),
        "clueDiffs": len(clue_diff_ids),
        "usStateClues": len(expected_clue_ids),
        "usRescoresApplied": len(rescore_ids),
        "difficultyDiffs": len(difficulty_diff_ids),
        "regionFields": len(actual_region_ids),
        "heldEntriesUnchanged": not any("held entry" in error for error in errors),
        "otherFieldDiffs": len(other_diffs),
        "unexpectedEntryDiffs": len(unexpected_entry_diffs),
        "difficultyDistribution": {str(level): distribution[level] for level in range(1, 11)},
        "errors": errors,
    }
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify-only", action="store_true")
    args = parser.parse_args()

    old = original_locations()
    changes_doc = load(CHANGES)
    changes = changes_doc["entries"]

    if not args.verify_only:
        LOCATIONS.write_text(
            json.dumps(expected_from(old, changes), ensure_ascii=False, indent=2) + "\n"
        )

    result = verify(old, load(LOCATIONS), changes)
    print(json.dumps(result, indent=2))
    if result["errors"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
