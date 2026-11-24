# Consult for Astra (Codex gpt-6-astra), 2026-11-23: three decisions

Sean's instruction: "Defer to Astra on all others." Your verdicts on A and B
will be executed as given. Your verdict on C will be executed if it needs
nothing from Sean; if it needs Sean to place a credential, it will be
reported to him as the recommendation. Write your answer as
ASTRA-CONSULT-BATCH1-2026-11-23.md in this workdir: one verdict per
question with reasoning, no hedging into a menu.

Context you already own: the discoloration workstream is separate from the
polar build; repair unit = connected source footprint + complete
derivative closure; complete candidate budget 1.0 GB; your standing rule
is to preserve unchanged source outside the contribution mask. Full build
evidence: BATCH1-BUILD-REPORT.md in this workdir.

## A. Family A (pilot wrapped-reflectance dtype fix): mask or accept?

The fix is proven: all 7 confirmed-bad controls pass the frozen gate after
the rebuild (Algiers 512/388 0.982 to 0.000, etc.); clean control 500/377
is byte-identical. The signed closure is exactly 544 of 5,745 pilot z10
keys, reproduced exactly by the plan's method. BUT the staged re-run
changed 894 keys, 350 of them outside the closure, because feather and
fallback consume all four toned quarters (not only the selected one) and
the ocean step uses a global median, so fixing the selected quarter moved
outputs whose selected data never contained a wrapped pixel. Changed
outsiders include clean control 544/522 (mean abs RGB diff 3.09, still
0.000 on the gate) and 600/464, a Sahara tile adjudicated legitimate color
in the sample pack. Inside the closure, 533 of 544 keys land at or under
the gate; the 11 still above are yellow-band only and carry adjudication
notes. Staged candidate is 30.3 MB on the Pi; nothing is uploaded.

Options: (1) hold the candidate and rework the staging so outputs are
masked to the 544-key closure, everything outside stays byte-identical to
what is live; (2) accept the 894-key candidate as staged.

## B. Family B (main z9 279/69, the 17,4 cast): park or calibrate?

The plan's exact rule was executed and verified: Q3 excluded for the whole
footprint, the selected TIFF is 100% Q2, the finish chain is the pinned
production chain. The rebuilt tile still fails: 0.0646 against the 0.003
gate (was 0.0807). Q2 also renders saturated cyan through the shipped
finish chain, so the diagnosis's "Q2 clean" reading came from a
non-production tone replication; part of the defect lives in the finish
chain's handling of this footprint, not only in quarter selection. The
ancestors (8/139/34, 7/69/17, 5/17/4, 4/8/2) and the shared base cannot be
regenerated: the quarterly caches were never retained and raw-quarterly
holds only 133 z9 windows. z6 is untouched by design.

Options: (1) park B as adjudicated plausible dark water and reopen it at
final-map validation; (2) calibrate first: a bounded investigation of the
finish chain's handling of this footprint before any rebuild is attempted.

## C. R2 image-mirror ingest: which route?

Separate workstream, Sean approved it end to end on 2026-11-22. The mirror
puts WebP variants (256/640/1280) of 2,107 canonical card photos on
images.where-on.earth (projected 0.526 GB; preflight passed; smoke test
15/15). Ingest tooling is built and staged on the Pi, and the plan is a
50-image pilot with sight-checked samples before any full run. Blocker:
the Pi holds no R2 credential, and the VM's connector token is
surrogate-only and cannot be copied to the Pi.

Options: (1) run the ingest from the VM with the existing token, then move
the raw cache (about 2 GB, one-time) to the Pi; (2) Sean places an
R2-edit API token for the account on the Pi through the secure flow and
the ingest runs on the Pi as designed. Weigh: one-time vs recurring need,
storage discipline (bulk data belongs on the Pi), rerun cost, and how many
times Sean should have to touch credentials.
