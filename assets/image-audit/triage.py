#!/usr/bin/env python3
"""
Triage every location in assets/locations.json for image correctness.

For each of the 2000 locations this script produces one row in triage.json:

  1. file_title / ext / width_hint      - parsed out of the stored image URL
  2. dup_group_size / dup_countries     - images reused across entries
                                          (grouped by canonical file identity,
                                          i.e. wiki project + normalised file
                                          title, so a 500px thumb and the
                                          original upload count as one image)
  3. Commons API                        - 50 titles per request, polite
                                          User-Agent, max 1 request/second.
                                          Gives image coordinates, categories
                                          and ImageDescription; geo_km is the
                                          haversine distance between the image
                                          coordinates and the location's
                                          lat/lng.
  4. Wikidata                           - wbsearchentities on the location
                                          name, then claims for P31 (type),
                                          P17 (country), P625 (coords),
                                          P18 (image). The candidate entity is
                                          the one whose country matches and
                                          whose coordinates are inside the type
                                          tolerance.
  5. name_in_file                       - do the location's name tokens appear
                                          in the file title / description
                                          (diacritics folded away)?

Duplicate owners: in every group of 2+ rows sharing one image, the owner is
picked by evidence tier (file == P18 of a country+coords/coords QID > name in
file title > file in the location's Commons category > file == P18 of a weak
QID), with the nearest image geotag as tie-break. Every other row in the group
is a non-owner, whatever its country.

Auto-classification (FAIL > SOFT-FAIL > PASS, everything else is UNSURE):

  FAIL-auto  geo_km > tolerance*3 (unless the name is in the file title, then
             UNSURE), ext in (gif, svg), categories that look like a
             map/logo/flag/diagram, or a non-owner row in a duplicate group.
  SOFT-FAIL  duplicate group of 3+ with no decidable owner.
  PASS-auto  file title == the P18 of a strongly selected QID
             (country+coords or coords; weak country-only/nearest QIDs stay
             UNSURE), or (geo_km <= tolerance and the name matches the
             file/description), or the file sits in the location's own Commons
             category (P373, else a derived variant).

Type tolerances (km): city 15, neighborhood 5, mountain 30, landmark 3,
natural feature 25. The effective tolerance is max(type tolerance, extentKm).

The run aborts (exit 2, no output written) if fewer than 90% of the Commons
files found come back with categories: that means the fetch is broken.

Everything is cached on disk next to this script, so an interrupted run can be
restarted and only fetches what is missing. Progress goes to stderr; stdout
carries a single JSON summary.
"""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import math
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

# --------------------------------------------------------------------------
# Locations / paths
# --------------------------------------------------------------------------

HERE = Path(__file__).resolve().parent
LOCATIONS_JSON = Path.home() / "workspace/map-game/demo/assets/locations.json"
DEFAULT_OUT = HERE / "triage.json"
CACHE_DIR = HERE / "cache"

# Identify ourselves to Wikimedia; they ask for a descriptive User-Agent.
USER_AGENT = "MapGameImageAudit/1.0 (image QA for the map-game demo; local script)"

# Batching / politeness.
COMMONS_TITLES_PER_REQUEST = 50
COMMONS_MIN_INTERVAL = 1.0  # seconds between Commons requests (spec: max 1 req/s)
WIKIDATA_IDS_PER_REQUEST = 50
WIKIDATA_MIN_INTERVAL = 0.2  # seconds between Wikidata requests (5/s, still polite)

HTTP_RETRIES = 4

# Type tolerances in kilometres.
TOLERANCES = {
    "city": 15.0,
    "neighborhood": 5.0,
    "mountain": 30.0,
    "landmark": 3.0,
    "natural feature": 25.0,
}
DEFAULT_TYPE = "city"
EXTENSIONS_TO_FAIL = {"gif", "svg"}

# Categories that mean the image is a graphic rather than a photo.
BAD_CATEGORY_RULES = {
    "map": re.compile(r"\b(map|maps|mapping|cartograph\w*|locator map)\b"),
    "logo": re.compile(r"\b(logo|logos|wordmark|branding)\b"),
    "flag": re.compile(r"\b(flag|flags|ensign|coat of arms|emblem|crest)\b"),
    "diagram": re.compile(
        r"\b(diagram|diagrams|chart|charts|schematic|blueprint|infographic|"
        r"cross-section|graph of)\b"
    ),
}

# Words that carry no signal when matching a location name against a file.
NAME_STOPWORDS = {
    "the", "and", "for", "from", "with", "that", "this", "into", "over",
    "san", "santa", "saint", "st", "saints", "von", "van", "der", "den",
    "del", "de", "del", "la", "las", "les", "le", "el", "al", "da", "do",
    "y", "et", "bin", "ibn",
}

# How far a Wikidata candidate may sit from the location before it stops being
# a plausible match while we are still choosing between candidates. The final
# geo verdict always uses the *type* tolerance.
SELECTION_DEFAULT_TOLERANCE = TOLERANCES[DEFAULT_TYPE]

# Wikidata P31 label -> our type buckets, checked in order.
BUCKET_RULES = [
    ("city", re.compile(
        r"\b(city|town|capital|municipality|village|commune|metropolis|"
        r"urban agglomeration|human settlement|populated place)\b")),
    ("neighborhood", re.compile(
        r"\b(neighborhood|neighbourhood|quarter|suburb|borough|district|"
        r"ward|precinct|locality)\b")),
    ("mountain", re.compile(
        r"\b(mountain|mountains|volcano|massif|summit|peak|ridge|hill)\b")),
    # Natural feature before landmark so "national park" is not read as a
    # landmark just because it contains the word "park".
    ("natural feature", re.compile(
        r"\b(national park|nature reserve|forest|desert|island|islands|"
        r"beach|lagoon|bay|lake|river|waterfall|falls|glacier|canyon|gorge|"
        r"reef|cove|valley|coast|cliff|cliffs|cave|delta|swamp|peninsula|"
        r"strait|gulf|plateau|cape|terraces|geyser|dune|sea|ocean|park|"
        r"reserve|wilderness|wetland)\b")),
    ("landmark", re.compile(
        r"\b(building|bridge|tower|palace|castle|temple|cathedral|mosque|"
        r"church|monument|statue|stadium|square|garden|museum|ruins|fort|"
        r"fortress|aqueduct|lighthouse|theatre|theater|hall|market|airport|"
        r"station|university|library|cemetery|observatory|arena|pyramid|"
        r"shrine|pagoda|gate|arch|temple complex)\b")),
]

# Heuristic type detection when Wikidata gives no usable P31.
HEURISTIC_RULES = [
    ("neighborhood", re.compile(
        r"\b(neighborhood|neighbourhood|suburb|borough|precinct|barrio|"
        r"favela|kowloon|old town|ward)\b")),
    ("mountain", re.compile(
        r"\b(mountain|volcano|massif|summit|peak|ridge|everest|denali|"
        r"fuji|kilimanjaro)\b")),
    ("natural feature", re.compile(
        r"\b(national park|nature reserve|forest|desert|island|beach|lagoon|"
        r"bay|lake|river|waterfall|glacier|canyon|gorge|reef|cove|valley|"
        r"coast|cliff|cave|delta|swamp|peninsula|strait|gulf|plateau|cape|"
        r"terraces|geyser|dune|ocean|wetland)\b")),
    ("landmark", re.compile(
        r"\b(cathedral|mosque|temple|palace|castle|bridge|tower|museum|"
        r"monument|ruins|fort|fortress|stadium|plaza|statue|shrine|pagoda|"
        r"airport|university|parliament|capitol|aqueduct|colosseum|lighthouse|"
        r"theatre|arena|gate|citadel|bazaar)\b")),
]


# --------------------------------------------------------------------------
# Small helpers
# --------------------------------------------------------------------------

def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance between two points, in kilometres."""
    r = 6371.0088  # mean Earth radius
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


def fold(text: str) -> str:
    """Lowercase, strip diacritics, collapse punctuation to single spaces."""
    text = unicodedata.normalize("NFKD", str(text))
    text = "".join(ch for ch in text if not unicodedata.combining(ch))
    text = text.casefold()
    text = re.sub(r"[^0-9a-z]+", " ", text)
    return " ".join(text.split())


def significant_tokens(name: str) -> list[str]:
    """Name tokens worth matching: >=3 chars, stopwords dropped."""
    return [
        t for t in fold(name).split()
        if len(t) >= 3 and t not in NAME_STOPWORDS
    ]


def norm_media(title: str) -> str:
    """Normalise a media file name for comparison (spacing, case, quoting)."""
    title = urllib.parse.unquote(str(title))
    title = title.replace("_", " ")
    return " ".join(title.split()).casefold()


def norm_category(title: str) -> str:
    """Normalise a Commons category title for comparison."""
    title = urllib.parse.unquote(str(title))
    title = re.sub(r"^category:", "", title, flags=re.I)
    title = title.replace("_", " ")
    return " ".join(title.split()).casefold()


def strip_html(value: str) -> str:
    """Turn wikitext/HTML fragments into plain, whitespace-collapsed text."""
    value = re.sub(r"<[^>]+>", " ", str(value))
    value = html.unescape(value)
    return " ".join(value.split())


def chunked(items: list, size: int):
    for i in range(0, len(items), size):
        yield items[i:i + size]


def log(msg: str) -> None:
    """Progress goes to stderr so stdout can stay pure JSON."""
    print(msg, file=sys.stderr, flush=True)


# --------------------------------------------------------------------------
# Disk cache + rate-limited HTTP
# --------------------------------------------------------------------------

class DiskCache:
    """JSON blob cache keyed by a request string; writes are atomic."""

    def __init__(self, namespace: str):
        self.dir = CACHE_DIR / namespace
        self.dir.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        digest = hashlib.sha1(key.encode("utf-8")).hexdigest()
        return self.dir / f"{digest}.json"

    def get(self, key: str):
        path = self._path(key)
        if not path.exists():
            return None
        try:
            with path.open("r", encoding="utf-8") as fh:
                blob = json.load(fh)
            return blob["value"]
        except Exception:
            return None

    def put(self, key: str, value) -> None:
        path = self._path(key)
        tmp = path.with_suffix(".json.tmp")
        with tmp.open("w", encoding="utf-8") as fh:
            json.dump({"key": key, "value": value}, fh, ensure_ascii=False)
        tmp.replace(path)  # atomic: readers never see a half-written file


class Limiter:
    """Enforces a minimum interval between requests to one host."""

    def __init__(self, min_interval: float):
        self.min_interval = min_interval
        self._last = 0.0

    def wait(self) -> None:
        remaining = self._last + self.min_interval - time.monotonic()
        if remaining > 0:
            time.sleep(remaining)
        self._last = time.monotonic()


class ApiError(RuntimeError):
    """Raised when a request keeps failing after all retries."""


class Wikimedia:
    """Small JSON API client: rate limited, retried, polite."""

    def __init__(self):
        self.limiters = {
            "commons.wikimedia.org": Limiter(COMMONS_MIN_INTERVAL),
            "en.wikipedia.org": Limiter(COMMONS_MIN_INTERVAL),
            "www.wikidata.org": Limiter(WIKIDATA_MIN_INTERVAL),
        }
        self.request_count = 0

    def _limiter(self, host: str) -> Limiter:
        if host not in self.limiters:  # unknown host, stay polite anyway
            self.limiters[host] = Limiter(COMMONS_MIN_INTERVAL)
        return self.limiters[host]

    def get(self, host: str, params: dict) -> dict | None:
        url = f"https://{host}/w/api.php?" + urllib.parse.urlencode(params)
        self._limiter(host).wait()
        last_error = None
        for attempt in range(HTTP_RETRIES + 1):
            self.request_count += 1
            req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            try:
                with urllib.request.urlopen(req, timeout=40) as resp:
                    return json.loads(resp.read().decode("utf-8"))
            except urllib.error.HTTPError as exc:
                last_error = f"HTTP {exc.code}"
                # 429/5xx are transient; back off and try again.
                if exc.code not in (429, 500, 502, 503, 504) or attempt >= HTTP_RETRIES:
                    log(f"  ! {host} {last_error} for {params.get('action')}")
                    return None
                retry_after = exc.headers.get("Retry-After")
                delay = float(retry_after) if retry_after and retry_after.isdigit() \
                    else 2 ** attempt
            except Exception as exc:  # network hiccup, timeouts
                last_error = f"{type(exc).__name__}: {exc}"
                if attempt >= HTTP_RETRIES:
                    log(f"  ! {host} {last_error}")
                    return None
                delay = 2 ** attempt
            time.sleep(delay)
        log(f"  ! {host} giving up: {last_error}")
        return None


# --------------------------------------------------------------------------
# 1. Image URL parsing
# --------------------------------------------------------------------------

def parse_image_url(url: str) -> dict:
    """
    Pull file_title / ext / width_hint out of the stored image URL.

    Handles the four shapes found in locations.json:
      thumb.wikimedia.org/wikipedia/commons/thumb/a/ab/Name.jpg/500px-Name.jpg
      thumb.wikimedia.org/wikipedia/en/thumb/...            (non-Commons file)
      upload.wikimedia.org/wikipedia/commons/a/ab/Name.jpg  (original file)
      commons.wikimedia.org/wiki/Special:Redirect|FilePath/Name.jpg
    """
    parsed = urllib.parse.urlparse(url)
    path = urllib.parse.unquote(parsed.path)
    segments = [s for s in path.split("/") if s]
    tail = segments[-1] if segments else ""

    # Which wiki hosts the file? Only Commons files can be queried on Commons.
    project = "commons"
    if "/wikipedia/en/" in path or parsed.netloc == "en.wikipedia.org":
        project = "enwiki"

    file_title = None
    width_hint = None

    if "thumb" in segments:
        # <hash dirs>/Name.jpg/500px-Name.jpg  -> the real name is second-to-last
        file_title = segments[-2] if len(segments) >= 2 else tail
    elif segments[:2] == ["wiki", "Special:Redirect"] or (
        len(segments) >= 2 and segments[0] == "wiki"
        and segments[1].lower().startswith("special:")
    ):
        file_title = segments[-1]
    elif segments and segments[0] == "wiki":
        # /wiki/File:Name.jpg
        file_title = re.sub(r"^(File|Image):", "", segments[-1], flags=re.I)
    else:
        file_title = tail

    # Width: thumb path prefix, or ?width= on Special:FilePath.
    m = re.search(r"/(\d+)px-", path)
    if m:
        width_hint = int(m.group(1))
    else:
        query = urllib.parse.parse_qs(parsed.query)
        if "width" in query and query["width"] and query["width"][0].isdigit():
            width_hint = int(query["width"][0])

    file_title = urllib.parse.unquote(file_title or "")
    ext_match = re.search(r"\.([A-Za-z0-9]{1,5})$", file_title)
    ext = ext_match.group(1).lower() if ext_match else ""

    return {
        "file_title": file_title,
        "commons_title": f"File:{file_title}" if file_title else "",
        "ext": ext,
        "width_hint": width_hint,
        "project": project,
        "thumb": "thumb" in segments,
        "source_url": url,
    }


def dup_key(parsed: dict) -> str:
    """
    Identity used for duplicate detection: wiki project + normalised file name.

    Grouping on the raw URL would split one image into several groups (500px
    thumb, 1280px thumb and original upload are three different URLs for the
    same file), so we group on the file identity instead.
    """
    return f"{parsed['project']}:{norm_media(parsed['file_title'])}"


# --------------------------------------------------------------------------
# 2. Duplicate groups
# --------------------------------------------------------------------------

def build_dup_groups(locations: list[dict], parsed_by_id: dict) -> dict:
    """Map dup key -> {size, countries: [...], counts: {country: n}}."""
    groups: dict[str, dict] = {}
    for loc in locations:
        key = dup_key(parsed_by_id[loc["id"]])
        group = groups.setdefault(key, {"size": 0, "counts": {}})
        group["size"] += 1
        country = loc.get("country") or "?"
        group["counts"][country] = group["counts"].get(country, 0) + 1
    return groups


# --------------------------------------------------------------------------
# 3. Commons API
# --------------------------------------------------------------------------

def fetch_commons_files(api: Wikimedia, titles: list[str], host: str = "commons.wikimedia.org") -> dict:
    """
    Query `prop=coordinates|categories|imageinfo` for up to 50 titles per
    request, following continuation so no file loses its categories.

    Returns {normalised media title: {...}} for every title requested.
    """
    # v2: v1 cached results from the overwrite bug (continuation pages
    # clobbered the full page object), so they must never be reused.
    cache = DiskCache(f"commons-v2-{host}")
    results: dict[str, dict] = {}

    for batch in chunked(titles, COMMONS_TITLES_PER_REQUEST):
        key = host + "|" + "|".join(sorted(batch))
        cached = cache.get(key)
        if cached is not None:
            results.update(cached)
            continue

        params = {
            "action": "query",
            "format": "json",
            "formatversion": "2",
            "prop": "coordinates|categories|imageinfo",
            "iiprop": "extmetadata|size",
            "cllimit": "max",
            "colimit": "max",
            "titles": "|".join(batch),
            "redirects": "1",
        }
        pages: list[dict] = []
        normalized: dict[str, str] = {}
        redirects: dict[str, str] = {}
        while True:
            data = api.get(host, params)
            if data is None:
                return None  # network failure: caller marks rows as errored
            query = data.get("query", {})
            pages.extend(query.get("pages", []))
            for item in query.get("normalized", []):
                normalized[item["from"]] = item["to"]
            for item in query.get("redirects", []):
                redirects[item["from"]] = item["to"]
            cont = data.get("continue")
            if not cont:
                break
            params.update(cont)

        # Continuation responses repeat each page object carrying only the
        # props that were continued, so merge per API title instead of
        # overwriting: union categories, keep the first non-null coords and
        # the first non-empty description / object name.
        merged: dict[str, dict] = {}
        for page in pages:
            api_title = page.get("title", "")
            info = merged.setdefault(norm_media(api_title), {
                "found": True,
                "api_title": api_title,
                "lat": None,
                "lon": None,
                "categories": [],
                "description": "",
                "object_name": "",
                "host": host,
            })
            if page.get("missing", False):
                info["found"] = False
            coords = page.get("coordinates") or []
            if coords and info["lat"] is None:
                info["lat"] = coords[0].get("lat")
                info["lon"] = coords[0].get("lon")
            for c in page.get("categories", []) or []:
                cat = c.get("title", "")
                if cat and cat not in info["categories"]:
                    info["categories"].append(cat)
            for image in page.get("imageinfo") or []:
                meta = image.get("extmetadata") or {}
                if not info["description"] and "ImageDescription" in meta:
                    info["description"] = strip_html(
                        meta["ImageDescription"].get("value", "")
                    )[:2000]
                if not info["object_name"] and "ObjectName" in meta:
                    info["object_name"] = strip_html(
                        meta["ObjectName"].get("value", "")
                    )[:300]
                if info["lat"] is None and meta.get("GPSLatitude"):
                    try:
                        info["lat"] = float(meta["GPSLatitude"]["value"])
                        info["lon"] = float(meta["GPSLongitude"]["value"])
                    except Exception:
                        pass

        # Map each requested title forward (requested -> normalized ->
        # redirect target) onto the page the API returned. Going forward per
        # requested title also handles several titles redirecting to one file.
        batch_result: dict[str, dict] = {}
        for title in batch:
            target = normalized.get(title, title)
            for _ in range(5):  # follow (rare) redirect chains, loop-safe
                if target not in redirects:
                    break
                target = redirects[target]
            info = merged.get(norm_media(target))
            if info is not None:
                batch_result[norm_media(title)] = info

        # Make sure every requested title has a row, even ones the API dropped.
        for title in batch:
            batch_result.setdefault(norm_media(title), {
                "found": False, "api_title": None, "lat": None, "lon": None,
                "categories": [], "description": "", "object_name": "",
                "host": host,
            })
        cache.put(key, batch_result)
        results.update(batch_result)

    return results


# --------------------------------------------------------------------------
# 4. Wikidata
# --------------------------------------------------------------------------

def wd_search(api: Wikimedia, query: str, limit: int = 8) -> list[dict]:
    """wbsearchentities -> [{id, label, description}] (cached per query)."""
    cache = DiskCache("wd-search")
    cached = cache.get(query)
    if cached is not None:
        return cached
    data = api.get("www.wikidata.org", {
        "action": "wbsearchentities",
        "format": "json",
        "formatversion": "2",
        "language": "en",
        "type": "item",
        "uselang": "en",
        "limit": limit,
        "search": query,
    })
    hits = []
    for hit in (data or {}).get("search", []):
        hits.append({
            "id": hit.get("id"),
            "label": hit.get("label") or "",
            "description": hit.get("description") or "",
        })
    cache.put(query, hits)
    return hits


def wd_entities(api: Wikimedia, qids: list[str]) -> dict:
    """wbgetentities (claims only), 50 ids per request. {qid: entity}."""
    cache = DiskCache("wd-claims")
    out: dict[str, dict] = {}
    missing = []
    for qid in qids:
        cached = cache.get(qid)
        if cached is None:
            missing.append(qid)
        else:
            out[qid] = cached
    if not missing:
        return out

    for batch in chunked(sorted(set(missing)), WIKIDATA_IDS_PER_REQUEST):
        key = "|".join(batch)
        cached = cache.get(key)
        if cached is not None:
            out.update(cached)
            continue
        data = api.get("www.wikidata.org", {
            "action": "wbgetentities",
            "format": "json",
            "formatversion": "2",
            "ids": "|".join(batch),
            "props": "claims",
        })
        if data is None:
            continue  # retryable on a later run; cache stays empty
        entities = data.get("entities", {}) or {}
        chunk = {qid: ent for qid, ent in entities.items() if "missing" not in ent}
        cache.put(key, chunk)
        out.update(chunk)
        for qid in batch:
            if qid not in chunk:
                out.setdefault(qid, {"missing": True})
    return out


def wd_labels(api: Wikimedia, qids: list[str]) -> dict:
    """English labels for a set of QIDs, 50 per request. {qid: label}."""
    cache = DiskCache("wd-labels")
    out: dict[str, str] = {}
    missing = []
    for qid in qids:
        if not qid:
            continue
        cached = cache.get(qid)
        if cached is None:
            missing.append(qid)
        else:
            out[qid] = cached
    if not missing:
        return out

    for batch in chunked(sorted(set(missing)), WIKIDATA_IDS_PER_REQUEST):
        key = "|".join(batch)
        cached = cache.get(key)
        if cached is not None:
            out.update(cached)
            continue
        data = api.get("www.wikidata.org", {
            "action": "wbgetentities",
            "format": "json",
            "formatversion": "2",
            "ids": "|".join(batch),
            "props": "labels",
            "languages": "en",
        })
        if data is None:
            continue
        chunk = {
            qid: (ent.get("labels", {}).get("en", {}).get("value") or "")
            for qid, ent in (data.get("entities", {}) or {}).items()
        }
        cache.put(key, chunk)
        out.update(chunk)
    return out


def claim_values(entity: dict, prop: str) -> list:
    """All mainsnak values for a property (best-effort, skips snak failures)."""
    values = []
    for claim in (entity.get("claims") or {}).get(prop, []) or []:
        try:
            values.append(claim["mainsnak"]["datavalue"]["value"])
        except Exception:
            continue
    return values


def country_identity(api: Wikimedia, countries: list[str]) -> dict:
    """
    Resolve every location `country` string to Wikidata identities.

    Many locations sit in subdivisions whose P17 is a sovereign state
    (England -> United Kingdom, New Mexico -> United States), so we keep both
    the subdivision's own QID and its parent P17 QIDs as valid matches.
    Top 3 search hits are kept so an ambiguous name cannot poison matching.
    """
    identity: dict[str, dict] = {}
    all_qids: list[str] = []
    per_country_hits: dict[str, list[dict]] = {}
    for country in countries:
        hits = wd_search(api, country, limit=3)
        per_country_hits[country] = hits
        all_qids.extend(h["id"] for h in hits if h.get("id"))

    entities = wd_entities(api, sorted(set(all_qids)))
    parent_ids: set[str] = set()
    for country, hits in per_country_hits.items():
        qids = {h["id"] for h in hits if h.get("id")}
        parents = set()
        for qid in qids:
            parents.update(v["id"] for v in claim_values(entities.get(qid, {}), "P17"))
        identity[country] = {
            "qids": sorted(qids),
            "parents": sorted(parents),
            "labels": {h["label"] for h in hits if h.get("label")},
        }
        parent_ids.update(parents)
    if parent_ids:
        wd_labels(api, sorted(parent_ids))
    return identity


def country_matches(loc_country: str, cand_p17: list[str], identity: dict,
                    labels: dict[str, str]) -> bool:
    """Does the candidate's P17 sit in this location's country identity set?"""
    loc_country_norm = fold(loc_country)
    if not loc_country_norm:
        return False
    info = identity.get(loc_country) or {}
    valid_qids = set(info.get("qids", [])) | set(info.get("parents", []))
    if valid_qids and set(cand_p17) & valid_qids:
        return True
    # Label fallback: "United States" vs "United States of America", etc.
    for qid in cand_p17:
        label = fold(labels.get(qid, ""))
        if not label:
            continue
        if label == loc_country_norm or loc_country_norm in label or label in loc_country_norm:
            return True
    return False


def bucket_for_p31(p31_labels: list[str]) -> str | None:
    """Map Wikidata P31 labels onto our five type buckets."""
    for label in p31_labels:
        text = fold(label)
        for bucket, pattern in BUCKET_RULES:
            if pattern.search(text):
                return bucket
    return None


def heuristic_type(loc: dict) -> str:
    """
    Best-effort type when Wikidata gives nothing usable.

    The location has no `type` field, so we read the name, clue and fact.
    Falls back to 'city' (the most forgiving tolerance) rather than guessing a
    strict bucket and failing good images.
    """
    if loc.get("category") == "landmark":
        return "landmark"
    text = fold(f"{loc.get('short','')} {loc.get('clue','')} {loc.get('fact','')}")
    for bucket, pattern in HEURISTIC_RULES:
        if pattern.search(text):
            return bucket
    return DEFAULT_TYPE


def pick_candidate(cands: list[dict], tolerance_km: float) -> dict | None:
    """
    Choose the Wikidata entity for a location.

    Ranked: (country AND coords in tolerance) > coords in tolerance >
    country only > nearest. Ties break on distance.
    """
    ranked = []
    for cand in cands:
        dist = cand["dist_km"]
        in_tol = dist is not None and dist <= tolerance_km
        cm = cand["country_match"]
        if cm and in_tol:
            rank, selected_by = 0, "country+coords"
        elif in_tol:
            rank, selected_by = 1, "coords"
        elif cm:
            rank, selected_by = 2, "country"
        else:
            rank, selected_by = 3, "nearest"
        ranked.append((rank, dist if dist is not None else 1e9, selected_by, cand))
    if not ranked:
        return None
    ranked.sort(key=lambda item: (item[0], item[1]))
    best = ranked[0]
    best[3]["selected_by"] = best[2]
    return best[3]


# --------------------------------------------------------------------------
# 5. Name matching
# --------------------------------------------------------------------------

def name_match(tokens: list[str], text: str) -> tuple[bool, list[str]]:
    """Do all significant name tokens appear in `text`? Returns (ok, matched)."""
    if not tokens or not text:
        return False, []
    text_tokens = set(fold(text).split())
    matched = [t for t in tokens if t in text_tokens]
    return len(matched) == len(tokens), matched


# --------------------------------------------------------------------------
# Classification
# --------------------------------------------------------------------------

STRONG_QID_SELECTIONS = {"country+coords", "coords"}


def tolerance_for(type_bucket: str, extent_km) -> float:
    """Geo tolerance: max(type tolerance, the location's own extentKm)."""
    tol = TOLERANCES[type_bucket]
    try:
        extent = float(extent_km)
    except (TypeError, ValueError):
        extent = 0.0
    return max(tol, extent) if extent > 0 else tol


def is_geo_far(row: dict) -> bool:
    return row["geo_km"] is not None and row["geo_km"] > row["tolerance_km"] * 3


def strong_p18(row: dict) -> bool:
    return row["file_is_p18"] and row["wd_selected_by"] in STRONG_QID_SELECTIONS


# Owner evidence, strongest first. Each tier narrows the candidate set; a tier
# no row satisfies is skipped.
OWNER_TIERS = [
    ("p18_strong_qid", strong_p18),
    ("name_in_title", lambda r: r["name_in_title"]),
    ("in_location_category", lambda r: r["in_location_category"]),
    ("p18_weak_qid", lambda r: r["file_is_p18"]),
]


def pick_owner(group_rows: list[dict]) -> tuple[dict | None, list[str]]:
    """
    Decide which row in a duplicate group actually owns the image.

    Walk the evidence tiers, narrowing the candidates at each tier that some
    of them satisfy. If one row is left it is the owner; if several are left,
    the nearest to the image geotag wins (only when within its own geo_far
    threshold, and only when the nearest distance is unique). Returns
    (owner or None, evidence tiers the owner satisfied).
    """
    cands = list(group_rows)
    basis: list[str] = []
    for name, pred in OWNER_TIERS:
        subset = [r for r in cands if pred(r)]
        if subset:
            cands = subset
            basis.append(name)
            if len(cands) == 1:
                return cands[0], basis

    near = [r for r in cands if r["geo_km"] is not None and not is_geo_far(r)]
    if near:
        near.sort(key=lambda r: r["geo_km"])
        if len(near) == 1 or near[0]["geo_km"] < near[1]["geo_km"]:
            return near[0], basis + ["nearest_geotag"]
    return None, basis


def assign_dup_owners(rows: list[dict]) -> None:
    """Annotate every row with dup_owner_id / dup_owner_basis / dup_role."""
    by_group: dict[str, list[dict]] = {}
    for row in rows:
        by_group.setdefault(row["_dup_key"], []).append(row)
    for group_rows in by_group.values():
        if len(group_rows) < 2:
            for row in group_rows:
                row.update(dup_owner_id=None, dup_owner_basis=[], dup_role="unique")
            continue
        owner, basis = pick_owner(group_rows)
        for row in group_rows:
            row["dup_owner_id"] = owner["id"] if owner else None
            row["dup_owner_basis"] = basis if owner else []
            if owner is None:
                row["dup_role"] = "no_owner"
            elif row is owner:
                row["dup_role"] = "owner"
            else:
                row["dup_role"] = "non_owner"


def classify(row: dict) -> tuple[str, list[str]]:
    """
    Apply the FAIL-auto / SOFT-FAIL / PASS-auto rules; everything else is
    UNSURE.
    """
    reasons: list[str] = []

    # ---- FAIL-auto -------------------------------------------------------
    if row["commons_status"] == "error":
        return "UNSURE", ["commons_fetch_error"]

    tol = row["tolerance_km"]
    notes: list[str] = []

    if row["ext"] in EXTENSIONS_TO_FAIL:
        reasons.append(f"bad_extension:{row['ext']}")

    if is_geo_far(row):
        far = f"geo_far:{row['geo_km']:.1f}km>tol*{3}"
        # Big subjects are often photographed (and geotagged) from far away;
        # a name match in the title makes this a judgement call, not a FAIL.
        if row["name_in_title"]:
            notes.append(far + "_but_name_in_title")
        else:
            reasons.append(far)

    if row["categories_bad"]:
        reasons.append("bad_categories:" + ",".join(row["categories_bad"]))

    if row["dup_role"] == "non_owner":
        reasons.append(
            f"dup_non_owner:owner={row['dup_owner_id']}"
            f"({'+'.join(row['dup_owner_basis'])})"
            f",group={row['dup_group_size']}"
        )

    if reasons:
        return "FAIL-auto", reasons

    # ---- SOFT-FAIL: shared image, owner undecidable -----------------------
    # 3+ locations sharing one image means at least two of them are wrong,
    # whatever their countries.
    if row["dup_role"] == "no_owner" and row["dup_group_size"] >= 3:
        return "SOFT-FAIL", notes + [
            f"dup_no_owner:group={row['dup_group_size']}"
            f",countries={len(row['dup_countries'])}"
        ]

    # ---- PASS-auto -------------------------------------------------------
    if strong_p18(row):
        return "PASS-auto", ["file_is_qid_p18"]

    if row["geo_km"] is not None and row["geo_km"] <= tol and row["name_match"]:
        return "PASS-auto", [f"geo_within_{tol}km_and_name_in_file"]

    if row["in_location_category"]:
        return "PASS-auto", ["file_in_location_commons_category"]

    # A weak QID (country-only / nearest) makes "matches P18" meaningless.
    if row["file_is_p18"]:
        notes.append(f"file_is_p18_weak_qid:{row['wd_selected_by']}")

    if row["dup_role"] == "no_owner":
        notes.append(f"dup_no_owner:group={row['dup_group_size']}")

    return "UNSURE", notes


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(description="Triage location images.")
    parser.add_argument("--limit", type=int, default=0,
                        help="only process the first N locations (smoke test)")
    parser.add_argument("--out", type=str, default=str(DEFAULT_OUT))
    parser.add_argument("--refresh", action="store_true",
                        help="ignore the response cache (re-query everything)")
    args = parser.parse_args()

    if args.refresh and CACHE_DIR.exists():
        import shutil
        shutil.rmtree(CACHE_DIR)

    started = time.time()
    with LOCATIONS_JSON.open("r", encoding="utf-8") as fh:
        locations = json.load(fh)
    if args.limit:
        locations = locations[:args.limit]
    log(f"loaded {len(locations)} locations from {LOCATIONS_JSON}")

    api = Wikimedia()

    # ---- step 1: parse every image URL ---------------------------------
    parsed_by_id = {loc["id"]: parse_image_url(loc.get("image") or "")
                    for loc in locations}
    unparsed = [i for i, p in parsed_by_id.items() if not p["file_title"]]
    if unparsed:
        log(f"WARNING: could not parse {len(unparsed)} image URLs: {unparsed[:5]}")

    # ---- step 2: duplicate groups --------------------------------------
    dup_groups = build_dup_groups(locations, parsed_by_id)

    # ---- step 3: Commons metadata for every distinct file ---------------
    wanted: dict[str, list[str]] = {}   # norm media title -> [commons titles]
    host_for: dict[str, str] = {}
    for loc in locations:
        parsed = parsed_by_id[loc["id"]]
        if not parsed["file_title"]:
            continue
        # Key on the full "File:..." title so it always matches the key the
        # Commons fetcher produces (norm_media keeps the "File:" prefix).
        key = norm_media(parsed["commons_title"])
        wanted.setdefault(key, [])
        if parsed["commons_title"] not in wanted[key]:
            wanted[key].append(parsed["commons_title"])
        # Remember which wiki actually hosts the file (en.wikipedia keeps a
        # handful of non-free files locally).
        if parsed["project"] == "enwiki":
            host_for[key] = "en.wikipedia.org"

    log(f"querying Commons for {len(wanted)} distinct files "
        f"({math.ceil(len(wanted)/COMMONS_TITLES_PER_REQUEST)} requests at "
        f"{COMMONS_MIN_INTERVAL}s apart)")
    commons = fetch_commons_files(api, sorted(t for ts in wanted.values() for t in ts)) or {}

    # Non-Commons (en.wikipedia local) files: fall back to the English wiki API.
    enwiki_titles = sorted({
        t for key, host in host_for.items() if host == "en.wikipedia.org"
        for t in wanted.get(key, [])
    })
    if enwiki_titles:
        # Re-tag: those titles were requested against Commons and came back
        # missing, so ask en.wikipedia directly.
        log(f"falling back to en.wikipedia.org for {len(enwiki_titles)} files")
        enwiki = fetch_commons_files(api, enwiki_titles, host="en.wikipedia.org") or {}
        for key, info in enwiki.items():
            if info.get("found"):
                commons[key] = info

    # Sanity gate: every Commons file has categories, so a low hit rate means
    # the fetch is broken (the v1 overwrite bug gave 17/2000). Fail loudly
    # rather than write a triage built on missing metadata.
    found = [commons[k] for k in wanted if (commons.get(k) or {}).get("found")]
    with_cats = sum(1 for info in found if info.get("categories"))
    cat_ratio = with_cats / len(found) if found else 0.0
    log(f"categories present on {with_cats}/{len(found)} found files "
        f"({cat_ratio:.1%})")
    if cat_ratio < 0.90:
        log(f"FATAL: fewer than 90% of found files have categories "
            f"({with_cats}/{len(found)}); Commons fetch is broken, not writing "
            f"{args.out}")
        return 2

    # ---- step 4: Wikidata ------------------------------------------------
    countries = sorted({loc.get("country") or "" for loc in locations} - {""})
    log(f"resolving {len(countries)} country identities on Wikidata")
    identity = country_identity(api, countries)

    # Search every location name (cache makes reruns instant).
    log(f"searching Wikidata for {len(locations)} location names")
    search_hits: dict[str, list[dict]] = {}
    for i, loc in enumerate(locations, 1):
        name = loc.get("short") or loc.get("clue") or ""
        hits = wd_search(api, name, limit=8)
        if not hits:  # second attempt with the country appended
            hits = wd_search(api, f"{name} {loc.get('country','')}".strip(), limit=8)
        search_hits[loc["id"]] = hits
        if i % 250 == 0:
            log(f"  ...{i}/{len(locations)} names searched")

    # Fetch claims for every candidate we might select (50 ids per request).
    candidate_qids = sorted({h["id"] for hits in search_hits.values()
                             for h in hits if h.get("id")})
    log(f"fetching claims for {len(candidate_qids)} candidate QIDs")
    entities = wd_entities(api, candidate_qids)

    # Labels for P31/P17 lookups (countries already resolved above).
    ref_qids = set()
    for qid, ent in entities.items():
        ref_qids.update(v["id"] for v in claim_values(ent, "P31"))
        ref_qids.update(v["id"] for v in claim_values(ent, "P17"))
    for info in identity.values():
        ref_qids.update(info["qids"])
        ref_qids.update(info["parents"])
    log(f"fetching {len(ref_qids)} labels")
    labels = wd_labels(api, sorted(ref_qids))

    # ---- step 5 + classification: one row per location ------------------
    rows = []
    for i, loc in enumerate(locations, 1):
        parsed = parsed_by_id[loc["id"]]
        key = norm_media(parsed["commons_title"]) if parsed["file_title"] else ""
        info = commons.get(key) or {"found": False, "categories": [], "description": "",
                                    "lat": None, "lon": None, "object_name": ""}
        if key and info.get("host") == "en.wikipedia.org":
            commons_status = "ok" if info.get("found") else "missing"
        elif info.get("found"):
            commons_status = "ok"
        else:
            commons_status = "missing" if key else "no_file_url"

        # --- duplicates ---
        group = dup_groups[dup_key(parsed)]
        counts = group["counts"]
        top = max(counts.values()) if counts else 0
        cross_country = len(counts) > 1
        this_count = counts.get(loc.get("country") or "?", 0)
        minority = cross_country and this_count < top

        # --- geo ---
        geo_km = None
        if info.get("lat") is not None and info.get("lon") is not None:
            geo_km = haversine_km(info["lat"], info["lon"], loc["lat"], loc["lng"])

        # --- bad categories ---
        bad_categories = []
        for cat in info.get("categories", []):
            plain = fold(re.sub(r"^category:", "", cat, flags=re.I))
            for label, pattern in BAD_CATEGORY_RULES.items():
                if pattern.search(plain) and label not in bad_categories:
                    bad_categories.append(label)

        # --- name matching ---
        name = loc.get("short") or ""
        tokens = significant_tokens(name)
        in_title, matched_title = name_match(tokens, parsed["file_title"])
        in_desc, matched_desc = name_match(tokens, info.get("description", ""))
        name_ok = in_title or in_desc

        # --- Wikidata candidates ---
        type_h = heuristic_type(loc)
        tol_h = tolerance_for(type_h, loc.get("extentKm"))
        cands = []
        for hit in search_hits.get(loc["id"], []):
            ent = entities.get(hit["id"]) or {}
            if ent.get("missing"):
                continue
            p625 = (claim_values(ent, "P625") or [None])[0]
            dist = None
            if p625 and "latitude" in p625:
                dist = haversine_km(p625["latitude"], p625["longitude"],
                                    loc["lat"], loc["lng"])
            p17 = [v["id"] for v in claim_values(ent, "P17")]
            cands.append({
                "qid": hit["id"],
                "label": hit["label"],
                "description": hit["description"],
                "dist_km": round(dist, 2) if dist is not None else None,
                "country_match": country_matches(loc.get("country", ""), p17,
                                                 identity, labels),
            })
        best = pick_candidate(cands, tol_h)

        # --- entity facts ---
        wd_qid = wd_label = wd_p18 = wd_p373 = None
        wd_type_raw: list[str] = []
        wd_country = None
        wd_p625 = None
        wd_km = None
        wd_type = None
        selected_by = None
        if best:
            ent = entities.get(best["qid"]) or {}
            wd_qid = best["qid"]
            wd_label = best["label"]
            selected_by = best.get("selected_by")
            p31_qids = [v["id"] for v in claim_values(ent, "P31")]
            wd_type_raw = [labels.get(q, q) for q in p31_qids]
            wd_type = bucket_for_p31(wd_type_raw)
            p17_qids = [v["id"] for v in claim_values(ent, "P17")]
            wd_country = ", ".join(labels.get(q, q) for q in p17_qids) or None
            p625 = (claim_values(ent, "P625") or [None])[0]
            if p625 and "latitude" in p625:
                wd_p625 = [p625["latitude"], p625["longitude"]]
                wd_km = haversine_km(p625["latitude"], p625["longitude"],
                                     loc["lat"], loc["lng"])
            p18 = claim_values(ent, "P18")
            wd_p18 = p18[0] if p18 else None
            p373 = claim_values(ent, "P373")
            wd_p373 = p373[0] if p373 else None

        # Final type: Wikidata's P31 when it maps, else the heuristic.
        if wd_type:
            type_final, type_source = wd_type, "wikidata"
        else:
            type_final, type_source = type_h, "heuristic"
        tol = tolerance_for(type_final, loc.get("extentKm"))

        # --- PASS rule 1: file is the entity's P18 ---
        file_is_p18 = bool(wd_p18) and norm_media(wd_p18) == norm_media(parsed["file_title"])

        # --- PASS rule 3: file sits in the location's own Commons category ---
        wanted_categories = []
        if wd_p373:
            wanted_categories.append(wd_p373)
        base = fold(name)
        if base:
            wanted_categories += [name, f"{name}, {loc.get('country','')}",
                                  f"{name} ({loc.get('country','')})"]
        file_cats = {norm_category(c) for c in info.get("categories", [])}
        in_location_category = any(norm_category(c) in file_cats
                                   for c in wanted_categories if c)

        row = {
            "id": loc["id"],
            "short": loc.get("short"),
            "country": loc.get("country"),
            "lat": loc.get("lat"),
            "lng": loc.get("lng"),
            "category": loc.get("category"),
            "extent_km": loc.get("extentKm"),
            # 1. URL facts
            "image_url": loc.get("image"),
            "file_title": parsed["file_title"],
            "ext": parsed["ext"],
            "width_hint": parsed["width_hint"],
            "project": parsed["project"],
            # 2. duplicates
            "dup_group_size": group["size"],
            "dup_countries": sorted(counts),
            "dup_country_counts": counts,
            "dup_cross_country": cross_country,
            "dup_minority": minority,
            # 3. Commons
            "commons_status": commons_status,
            "image_lat": info.get("lat"),
            "image_lon": info.get("lon"),
            "geo_km": round(geo_km, 2) if geo_km is not None else None,
            "categories": info.get("categories", []),
            "categories_bad": bad_categories,
            "description": info.get("description", ""),
            # 4. Wikidata
            "wd_qid": wd_qid,
            "wd_label": wd_label,
            "wd_type": wd_type,
            "wd_type_raw": wd_type_raw,
            "wd_country": wd_country,
            "wd_p18": wd_p18,
            "wd_p625": wd_p625,
            "wd_km": round(wd_km, 2) if wd_km is not None else None,
            "wd_country_match": best["country_match"] if best else None,
            "wd_selected_by": selected_by,
            "wd_candidates": sorted(
                ({"qid": c["qid"], "label": c["label"], "dist_km": c["dist_km"],
                  "country_match": c["country_match"]} for c in cands),
                key=lambda c: (c["dist_km"] is None, c["dist_km"] or 0),
            )[:5],
            # 5. name matching
            "name_tokens": tokens,
            "name_matched_tokens": sorted(set(matched_title) | set(matched_desc)),
            "name_in_title": in_title,
            "name_in_desc": in_desc,
            "name_match": name_ok,
            # derived
            "type": type_final,
            "type_source": type_source,
            "type_heuristic": type_h,
            "tolerance_km": tol,
            "file_is_p18": file_is_p18,
            "in_location_category": in_location_category,
            "p373_category": wd_p373,
            "_dup_key": dup_key(parsed),
        }
        rows.append(row)

        if i % 250 == 0:
            log(f"  ...{i}/{len(locations)} triaged")

    # Duplicate owners need every row of a group, so classify afterwards.
    assign_dup_owners(rows)
    for row in rows:
        del row["_dup_key"]
        row["verdict"], row["reasons"] = classify(row)

    # ---- write output ---------------------------------------------------
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = out_path.with_suffix(".json.tmp")
    with tmp_path.open("w", encoding="utf-8") as fh:
        json.dump(rows, fh, indent=2, ensure_ascii=False)
    tmp_path.replace(out_path)  # atomic: never leave a half-written triage.json

    # ---- summary (stdout, JSON only) ------------------------------------
    verdicts: dict[str, int] = {}
    reason_counts: dict[str, int] = {}
    type_counts: dict[str, int] = {}
    for row in rows:
        verdicts[row["verdict"]] = verdicts.get(row["verdict"], 0) + 1
        type_counts[row["type"]] = type_counts.get(row["type"], 0) + 1
        for reason in row["reasons"]:
            head = reason.split(":")[0]
            reason_counts[head] = reason_counts.get(head, 0) + 1

    summary = {
        "out": str(out_path),
        "locations": len(rows),
        "distinct_files": len(wanted),
        "duplicate_groups": sum(1 for g in dup_groups.values() if g["size"] > 1),
        "dup_roles": {role: sum(1 for r in rows if r["dup_role"] == role)
                      for role in ("unique", "owner", "non_owner", "no_owner")},
        "categories_coverage": round(cat_ratio, 4),
        "verdicts": verdicts,
        "reasons": reason_counts,
        "types": type_counts,
        "commons_missing": sum(1 for r in rows if r["commons_status"] == "missing"),
        "no_geo": sum(1 for r in rows if r["geo_km"] is None),
        "wikidata_matched": sum(1 for r in rows if r["wd_qid"]),
        "requests": api.request_count,
        "elapsed_s": round(time.time() - started, 1),
    }
    print(json.dumps(summary, indent=2))
    log(f"wrote {out_path} in {summary['elapsed_s']}s "
        f"({summary['requests']} requests)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
