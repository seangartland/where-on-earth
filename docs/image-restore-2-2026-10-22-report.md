# Image restore batch 2 report

Date: 2026-10-22

## Image swaps

- `suzhou-cn`
  - Old: `https://thumb.wikimedia.org/wikipedia/commons/thumb/6/62/Suzhou_from_Beisi_Pagoda.jpg/500px-Suzhou_from_Beisi_Pagoda.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail`
  - New: `https://live.staticflickr.com/4351/36920337360_25ac1ae55f_b.jpg`
- `xiamen-cn`
  - Old: `https://thumb.wikimedia.org/wikipedia/commons/thumb/5/51/Xiamen_night_cityscape_2018_-_Flickr_-_Jaykhuang.jpg/500px-Xiamen_night_cityscape_2018_-_Flickr_-_Jaykhuang.jpg?utm_source=commons.wikimedia.org&utm_campaign=imageinfo&utm_content=thumbnail`
  - New: `https://upload.wikimedia.org/wikipedia/commons/d/d7/Xiamen_china.jpg`

## Validation

- `assets/locations.json` parses successfully.
- The dataset still contains 804 entries.
- Each new image URL occurs exactly once across the dataset.
- A recursive comparison of the parsed JSON before and after the edit found exactly two changes: `suzhou-cn.image` and `xiamen-cn.image`. No other entry or field changed.
- The repository's existing `npm test` check ran. It exited with status 1 because `package.json` contains the default placeholder test command, which prints `Error: no test specified`. No implemented test suite is configured.

## Preflight

The orchestrator measured both new URLs on 2026-10-22 at about 17:10 PDT from the host shell. Both returned HTTP 200 with content type `image/jpeg` when requested with a browser user agent and a Referer header, matching player browser behavior. The Flickr URL returns HTTP 403 to bare bots by design, which is expected and is not a failure. No network check was attempted in the sandbox.

## Credits

- Suzhou: CC BY-SA 2.0, szeke on Flickr. Source photo: [Suzhou, China](https://www.flickr.com/photos/43355249@N00/36920337360).
- Xiamen: CC BY-SA 2.0, Andrew Lih, via [Wikimedia Commons](https://commons.wikimedia.org/w/index.php?curid=299150).

## Pilot context

These images are the last usable finds of the Openverse pilot. Four of 48 candidates passed vision QA: three Suzhou candidates and one Xiamen candidate. The orchestrator selected the Suzhou image above over the other two passing candidates for its square crop. The Xiamen image was the pilot's only passing candidate for that city. The other pilot locations remain quarantined without images. QA verdicts are stored in `~/workspace/map-game/openverse-pilot/qa-verdicts.json`.
