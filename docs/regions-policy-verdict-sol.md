# Regions Step A display-policy verdict

## Verdict

**Sean's MapTap-like direction is better for this game, with one precise rule rather than copying MapTap's Canadian exceptions:**

- For the **United States**, display every usable state-level assignment as `City, State` plus the existing US flag. The state replaces `United States`; do not append both.
- For **England, Scotland, Wales, and Northern Ireland**, keep the current `City, Nation` clues. Those nations are already game answer units, so Step A adds no smaller region and no new information.
- For **Canada and every other country**, keep `City, Country`. Do not introduce a subjective “ambiguous or remote” exception list.
- Preserve all piloted region IDs, reviewed names, centres, assignments, and the 126 same-name identities internally for future features and Step B.
- Preserve the three existing non-US region-bearing clues as existing content: Denpasar/Bali, Kochi/Kerala, and St. John's/Newfoundland. Existing territory-unit treatment also remains intact. Normalizing a name is not grounds to re-score it.
- Re-score only the **45 US entries that newly gain a displayed state**. The 17 US entries already showing a state keep their ratings. The other **288** of the pilot's 333 proposed re-scores do not happen.

This is not an endorsement of all of MapTap's inconsistencies. It adopts the part that fits this game: US states are a familiar location frame for the intended audience, while country remains the stable frame elsewhere.

The checked-in `step-a-changes.json` is the count authority. It says 333 `gains-clue`/`rescored` entries and 126 `same-name` entries. The plan prose still says 334 and 125 in several places; those prose figures are stale by one and should not drive implementation.

## 1. Gameplay: teaching versus fairness

The pilot is the stronger **regional-geography lesson**. It supplies information that can radically improve a plausible fallback tap:

| Clue added by pilot | Country fallback | Region fallback | Tentative level |
|---|---:|---:|---:|
| Leh, Ladakh, India | 1,460 km | 50 km | 9 → 5 |
| Perth, Western Australia, Australia | 2,724 km | 8 km | 6 → 4 |
| Ürümqi, Xinjiang, China | 2,636 km | 336 km | 9 → 6 |
| Vladivostok, Primorye, Russia | 5,632 km | 59 km | 9 → 7 |
| Ushuaia, Tierra del Fuego, Argentina | 2,483 km | 57 km | 9 → 7 |

Those are genuine gains. If the product goal were “teach first-level administrative geography,” the pilot would win.

But this game's clue contract is primarily city plus answer country on a borderless globe. Naming a country is enough to make the spatial task fair: the player knows which national outline contains the answer and must decide where inside it to tap. Adding Ladakh, Xinjiang, Primorye, or Tierra del Fuego does not merely clarify the same challenge; it often answers much of the within-country challenge. The dry run confirms that effect: among the 328 scorable new-region entries in the plan, 225 change level and some fall by as many as six levels.

US states are different for a US-first audience. They are commonly used as the primary location frame, and a bare US country clue is unusually weak because the country is continental in scale. The measured US cases show the same fairness gain in a vocabulary this audience can reasonably be expected to know:

| US clue | Country fallback | State fallback | Tentative level |
|---|---:|---:|---:|
| Honolulu, Hawaii | 6,357 km | 10 km | 8 → 2 |
| Seattle, Washington | 2,514 km | 66 km | 3 → 1 |
| San Francisco, California | 2,514 km | 405 km | 3 → 1 |
| Utqiagvik, Alaska | 5,015 km | 1,147 km | 9 → 7 |

The MapTap-like policy therefore plays fairer **for this audience and this game's established level of geographic vocabulary**. It teaches US state geography during play and can teach other regions at reveal time, without requiring recognition of hundreds of unevenly familiar administrative names before the guess.

The pilot also has weak cases despite its country-level 200 km gate. `Antananarivo, Analamanga` changes fallback from 7 km to 4 km; `Beira, Sofala` changes 57 km to 22 km; neither changes difficulty. `Abuja, FCT` improves the numerical fallback from 220 km to 1 km but also leaves level 4 unchanged. These additions lengthen clues and introduce administrative vocabulary without reliably improving the decision a player makes.

## 2. Substitute or append in the US and UK

For US clues, substitution reads better: **`Austin, Texas 🇺🇸`**, not **`Austin, Texas, United States 🇺🇸`**. “Texas” already supplies the conventional US frame, and the flag preserves immediate country recognition. Repeating the country makes a compact clue read like a database hierarchy.

Across the 62 usable US region clues in the artifact:

| Format | Mean clue length | Maximum |
|---|---:|---:|
| Current mixed clues | 29.3 characters | 42 |
| Appended `City, State, United States 🇺🇸` | 37.2 | 56 |
| Substituted `City, State 🇺🇸` | 22.2 | 41 |

Substitution removes 15 characters on average versus append and is even shorter than the current mixed set. That matters on clue cards, where the place name is the operative prompt. On results and passport surfaces, the structured data can still render a fuller hierarchy if that surface genuinely needs it; clue text should not be used as the data model.

The UK needs no new substitution rule. The game already treats England, Scotland, Wales, and Northern Ireland as top-level answer units and displays clues such as `Aberdeen, Scotland`. That already matches the readable MapTap convention. Appending `United Kingdom` would be redundant, longer, and—more importantly—would blur the game's actual answer-unit semantics.

Canada should remain `City, Canada` in Step A. MapTap's mixture of country, province, and three-part clues is descriptive evidence, not a learnable policy. “Ambiguous or remote” cannot be applied deterministically without editorial judgment, and displaying every province would quietly expand this recommendation from a US convention into the pilot's broader regional game.

## 3. Difficulty integrity and exact re-score set

The rule must be strict: **only newly displayed information can change a rating**.

Under this verdict, exactly **45 entries re-score**. They are the artifact's entries satisfying:

```text
country == "United States" && status == "gains-clue"
```

Their IDs are:

```text
atlanta-usa, austin-usa, baltimore, barrow-alaska, beverly-hills,
boston-usa, charleston, charlotte, chicago, cincinnati, cleveland-usa,
dallas-usa, denver-usa, detroit-usa, honolulu-usa, houston-usa,
indianapolis, kansas-city, key-west, las-vegas-usa, los-angeles-usa,
louisville-usa, memphis-us, miami-usa, milwaukee, minneapolis-usa,
nashville-usa, new-orleans-usa, new-york-usa, omaha, orlando,
philadelphia-usa, phoenix-usa, pittsburgh, raleigh-usa, sacramento-usa,
salt-lake-city, san-antonio-usa, san-diego-usa, san-francisco-usa,
san-jose, santa-fe, savannah, seattle-usa, st-louis-usa
```

The 17 US entries already displaying a state do not re-score. Substituting away `United States` changes presentation but adds no information. Washington's pre-existing D.C. scoring omission remains a separate data correction, not a reason to include it in this batch.

The remaining **288 pilot re-scores** are discarded, not frozen under their simulated new levels: 18 Canadian entries and 270 entries elsewhere continue using their current country-clue ratings because their clues continue to display only the country. Region assignment or a future reveal outline cannot retroactively justify an easier pre-guess difficulty.

The three existing non-US region clues likewise keep their current ratings. Renaming `Newfoundland` to `Newfoundland and Labrador`, or appending a country solely for normalization, does not give the player new geographic information.

## 4. Step B consequences

Under the full pilot, a region outline naturally confirms the region named before the guess. It is internally consistent, but pedagogically repetitive: the clue says `Ladakh`, then the reveal traces Ladakh.

Under this verdict:

- US reveals may outline the named state inside the country. That is direct confirmation.
- Elsewhere, a region outline is **new reveal-time information**. That is a good teacher if it is unmistakably presented as an explanation after the answer, not as a second correct answer.

The reveal should retain the country's dominant outer border and add the correct region as a thinner internal stroke or faint fill. The result/passport copy should name it at the same moment—for example, `Ladakh · India`—so an unexplained internal polygon never appears. If Step B cannot add that label and visual hierarchy, it should show country-only outside the US rather than draw anonymous regional boundaries.

Keeping all assignments and referenced outlines is therefore worthwhile. Display restraint in Step A does not waste the pilot data; it moves the broader regional lesson to the moment when it cannot distort the guess or its rating.

## 5. Consistency and learnability

The pilot has the cleaner algorithm: region appears whenever the 200 km country-dispersion gate says it may help. That sounds principled in a design document, but players never see the dispersion metric. They see regions on some countries, missing regions on 125 same-name cases, missing regions on compact countries, and four unresolved assignments. The visible convention is not actually “every clue has a region.” It is “sometimes there is a middle token for reasons outside the player's view.”

The recommended display rule is easier to learn:

> US clues use state; all other clues use the game's answer country/nation.

That is country-specific, but it is a single familiar exception rather than 59 gated country conventions. The US flag prevents `Georgia` or `Washington` from becoming ambiguous. Existing Bali/Kerala/Newfoundland clues are legacy exceptions, not a template for new additions; they can be reviewed separately if absolute textual uniformity is desired.

## 6. Strongest case for the pilot—and why it does not win

The best argument for the pilot is Leh: `India` leaves a reasonable non-expert 1,460 km away, while `Ladakh` can bring a region-knower within 50 km. Suppressing that information seems to preserve ignorance, and using an objective 200 km gate avoids US exceptionalism.

That argument is compelling only if first-level region recognition is part of the question. In the present game, it is not consistently part of the question: the core prompt supplies a country, the map is borderless, and difficulty has been calibrated around locating a city within that country. Adding regions to 333 clues changes both the knowledge tested and 225 provisional levels, while adding substantial text to the busiest surfaces. A mathematically objective gate does not make that scope change invisible.

Sean's approach wins because it preserves the game's existing question almost everywhere, fixes the one audience-specific location convention with strong precedent, and still uses the richer dataset to teach at reveal time. The implementation target is therefore **62 state-bearing US clues in total, 45 newly informative US clues re-scored, 17 existing state clues unchanged, and zero new region-driven re-scores outside the US**.
