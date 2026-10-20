# Postcard mail report

## Passport shelf grid

Passport shelf `.pp-slot` cards now use cream paper, a top airmail stripe, a
white photo matte, and an ink postmark treatment for the existing distance label.
Visited photos remain greyscale, and flag-only cards retain their flag inside a
dashed stamp box. The full `.pp-post` card and Passport-share tiles were not
changed.

## Reveal peek

Only the 52px thumbnail changed: it now has a cream matte, striped top edge,
and postmark dot. Every existing proximity class receives the dot.
`prox-bullseye` receives 🎯 and `prox-pinpoint` receives 📍, matching the
existing `.prox-badge` mapping. `prox-postcard` has no existing glyph, so its
dot is intentionally unmarked rather than introducing a new tier symbol.

## Passport detail

The detail modal now has the airmail frame and cream inner panel, PAR AVION
design chip, white-matted photo, flag postage stamp, and dated postmark. The
stamp uses the existing earned tier and closest-distance fields, and the
postmark uses the existing earned/first-visit date. History is on its ruled
line with stats below it, avoiding the former narrow-screen crowding.

The mock's exact photos are not copied because the game continues to render
its existing location images and data. No other mock element required an
approximation.
