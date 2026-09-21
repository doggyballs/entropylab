# Draft PR: opt-in touchscreen keyboard for keyboard-less kiosks

Status: local proposal only. Do not open or reopen an upstream PR until
explicitly authorized. This document is the draft PR description.

## Summary

Add a small, isolated on-screen keyboard for touch-only appliances such as
RockOS-Pi (Raspberry Pi running cage/Cog/WPE WebKit). Such deployments have
no physical or system keyboard for fields not covered by EntropyLab's
existing specialized keyboards.

**Normal EntropyLab loads are unchanged.** The feature activates only when
the launch URL contains `?osk=1`. RockOS-Pi supplies that opt-in in its
launcher; ordinary desktop, phone and tablet users receive no new keyboard,
field toggles, focus listeners or layout changes. There is no user-agent
sniffing or unreliable attempt to detect the absence of a system keyboard.
Other deployments can explicitly opt in too: this is not a RockOS-specific
browser check, and attaching a physical keyboard does not disable the opt-in.

## Small, additive integration

- One self-contained module, `src/js/general-osk.js`.
- One import in the existing application entry point.
- One scoped CSS block reusing upstream panel/key styling.
- No new dependencies, runtime requests, storage or generated entropy.
- No changes to upstream cryptography, parsing or derivation functions.
- No new per-field toggle buttons or modifications to existing keyboard
  toggles. Known upstream keyboard fields (`entropy-input`, `pass`, `key`,
  etc.) and slider-driven multisig controls are excluded.

The goal is a minimal integration surface, not a claim of zero added code:
reviewable keyboard logic, documentation and browser regression coverage
are included. The app remains a self-contained HTML artifact.

## Interaction and responsive layouts

A shared bottom-docked panel appears when an eligible field receives focus.
Delegated events cover newly added/id-less inputs and textareas without
registration or whole-page mutation scanning. Disabled, read-only and
non-text controls are excluded.

Numeric/decimal/telephone attributes select limited layouts; a small mapping
covers domain-specific paths and fingerprints. Fields with a paired Harden
checkbox use digits, without a redundant apostrophe key. Full path fields
retain their path characters. New fields gain generic input automatically;
new domain-specific grammars may still need a small layout mapping.

Full keyboards offer lowercase, uppercase, symbols, space and textarea
newlines. A balanced grid uses four rows on wider screens and five on narrow
screens, rather than preserving QWERTY row boundaries at the cost of overflow.
Restricted layouts remain compact. The panel has bounded height and can
scroll on short screens. A measured spacer creates scroll room and focus
handling reveals the edited field; it does not resize the browser viewport.

Text editing respects selection, maxlength and cancelable beforeinput.
Synthetic input/change events feed existing upstream validation. Number and
email inputs use end editing because browsers expose no selection API for
those types. Multisig component replacement is resolved within its original
container, avoiding collisions between cosigners.

## Byte-for-byte upstream integration for RockOS-Pi

After upstream acceptance, RockOS-Pi can pin an upstream release/source commit,
fetch the corresponding built HTML, verify its expected SHA-256, and install
those exact bytes without adding kiosk patches or injecting scripts.

The launcher opens:

`file:///opt/rockos/app/entropylab.html?osk=1`

The query parameter changes runtime behavior, not file contents or the file
hash. One upstream artifact therefore serves both normal users and opted-in
kiosks. Hash verification establishes byte identity with a reference artifact;
authenticating that reference requires trusted release provenance, and signed
checksums/attestations if upstream provides them. A source commit hash is not
the same thing as an HTML artifact hash.

Until merged, the deployed build is explicitly a **fork build**, not an
upstream-identical artifact containing this feature.

## Verification and current limitations

- `npm run build` passes.
- `node --test test/general-osk.browser.mjs` exercises real Chromium editing,
  opt-in/default-off behavior, known upstream exclusions, new fields,
  replacement multisig components, touch activation and horizontal geometry
  at 320, 480, 800, 1024 and 1920 pixel viewport widths.
- The user has tested the prototype on RockOS-Pi and approved the current
  layout. Broad device and WPE regression coverage is still desirable.
- Latest full `npm test`: 1,323 passed, 2 failed, 6 skipped. Failures are in
  the headless Chrome browser harness (watchdog timeout). This is not a
  fully green suite; do not represent focused tests as clearing those failures.
- No claim that this keyboard detects an attached physical keyboard, proves
  an air gap, prevents keylogging, or changes existing security guarantees.
- Keep the work as a fork/local draft until explicitly authorized to submit.
