# Passport thumbnail tier review (2026-11-03)

Reviewer: Muse Wonder (in-session), working from the Opus lane's banked evidence
(shots/pack-thumb-review/: 390px dex captures, per-tier postcard front/back shots,
measurements.json with seeded states Abu Dhabi seen, Addis Ababa near, Amsterdam
bullseye, Apia pinpoint, Asuncion seen, Baku near, Bangui bullseye, Belfast pinpoint).
The Opus lane died on the session limit after capturing evidence; this review
reads that evidence directly. All sizes below are measured from the live DOM
at 390px viewport width, not estimated.

## 1. Facts: what actually differs between tiers on the thumbnail

Slot geometry is identical for every state: slot 108.7 x 95 px, photo
98.7 x 67.8 px, photo border 3px solid near-white, same paper gradient, same
shadow. The circular km stamp is a 28.1 px circle with the number set at
**7px** font (text box about 13-15 px wide).

| State | Photo | Stamp | Anything else |
|---|---|---|---|
| seen (e=0) | grayscale(1), contrast .92, brightness .82 | gray ink (rgba(90,90,90,.8)) on gray border | nothing |
| near (e=1) | full color | gray ink, **identical to seen** | the prox-postcard class changes nothing measurable on the slot |
| bullseye (e=2) | full color | gold (rgb(178,124,32)) text and border, cream ground | the prox-bullseye class changes nothing measurable on the slot |
| pinpoint (e=3) | full color | gold, **identical to bullseye** | the prox-pinpoint class changes nothing measurable on the slot |

So the earned "frame" classes (prox-postcard / prox-bullseye / prox-pinpoint)
exist on the slot element, but at thumbnail size they produce no visible
difference in border, shadow, or paper. The full visual system today is:

- seen to near: the photo gains color (this one works, it reads instantly).
- near to bullseye: the tiny stamp changes from gray ink to gold ink.
- bullseye to pinpoint: **nothing visible at all** except the stamp's number.

**Sean's read is right, and understated.** It is not just that the only
difference is the stamp's color: bullseye and pinpoint are indistinguishable
on the thumbnail unless you read a 7px number, and near's stamp does not even
change from seen's.

## 2. Feedback on Sean's thoughts

**"The km stamps are hard to read at their current size."** Agree, measured.
7px type inside a 28px postmark circle is below any legibility floor, and the
postmark's rotated circular text styling makes it worse. It cannot be fixed
inside the current grid: a genuinely legible stamp needs roughly 40px or
more, which would eat a third of the 99px-wide photo. The stamp's number is
flavor, not information, at this size. The tier signal has to be carried by
shape and material instead of text.

**"We definitely need to show their closest guess on the full postcard back,
maybe more prominently."** Agree. The back already shows it, but as the
quietest line on the card: "2 km · Pinpoint" centered under the dashed rule
at 10px, while the address side gives four history rows (FIRST VISITED /
NEAR EARNED / BULLSEYE EARNED / PINPOINT EARNED with dates) more visual
weight. Concrete fix: promote the closest guess into the stats block as its
headline. Put a "CLOSEST GUESS" row at the top of the history list with the
distance set large (the number at 20px+, Oswald, ink or gold by tier) and the
tier name beside it, and drop the centered footer line or leave it as a
repeat of the tier name only. The back is where a player goes to admire a
card; the achievement stat should be the first thing the eye lands on after
the name.

**"I don't think we can on the thumbnails."** Agree for numbers. A thumbnail
has room for exactly three signals: color vs grayscale (already used for
seen vs earned), a frame material, and a badge silhouette. Use those.

## 3. Bullseye and pinpoint thumbnail treatment

Design goal: from the grid alone, a player should see the ladder
(color photo, then gold, then more gold) and want the next rung.

**Option A (recommended): foil frame progression on the photo window.**
Near keeps today's plain 3px near-white photo border. Bullseye replaces it
with the pack's satin gold foil as the photo border (same 3px, gold material,
reusing the sealed-pack foil treatment). Pinpoint keeps the gold border and
adds a second, thinner inner gold rule (a double frame) plus the gold
postmark-style star punched at the photo's top-right corner where the stamp
already sits, so the stamp itself gains a filled gold ground instead of an
outline. Every step is visible at arm's length, needs no reading, and stays
inside the established foil/paper language. It also makes the placement
animation's frame-upgrade landing (already in build) actually legible: the
frame is the thing that visibly upgrades.

**Option B: corner medallion.** A small embossed medal pinned over the
photo's bottom-right corner: a plain ring for bullseye, a ring with a pin
star for pinpoint. Reads as a badge silhouette at thumbnail size and is
cheap to build, but it introduces a new visual object the rest of the game
does not use, and it competes with the stamp's corner.

**Option C: paper stock progression.** Warmer cream paper for bullseye,
foil-stamped pack name for pinpoint. Too subtle to read as a ladder, and it
makes the grid inconsistent in a way that looks accidental rather than
earned. Not recommended.

Recommendation: **Option A**, and keep the km stamp exactly as is. Once the
frame carries the tier, the stamp's number becomes a detail you discover
when you open the card, which is what it is good for. Pair it with the
postcard-back change in section 2 (closest guess as the stats headline) so
the number players care about lives at full size in exactly one place.

## 4. What this does not change

Tier data, thresholds (EARN_NEAR / EARN_BULLSEYE / EARN_PINPOINT), the dex
grid layout, slot numbering, and the seen-to-near color step are all fine as
they are. The work is: photo-border materials for tiers 2 and 3, the pinpoint
stamp ground, and the postcard back's stats hierarchy. No data migration.

## As built (2026-11-03, Muse Wonder, pulled forward off the Opus queue)

Shipped in the tree the same night: bullseye photo borders use the satin
gold foil gradient, pinpoint adds the outer cream-and-gold double rule and a
solid gold stamp, and the postcard back's stat strip now headlines the
closest guess (label, 19px Oswald number, tier; gold at bullseye and
pinpoint). One placement change from the recommendation above: the headline
sits in the back's bottom stat strip at full card width, not at the top of
the history list. The history column cannot grow inside the fixed-height
card; the first build put it there and the history rows overflowed the
card's bottom edge, verified on a 390px capture and corrected before
committing. Verified: suite 97/97, both node --check forms, 390px captures
of the seeded dex and the pinpoint back read by the reviewer.
