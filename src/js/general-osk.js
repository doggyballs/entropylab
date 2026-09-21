// ==== EntropyLab general on-screen keyboard ====
// For non-sensitive text/number inputs on touch devices.
// Shows only when (pointer: coarse) is detected.
// Follows the existing hodlKeyboardToggleMarkup / hodlKeyboardMarkup patterns.
(function () {
  "use strict";

  // !!! DEBUG-ONLY OVERRIDE — REMOVE BEFORE SUBMITTING THE PR !!!
  // Forces the OSK on for desktop development (pikvm/laptop iteration).
  // When done iterating, delete this const to restore touch-only gating.
  const GENERAL_OSK_FORCE_ON = true;

  // Only on touch devices (unless the debug override above is set).
  // Exclude phones/tablets — they have a system IME, and showing our
  // keyboard on top of it is a double-keyboard UX disaster. The OSK is
  // for kiosks (touch + no system keyboard), not for phones.
  const isKiosk = !/Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  if (!GENERAL_OSK_FORCE_ON && (!window.matchMedia("(pointer: coarse)").matches || !isKiosk)) return;

  const KEYBOARD_ID = "general-osk";
  const TOGGLE_CLASS = "general-keyboard-toggle";

  // Keyboard SVG icon (same visual language as existing seed-keyboard-toggle)
  const toggleSVG = `<svg viewBox="0 0 64 44" aria-hidden="true" focusable="false"><rect class="seed-keyboard-icon-case" x="3" y="6" width="58" height="32" rx="4"/><g class="seed-keyboard-icon-keys"><rect x="9" y="10" width="4" height="5" rx=".5"/><rect x="15" y="10" width="4" height="5" rx=".5"/><rect x="21" y="10" width="4" height="5" rx=".5"/><rect x="27" y="10" width="4" height="5" rx=".5"/><rect x="33" y="10" width="4" height="5" rx=".5"/><rect x="39" y="10" width="4" height="5" rx=".5"/><rect x="45" y="10" width="4" height="5" rx=".5"/><rect x="51" y="10" width="4" height="5" rx=".5"/><rect x="12" y="18" width="4" height="5" rx=".5"/><rect x="18" y="18" width="4" height="5" rx=".5"/><rect x="24" y="18" width="4" height="5" rx=".5"/><rect x="30" y="18" width="4" height="5" rx=".5"/><rect x="36" y="18" width="4" height="5" rx=".5"/><rect x="42" y="18" width="4" height="5" rx=".5"/><rect x="48" y="18" width="4" height="5" rx=".5"/><rect x="17" y="28" width="30" height="5" rx=".75"/></g></svg>`;

  let activeInput = null;
  let keyboardVisible = false;

  // Fields already covered by existing on-screen keyboards
  const EXISTING_KEYBOARD_FIELDS = new Set([
    "entropy-input", "pass", "private-key-input", "base64-input", "bech32-input",
  ]);

  // Slider-driven fields: the UI provides a better input method (range
  // sliders with defaults and arrow-key support), so no on-screen keyboard
  // toggle is offered for them.
  const SLIDER_DRIVEN_FIELDS = new Set([
    "msig-m-number", "msig-n-number",
  ]);

  // Per-field keyboard layouts. A field listed here gets a purpose-built
  // multi-row keyboard; everything else falls back to the full layout.
  // Rows render as flex rows that fill the panel width; keeping each row's
  // key count equal makes all keys approximately the same size.
  // Lookup keys are field ids, or class selectors (prefixed with ".") for
  // dynamically-created inputs that carry no id (msig co-signer fields).
  const FIELD_CHARSETS = {
    // Derivation path: digits on row 1; m / ' + backspace on row 2
    "derivation-path": [
      ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
      ["m", "/", "'", "backspace"],
    ],
    // Vanity prefix: lowercase bech32 charset (full a-z + digits; the field
    // itself live-filters invalid sequences). qwerty rows, backspace last.
    "vanity-prefix": [
      ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
      ["a", "s", "d", "f", "g", "h", "j", "k", "l", "backspace"],
      ["z", "x", "c", "v", "b", "n", "m", "1", "2", "3"],
      ["4", "5", "6", "7", "8", "9", "0"],
    ],
    // Co-signer full derivation path (same charset as the Keys-tab path)
    ".msig-full-path": [
      ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
      ["m", "/", "'", "backspace"],
    ],
    // Co-signer master fingerprint: 8 lowercase hex characters
    ".msig-master-fingerprint": [
      ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
      ["a", "b", "c", "d", "e", "f", "backspace"],
    ],
    // Co-signer path components (purpose / network / account / child steps)
    // inside each cosigner's "Advanced entry" disclosure. No id — class only.
    ".msig-path-component-input": [
      ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
      ["'", "backspace"],
    ],
    // Silent payments: recipients (bech32 + BIP-321 URI + optional count)
    "sp-recipients": [
      ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
      ["a", "s", "d", "f", "g", "h", "j", "k", "l", "backspace"],
      ["z", "x", "c", "v", "b", "n", "m", "1", "2", "3"],
      ["4", "5", "6", "7", "8", "9", "0", ":", "?", "="],
      ["@", ".", "/", " ", "enter"],
    ],
    // Silent payments: BIP-352 vin JSON (quotes, braces, brackets, colons,
    // commas, hex, derivation path)
    "sp-send-vins": [
      ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
      ["a", "b", "c", "d", "e", "f", "m", "/", "'", "backspace"],
      ["{", "}", "[", "]", "\"", ":", ",", " ", "enter"],
    ],
    "sp-verify-vins": [
      ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
      ["a", "b", "c", "d", "e", "f", "m", "/", "'", "backspace"],
      ["{", "}", "[", "]", "\"", ":", ",", " ", "enter"],
    ],
    // Silent payments: taproot output keys (32-byte x-only hex)
    "sp-verify-outputs": [
      ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"],
      ["a", "b", "c", "d", "e", "f", "backspace"],
    ],
  };

  // Resolve the lookup key for a field: its id, or the first FIELD_CHARSETS
  // class selector it matches (for id-less dynamic inputs).
  function charsetKeyFor(input) {
    if (input.id && FIELD_CHARSETS[input.id]) return input.id;
    for (const key of Object.keys(FIELD_CHARSETS)) {
      if (key.startsWith(".") && input.classList?.contains(key.slice(1))) return key;
    }
    return input.id || "";
  }

  function charsetFor(input) {
    const key = charsetKeyFor(input);
    if (FIELD_CHARSETS[key]) return FIELD_CHARSETS[key];
    if (input.inputMode === "numeric" || input.type === "number") {
      return [["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"]];
    }
    return null; // full layout
  }

  function isEligibleInput(input) {
    if (!input) return false;
    // Textareas are eligible too (sp-recipients, sp-send-vins, etc.)
    const isTextArea = input.tagName === "TEXTAREA";
    // Dynamically-created inputs may have no id but a known class
    const hasKnownClass = Object.keys(FIELD_CHARSETS).some(
      (key) => key.startsWith(".") && input.classList?.contains(key.slice(1)),
    );
    if (!input.id && !hasKnownClass) return false;
    if (input.id && EXISTING_KEYBOARD_FIELDS.has(input.id)) return false;
    if (input.id && SLIDER_DRIVEN_FIELDS.has(input.id)) return false;
    if (!isTextArea) {
      const type = (input.type || "text").toLowerCase();
      if (!["text", "number"].includes(type)) return false;
    }
    if (input.disabled || input.readOnly) return false;
    return true;
  }

  // Stable identity for a field: its id, or a synthetic key for id-less
  // dynamic inputs (class + data-path-index if present, else sibling index).
  function fieldKeyFor(input) {
    if (input.id) return input.id;
    const known = Object.keys(FIELD_CHARSETS).find(
      (key) => key.startsWith(".") && input.classList?.contains(key.slice(1)),
    );
    if (!known) return "";
    // Path-component inputs carry data-path-index — use it for stability
    // across re-renders (replaceChildren cycles create new DOM nodes).
    if (input.dataset.pathIndex !== undefined) return known + ":" + input.dataset.pathIndex;
    const siblings = Array.from(document.querySelectorAll(known)).filter((el) => el.tagName === "INPUT");
    return known + ":" + siblings.indexOf(input);
  }

  function buildToggle(input) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = TOGGLE_CLASS + " seed-keyboard-toggle";
    btn.dataset.generalOskToggle = fieldKeyFor(input);
    btn.setAttribute("aria-label", "Show on-screen keyboard");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = toggleSVG;
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      toggleKeyboard(input);
    });
    return btn;
  }

  function buildKeyboardPanel(charset) {
      const panel = document.createElement("div");
      panel.className = "seed-keyboard general-osk-panel";
      panel.id = KEYBOARD_ID;
      panel.setAttribute("data-on-screen-keyboard", "");
      panel.setAttribute("role", "group");
      panel.setAttribute("aria-label", "On-screen keyboard");
      panel.hidden = true;

      if (charset) {
        // Purpose-built multi-row keyboard for this field's layout.
        // Every row is a general-osk-key-row (flex, fills panel width);
        // equal key counts per row = uniform key sizes.
        let html = "";
        for (const row of charset) {
          html += '<div class="seed-keyboard-row general-osk-key-row">';
          for (const k of row) {
            if (k === "backspace") {
              html += `<button type="button" class="seed-keyboard-key seed-keyboard-delete" data-general-key="backspace" aria-label="Backspace"><svg viewBox="0 0 24 18" aria-hidden="true" focusable="false"><path d="M9 2h11a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9L2 9l7-7Z"/><path d="m12 6 6 6m0-6-6 6"/></svg></button>`;
            } else {
              html += `<button type="button" class="seed-keyboard-key" data-general-key="${k}" aria-label="Enter ${k}">${k}</button>`;
            }
          }
          html += '</div>';
        }
        panel.innerHTML = html;
      } else {
      // Full layout: matches existing seed-keyboard structure
      // Row 1: numbers + symbols, Row 2: qwerty, Row 3: asdf, Row 4: zxcv + mode + space
      const numbers = "1 2 3 4 5 6 7 8 9 0 / ' \u232b".split(" ");
      const row1 = "q w e r t y u i o p".split(" ");
      const row2 = "a s d f g h j k l".split(" ");
      const row3 = "z x c v b n m".split(" ");

      let html = '<div class="seed-keyboard-row">';
      for (const k of numbers) {
        if (k === "\u232b") {
          html += `<button type="button" class="seed-keyboard-key seed-keyboard-delete" data-general-key="backspace" aria-label="Backspace"><svg viewBox="0 0 24 18" aria-hidden="true" focusable="false"><path d="M9 2h11a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9L2 9l7-7Z"/><path d="m12 6 6 6m0-6-6 6"/></svg></button>`;
        } else {
          html += `<button type="button" class="seed-keyboard-key" data-general-key="${k}">${k}</button>`;
        }
      }
      html += '</div><div class="seed-keyboard-row">';
      for (const k of row1) {
        html += `<button type="button" class="seed-keyboard-key" data-general-key="${k}">${k}</button>`;
      }
      html += '</div><div class="seed-keyboard-row">';
      for (const k of row2) {
        html += `<button type="button" class="seed-keyboard-key" data-general-key="${k}">${k}</button>`;
      }
      html += '</div><div class="seed-keyboard-row">';
      for (const k of row3) {
        html += `<button type="button" class="seed-keyboard-key" data-general-key="${k}">${k}</button>`;
      }
      html += `<button type="button" class="seed-keyboard-mode" data-general-key="mode" aria-label="Change keyboard mode">aA1</button>`;
      html += `<button type="button" class="seed-keyboard-space" data-general-key=" " aria-label="Enter space">space</button>`;
      html += '</div>';
      panel.innerHTML = html;
    }
    return panel;
  }

  function showKeyboard(input) {
    activeInput = input;
    let panel = document.getElementById(KEYBOARD_ID);

    // Determine this field's character set (null = full layout)
    const charset = charsetFor(input);

    // Rebuild panel if charset changed or doesn't exist
    const charsetId = charset ? charset.map((r) => r.join("")).join("|") : "full";
    if (!panel || panel.dataset.charset !== charsetId) {
      if (panel) panel.remove();
      panel = buildKeyboardPanel(charset);
      panel.dataset.charset = charsetId;
      document.body.append(panel);
      // Wire key clicks — preventDefault on mousedown so the input never
      // loses focus (selectionStart/End stay valid for applyKey)
      panel.addEventListener("mousedown", function (e) {
        if (e.target.closest("[data-general-key]")) e.preventDefault();
      });
      panel.addEventListener("click", function (e) {
        const key = e.target.closest("[data-general-key]");
        if (!key) return;
        e.preventDefault();
        applyKey(key.dataset.generalKey);
      });
    }

    // Show the keyboard docked at the bottom of the viewport
    panel.hidden = false;
    keyboardVisible = true;
    panel.dataset.activeFor = fieldKeyFor(input);
    document.querySelectorAll(`[data-general-osk-toggle]`).forEach((b) => {
      b.setAttribute("aria-expanded", "false");
      b.setAttribute("aria-label", "Show on-screen keyboard");
    });
    document.querySelectorAll(`[data-general-osk-toggle="${fieldKeyFor(input)}"]`).forEach((b) => {
      b.setAttribute("aria-expanded", "true");
      b.setAttribute("aria-label", "Hide on-screen keyboard");
    });

    // Page-shrink: add bottom padding so the keyboard doesn't cover content
    document.body.style.paddingBottom = (panel.offsetHeight || 240) + "px";
  }

  function hideKeyboard() {
    const panel = document.getElementById(KEYBOARD_ID);
    if (panel) panel.hidden = true;
    keyboardVisible = false;
    activeInput = null;
    document.body.style.paddingBottom = "";
    document.querySelectorAll(`[data-general-osk-toggle]`).forEach((b) => {
      b.setAttribute("aria-expanded", "false");
      b.setAttribute("aria-label", "Show on-screen keyboard");
    });
  }

  function toggleKeyboard(input) {
    const panel = document.getElementById(KEYBOARD_ID);
    if (keyboardVisible && panel && panel.dataset.activeFor === fieldKeyFor(input)) {
      hideKeyboard();
    } else {
      showKeyboard(input);
    }
  }

  function applyKey(key) {
    if (!activeInput) return;
    const input = activeInput;
    const start = input.selectionStart || 0;
    const end = input.selectionEnd || 0;
    const value = input.value || "";

    if (key === "backspace") {
      if (start === end && start > 0) {
        input.value = value.slice(0, start - 1) + value.slice(end);
        input.selectionStart = input.selectionEnd = start - 1;
      } else {
        input.value = value.slice(0, start) + value.slice(end);
        input.selectionStart = input.selectionEnd = start;
      }
    } else if (key === "mode") {
      // TODO: cycle between lower/upper/numeric (future enhancement)
      return;
    } else if (key === "enter") {
      // Insert newline at cursor (textareas only; harmless on inputs)
      input.value = value.slice(0, start) + "\n" + value.slice(end);
      input.selectionStart = input.selectionEnd = start + 1;
    } else {
      input.value = value.slice(0, start) + key + value.slice(end);
      input.selectionStart = input.selectionEnd = start + key.length;
    }

    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    input.focus();
  }

  function attachToggleIfEligible(input) {
    if (!isEligibleInput(input)) return;
    if (input.dataset.generalOskAttached) return;
    input.dataset.generalOskAttached = "1";
    // No toggle button: the keyboard auto-shows on focus (phone pattern).
    // The field's own focus event is the trigger; the toggle is redundant.
  }

  function initGeneralOSK() {
    if (document.getElementById(KEYBOARD_ID)) return; // already init'd

    // Existing inputs and textareas
    document.querySelectorAll("input, textarea").forEach(attachToggleIfEligible);

    // Dynamically-created fields (e.g. multisig co-signer rows render after
    // keys are pasted) get toggles as they appear. Also handles re-renders:
    // replaceChildren() destroys inputs AND their toggles, so we re-scan
    // the added container for inputs that lost their toggle.
    if (typeof MutationObserver === "function") {
      new MutationObserver(function (mutations) {
        for (const m of mutations) {
          m.addedNodes.forEach(function (node) {
            if (node.nodeType !== 1) return;
            if (node.tagName === "INPUT" || node.tagName === "TEXTAREA") attachToggleIfEligible(node);
            else if (node.querySelectorAll) node.querySelectorAll("input, textarea").forEach(attachToggleIfEligible);
          });
          // Re-render safety: if a container was replaced, its new inputs
          // may not have toggles yet. Scan the added container's inputs.
          if (m.target && m.target.querySelectorAll) {
            m.target.querySelectorAll("input, textarea").forEach(attachToggleIfEligible);
          }
        }
      }).observe(document.body, { childList: true, subtree: true });
    }

    // Auto-show keyboard when an eligible field receives focus (phone pattern).
    // The toggle button still works for explicit show/hide.
    document.addEventListener("focusin", function (e) {
      if (isEligibleInput(e.target)) {
        showKeyboard(e.target);
      }
    });

    // Hide keyboard when clicking outside an input
    document.addEventListener("click", function (e) {
      if (!keyboardVisible) return;
      if (e.target.closest("[data-general-osk-toggle]")) return;
      if (e.target.closest("#" + KEYBOARD_ID)) return;
      if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;
      // Click elsewhere — hide
      hideKeyboard();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initGeneralOSK);
  } else {
    initGeneralOSK();
  }
})();
// ==== end general on-screen keyboard ====
