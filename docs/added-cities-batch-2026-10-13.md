# Added cities batch: 2026-10-13 (batch 1: 25 cities + Vilnius/Riga)

Result: active dataset 754 → **779**. Preserved landmarks file 901 → 903.

Method: generation, image sourcing, v2 scoring and audits by Opus (claude-run,
--model opus) following `~/workspace/skills/where-on-earth-locations/SKILL.md`.
The first run died overnight mid-image-sourcing (VM replacement); a resume run
audited the surviving `.batch1/` staging and finished it. Orchestrator verified
independently before merging: dedupe by id and short name against both files,
25 km proximity against all active entries, image URL uniqueness against the
dataset, HEAD 200 on all 27 URLs, banned-phrase scan, codepoint check.

## The 27 cities (difficulty = v2 level from the frozen scorer)

| City | Country | Level | City | Country | Level |
|---|---|---|---|---|---|
| Antofagasta | Chile | 9 | Nantes | France | 6 |
| Arequipa | Peru | 8 | Santos | Brazil | 8 |
| Bari | Italy | 6 | Tartu | Estonia | 5 |
| Bologna | Italy | 3 | Timișoara | Romania | 6 |
| Catania | Italy | 7 | Trabzon | Turkey | 7 |
| Palermo | Italy | 6 | Uppsala | Sweden | 4 |
| Trieste | Italy | 5 | Aarhus | Denmark | 4 |
| Coventry | England | 3 | Guwahati | India | 8 |
| Leicester | England | 3 | Mysuru | India | 8 |
| Durrës | Albania | 1 (see flag) | Vilnius | Lithuania | 3 |
| Entebbe | Uganda | 9 | Riga | Latvia | 3 |
| Guanajuato | Mexico | 5 | Hanover | Germany | 4 |
| Cologne | Germany | 2 | Ipoh | Malaysia | 6 |
| Limassol | Cyprus | 4 | | | |

Notes:
- Mysuru: official name since 2014; Wikipedia fame measured on the "Mysore"
  article, which is the same city (redirect target Mysuru).
- Coventry and Leicester clues carry no flag emoji, matching every other
  UK-nation entry in the dataset (flags render from COUNTRY_FLAGS).
- Region stored on 18 of 27. The regions classify step left 9 unstored
  (Coventry, Leicester, Entebbe, Limassol, Tartu, Timișoara, Aarhus, Vilnius,
  Riga) under the same gates that left 275 of the existing 754 unstored
  (same-name region or country dispersion under the 200 km threshold).

## Old-town replacement (Sean's rule)

`vilnius-old-town-d34-15` and `riga-old-town-d34-14` moved from the active set
into `assets/locations-landmarks-sol.json` (preserved, not deleted), replaced
by the new Vilnius and Riga city entries 0.2 km and 0.4 km away. Verified:
zero active entries have "Old Town" in short or clue.

## Images (all Wikimedia Commons; all HEAD 200, unique, denylist-clean)

No-credit (PD/CC0), 20: Antofagasta (PD, Abel Maestro Garcia), Bari (CC0,
Bernard Gagnon), Bologna (PD), Catania (CC0, August Dominus), Palermo (CC0,
Bjs), Coventry (CC0, Si / mintchociecream), Leicester (CC0, DougPR), Guanajuato
(CC0, Carlos ZGZ), Hanover (PD, Axel Hindemith), Cologne (CC0, Rhetos), Ipoh
(CC0, Slleong), Limassol (PD, Tsiapinis), Tartu (CC0, LittleViewer), Timișoara
(PD, Ant83), Uppsala (PD, JimmiG), Aarhus (CC0, Smartdrones Aarhus), Mysuru
(CC0, Pradyumnakp), Durrës (CC0, Rakoon), Vilnius (PD, Umnik), Riga (CC0,
Rakoon).

Attribution required (CC BY / BY-SA), 7, recorded here per the skill:
- Arequipa: CC BY-SA 2.0, Panegyrics of Granovetter
- Trieste: CC BY 4.0, Giorgio Galeotti
- Entebbe: CC BY-SA 3.0, Niranjanoak
- Nantes: CC BY-SA 4.0, François de Dijon
- Santos: CC BY-SA 4.0, Mike Peel
- Trabzon: CC BY-SA 3.0, Erol Çakıroğlu
- Guwahati: CC BY-SA 4.0, Prof. Vikramjit Kakati

credits.html currently lists only base/detail imagery, not individual photos
(same as all prior batches). If Sean wants a photo-credits section, the 7 above
are the ones this batch adds to that backlog.

## Exceptions and flags

- **Durrës level 1 is spike-driven (kept, Sean's call available).** Its
  12-month mean pageviews are 4,052/day, but the median month is 331/day:
  two months drew ~928k and ~456k views against a typical ~10k/month
  (max/median 92.2). Scored with the same mean input the frozen pipeline
  used for the whole dataset, it lands at p.99 → level 1. A median-based
  input would put it around level 3. Not hand-adjusted; flagging per the
  suspicious-results rule.
- Weaker but rule-compliant photos: Mysuru (misty boulevard; the only
  no-credit city photo), Cologne (distant skyline behind a motorway),
  Timișoara (rooftops with satellite dishes).
- Filename quirks, both verified as the right city via Commons categories:
  Hanover's photo file is named for its Linden borough; Antofagasta's file
  title misspells the city ("Anofagasta", the Flickr original).
- Trabzon's fact says "metres above" (the Sumela Monastery cliff). Reviewed:
  descriptive, not an elevation data dump. Kept.
- No placeholders. Every city has a real photo of itself.
