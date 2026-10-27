# Experimental v1.0.0 kiosk keyboard

This is an experimental touchscreen fork, not the upstream v1.0.0 release. Base: `c1037ba3a20d0c6db1b3265a7385b2944ce827e6`. The original `osk-general-keyboard` branch is preserved at `95cd549`; development is isolated on `osk-v1-durable`. The user authorized committing and pushing this branch to `doggyballs/entropylab` before physical review, but explicitly prohibited submission upstream. Hardware acceptance and the verification gaps below remain open.

Build with `npm ci && npm run build`. Open `entropylab.html?osk=1` (including with `file://`). Without that query option the module installs no keyboard DOM or listeners. This is explicit kiosk configuration, not touchscreen or system-keyboard detection. Use public test inputs only.

## Field contract

Ordinary text inputs and textareas are supported through delegated focus; dynamically added and id-less fields require no registration. Native type/inputmode/min/step guide generic layouts. Password controls are excluded unless explicitly opted into text. Hidden, inert, disabled and readonly controls are excluded.

Declare `data-general-osk` on a field when its grammar or ownership needs to be explicit:

- `off`: existing specialized keyboard or other input mechanism owns this field. An ancestor carrying `off` excludes its entire subtree; descendants cannot override it.
- `text`: full lowercase/uppercase/punctuation keyboard, space and textarea newline.
- `integer` or `decimal`: numeric layout; minimum informs sign availability.
- `path`: derivation-path characters, including BIP-88 braces and ranges.
- `hex`: hexadecimal characters; textarea whitespace/newline supports multi-value inputs.

These categories select keys, not validation rules. Existing application validators remain authoritative. New sensitive fields must declare ownership; text input types cannot establish whether contents are sensitive. A genuinely new grammar may need an additional shared category, not an ID exception.

Components that replace a focused input during validation can retain editing continuity by marking their stable parent `data-general-osk-scope` and the replaceable input `data-general-osk-key="component-name"`. Keys must be unique within the scope. Missing or ambiguous replacements close the keyboard rather than editing another component.

The dock uses shared keyboard styles and global design tokens. It is independent of form row/grid classes. Existing specialized keyboard handlers and cryptography are unchanged.

When editing inside a modal, the dock reserves its measured height in that overlay instead of adding page spacing. The modal card scrolls within the remaining space; hiding the dock releases the reservation. Modal button focus keeps that space until click handling completes so pointer activation cannot move its target.

## Editing boundaries

Selection replacement, Unicode backspace, maxlength and cancelable beforeinput are respected. If beforeinput changes the target, focus, constraints or selection, the proposed edit is abandoned. External input invalidates numeric drafts. Number/email inputs do not expose selection APIs and use end editing. Incomplete numeric prefixes such as `-` are held only as transient drafts; native number controls cannot display those as valid values. These synthetic events are not trusted input events.

## Verification and review

`node --test test/general-osk.browser.mjs` exercises the real Chromium engine with an isolated temporary fixture/profile, including genuine touch dispatch, dynamic controls, semantic exclusions, cancellation and replacement hazards, numeric drafts and responsive geometry. `npm test` runs the upstream suite. Build artifacts are generated and must not be committed.

Workstation browser smoke is not physical hardware acceptance. Before accepting or deploying this candidate, review the selected Waveshare 7inch HDMI LCD (C), 1024×600, with USB touch: targeting, focus and scroll visibility, orientation, specialized keyboards, path/number editing, multisig rerendering, import editors and session end. Test normal loading without opt-in too. The ODROID's pinned stock launcher/artifact must remain unchanged until a separately authorized experimental deployment.

### Workstation evidence — 2026-10-25

- Pre-commit build passed; historical HTML SHA-256: `9050a36c342d3c22a5415afa168e8f235909b50baa8cf5cf356baf9cf0a63601`. This identifies the earlier working-tree artifact, not a rebuild of the committed source; the experimental notice and build commit stamp change its bytes.
- Focused Chromium regression passed initially (3.05 seconds). Later runs reached compositor-frame/touch CDP timeouts; attempts with background-throttling flags, software rendering and explicit frame capture did not resolve them. Those experimental harness workarounds were removed. Direct Snap binary launch was also unavailable because `libatk-1.0.so.0` was not found. Final-tree browser regression is therefore not certified green.
- Full `npm test`: 2,227 passed, 6 failed, 10 skipped. Failures were four source-markup assertions plus the Chromium hosted/offline report timeout and its parent test. Removed brittle attribute-order assertions rather than repinning them; the affected `ui-defaults.test.mjs` then passed all 97 tests. Full browser-suite timeout remains unresolved; do not interpret the targeted rerun as a full-suite pass.
- Actual built-app workstation Chromium interaction verified derivation-path deletion/restoration, exclusion of the vault-owned passphrase field, and dynamic multisig textarea edits reaching upstream validation. Inspected 390px light/dark keyboards and desktop rendering; compact Space/Enter glyphs avoid narrow-key label clipping. This is headless workstation rendering, not ODROID/Vu8S acceptance.
- Screenshots are outside this fork in RockOS's ignored `artifacts/osk-v1-review-20261025/`. No board access or deployment occurred. The initial verification preceded commit/push authorization; no upstream PR was opened or reopened.

### Modal layout verification — 2026-10-27

- Built the candidate successfully. At 1024×600, actual-app Chromium touch emulation rejected an incorrect digit, accepted the requested digit, and dismissed the warning with the dock still open. Prompt, input and confirmation were visible and hit-testable above the dock. Also inspected 390×844 light/dark layouts and resizing back to 1024×600.
- Ran a separate temporary Firefox preview on the ODROID using HTML SHA-256 `f47cf4beafac80407ff43b545725b2745ee35224e3bf5f831b390f8f3fef9d04`. Captured the actual 1024×600 X display: prompt, field and confirmation remained above the keypad. Injected X pointer clicks entered the requested digit and dismissed the dialog without first hiding the keypad. This verifies the board/browser rendering and pointer path, not physical finger input.
- Removed the temporary preview and its RAM profile; restarted the unchanged stock launcher. All three services ran and installed/runtime HTML matched the stock v1.0.0 pin. No persistent launcher or application replacement, autostart, commit or PR update.
- Full `npm test` did not pass: the 180-second run reported 2,135 passed, 1 failed, 4 cancelled and 9 skipped. The reported failure was the residue browser's `Page.navigate` timeout; other browser/build/validation tasks were interrupted. Do not treat this smoke proof as a green full suite.
