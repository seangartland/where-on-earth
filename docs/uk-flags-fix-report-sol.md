# England, Scotland and Wales flag fix

## Outcome

England, Scotland and Wales now use the valid Unicode subdivision-flag tag
sequences in `COUNTRY_FLAGS`. Northern Ireland remains `🇬🇧`, and the
regional-indicator path for every other country is unchanged.

No visual screenshot was produced in this sandbox. Every visual statement below
is code-inspected.

## Root cause

The three literals looked like subdivision flags in the editor, but their tag
characters were in the wrong Unicode plane. For example, England contained
`U+1F3F4 U+D0067 U+D0062 U+D0065 U+D006E U+D0067 U+D007F`. The characters from
`U+D0000` through `U+D007F` are not Unicode tag characters. A text renderer
therefore received a black flag followed by six private-use characters, which
accounts for the black flag and placeholder boxes in the reported screenshot.

Valid tag characters are in plane 14 (`U+E0000` through `U+E007F`). The source
now spells each scalar explicitly with `\u{...}` escapes so the plane difference
is reviewable and cannot be hidden by invisible tag glyphs.

There was no destructive string round-trip in the DOM paths: the renderers pass
the value from `flagForLocation()` or `countryFlag()` to `textContent`,
`replaceChildren()`, or an HTML interpolation as one string. The sequence is not
split across elements. The standard inherited font stack was not the cause of
the placeholder grid: it was being given private-use characters instead of tag
characters.

The canvas share-image caption had a second, independent correctness problem.
Its width loop repeatedly used `name.slice(0, -2)` on the complete caption,
including the flag. A long caption could therefore delete tag scalars from the
end of a subdivision sequence before shortening the place name. The loop now
shortens an `Array.from()` copy of the place label and appends the complete flag
afterward. Canvas `fillText()` receives the same corrected, intact sequence used
by the DOM. The large no-photo flag does not transform the string and receives
the corrected value directly.

## Surface account

All visual results in this table are code-inspected, not screenshot-verified.

| Surface | Rendering path | Proven cause before | Fix / value after |
| --- | --- | --- | --- |
| Passport Countries cards | `buildCountryIndex()` -> `flagForLocation()` -> `row.flag` -> `.pp-ccard-flag.textContent` | The intact but malformed `U+D...` fallback literal reached the span. | The span receives the corrected `U+E...` sequence. |
| Passport slot faces (`.pps-flag`) | `passportSlotFace()` -> `flagForLocation()` -> `.pps-flag.textContent` | The no-photo placeholder received the malformed literal intact. | It receives the corrected sequence intact. |
| Passport place/postcard names | `passportSlotFace()` and `postcardSummaryCard()` append `flagForLocation()` to `textContent`. | The appended fallback was malformed at its source. | The appended value is the corrected sequence; no split or sanitizer exists. |
| Clue lines / Borders prompt | Normal location clues use `item.clue`; the current `assets/locations.json` contains no subdivision tag sequences. Borders uses `countryFlag()` in `replaceChildren()`. | The only generated England/Scotland/Wales flag on this path came from malformed `COUNTRY_FLAGS`. | Borders receives the corrected sequence as one text node. Existing clue text is unchanged. |
| Reveal, peek, recap and flyover postcard caption | Location labels use `item.clue` directly (`textContent`); Borders reveal appends `countryFlag()`. The flyover postcard caption also uses `item.clue`. | Current location clues contain no tag flag to corrupt; Borders' generated flag was malformed at the constant. | Location text behavior is unchanged; the Borders flag is corrected. |
| Results breakdown | `showResults()` -> `flagForLocation()` -> `place.textContent` | The malformed fallback was appended intact. | The corrected sequence is appended intact. |
| Country detail | `country.flag` -> `.pp-country-head-flag` HTML interpolation; its location tiles reuse `passportSlot()`. | Both paths originated at the malformed constant. | Both receive the corrected sequence. |
| Postcard detail | `fillPostcard()` extracts only regional-indicator pairs from `item.clue`; current UK-nation clues have no embedded flag. | This surface did not manufacture or mangle the malformed constant. | Existing behavior is unchanged; Passport names leading into the detail now show the corrected flag. |
| Passport share-card DOM preview | `fillPassportShareCard()` -> `passportSlotFace()` | The placeholder and name received the malformed fallback. | Both receive the corrected sequence. |
| Passport canvas share image | `passportShareImage()` -> `flagForLocation()` -> `fillText()` | The source sequence was malformed; additionally, caption truncation could remove its tag scalars. | Both canvas calls receive corrected sequences; truncation changes only the label and always appends the complete flag. |

## Codepoint proof

Evaluating the literals in `src/main.js` after the change prints:

```text
Scotland: U+1F3F4 U+E0067 U+E0062 U+E0073 U+E0063 U+E0074 U+E007F
England:  U+1F3F4 U+E0067 U+E0062 U+E0065 U+E006E U+E0067 U+E007F
Wales:    U+1F3F4 U+E0067 U+E0062 U+E0077 U+E006C U+E0073 U+E007F
```

These encode `gb-sct`, `gb-eng`, and `gb-wls`, respectively, between BLACK FLAG
and CANCEL TAG. A repository scan reports zero remaining black-flag sequences
followed by the former `U+D0000` private-use range.

Every named DOM surface obtains its flag from `flagForLocation()` or
`countryFlag()`, both of which return these exact strings for the three country
keys. The canvas no-photo flag and caption also call `flagForLocation()` without
serializing the result. The revised caption loop stores the flag separately, so
the printed sequence above is exactly what it passes to `fillText()`.

## Verification

```text
$ node --check --input-type=module < src/main.js
# exit 0
```

The codepoint check compared each evaluated scalar array with its expected array
and exited successfully. It also printed:

```text
malformed U+D subdivision sequences: 0
```

No deployment was performed.
