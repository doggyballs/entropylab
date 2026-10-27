import { t as hodlTText } from "./i18n.js";

// Optional kiosk keyboard. Ordinary loads install no DOM or event listeners.
(function () {
  "use strict";
  if (new URLSearchParams(location.search).get("osk") !== "1") return;

  const digits = "1234567890";
  const paths = [digits, "m/hH'{}-"];
  const hex = [digits, "abcdef"];
  const letters = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
  const symbols = [digits, "!@#$%^&*()", "-_=+[]{}", "\\|;:'\",.<>/?`~"];
  let active = null, panel = null, spacer = null, modal = null, mode = 0;
  let numberDraft = null;
  let ownInput = null, inputRevision = 0;

  function category(field) {
    const explicit = field.getAttribute("data-general-osk");
    if (explicit !== null) return /^(text|integer|decimal|path|hex)$/.test(explicit) ? explicit : null;
    if (field.type === "password" || field.inputMode === "none") return null;
    if (field.type === "number") {
      // A fractional step base permits fractional values even with step=1.
      const base = field.min || field.getAttribute("value") || "0";
      return field.step === "any" || Number(field.step) % 1 || Number(base) % 1 ? "decimal" : "integer";
    }
    if (field.inputMode === "decimal") return "decimal";
    if (field.inputMode === "numeric") return "integer";
    if (field.type === "tel" || field.inputMode === "tel") return "tel";
    return "text";
  }

  function eligible(field) {
    return field?.isConnected && field.matches?.("textarea, input") &&
      (field.tagName === "TEXTAREA" || /^(text|number|search|email|url|tel|password)$/.test(field.type)) &&
      (field.type !== "password" || field.getAttribute("data-general-osk") === "text") &&
      !field.matches(":disabled, [readonly]") &&
      !field.closest('[hidden], [inert], [data-on-screen-keyboard], [data-general-osk="off"]') &&
      category(field) !== null;
  }

  function layout(field) {
    const kind = category(field);
    if (kind === "path") return field.tagName === "TEXTAREA" ? [...paths, " \n"] : paths;
    if (kind === "hex") return field.tagName === "TEXTAREA" ? [...hex, " \n"] : hex;
    if (kind === "tel") return [digits, "+*#"];
    if (kind === "integer" || kind === "decimal") {
      let extra = kind === "decimal" ? "." : "";
      const min = field.getAttribute("min");
      if (min === null || min.trim() === "" || !Number.isFinite(Number(min)) || Number(min) < 0) extra += "-";
      return extra ? [digits, extra] : [digits];
    }
    return null;
  }

  function releaseModal() {
    if (!modal) return;
    modal.classList.remove("general-osk-modal");
    modal.style.removeProperty("--osk-height");
    modal = null;
  }

  function hide() {
    if (panel) panel.hidden = true;
    if (spacer) spacer.style.height = "0px";
    releaseModal();
    active = null;
    numberDraft = null;
  }

  function fit() {
    if (!active || !panel || panel.hidden) return;
    if (!active.isConnected || !eligible(active)) return hide();
    const nextModal = active.closest(".modal-overlay");
    if (modal !== nextModal) {
      releaseModal();
      modal = nextModal;
    }
    const dock = panel.getBoundingClientRect();
    spacer.style.height = modal ? "0px" : dock.height + "px";
    if (modal) {
      modal.classList.add("general-osk-modal");
      modal.style.setProperty("--osk-height", dock.height + "px");
    }
    const field = active.getBoundingClientRect();
    const card = modal && active.closest(".modal-card")?.getBoundingClientRect();
    const top = card ? Math.max(0, card.top) : 0;
    const bottomEdge = card ? Math.min(dock.top, card.bottom) : dock.top;
    // Scroll the nearest scrolling container, then clear the dock if necessary.
    if (field.bottom > bottomEdge - 8 || field.top < top + 8) {
      active.scrollIntoView({ block: "center", behavior: "instant" });
      const bottom = active.getBoundingClientRect().bottom;
      if (!modal && bottom > dock.top - 8) window.scrollBy(0, bottom - dock.top + 8);
    }
  }

  function render() {
    const limited = layout(active);
    const rows = limited || (mode === 2 ? symbols : [digits, ...letters.map(row => mode === 1 ? row.toUpperCase() : row)]);
    panel.replaceChildren();
    panel.classList.toggle("general-osk-full", !limited);
    function row(keys) {
      const element = document.createElement("div");
      element.className = "general-osk-key-row";
      for (const key of keys) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "seed-keyboard-key";
        button.dataset.generalKey = key;
        const label = ({ backspace: hodlTText("Backspace"), mode: "aA1", hide: hodlTText("Hide keyboard"), " ": hodlTText("Space"), "\n": hodlTText("Enter") })[key] || key;
        button.textContent = ({ backspace: "⌫", hide: "⌄", " ": "␣", "\n": "↵" })[key] || label;
        button.setAttribute("aria-label", label);
        element.append(button);
      }
      panel.append(element);
    }
    const keysByRow = rows.map(keys => Array.from(keys));
    if (limited) {
      keysByRow[keysByRow.length - 1].push("backspace", "hide");
    } else {
      keysByRow[1].push("backspace");
      keysByRow[keysByRow.length - 1].push("mode", " ", ...(active.tagName === "TEXTAREA" ? ["\n"] : []), "hide");
    }
    if (limited) {
      for (const keys of keysByRow) row(keys);
    } else {
      // Balance the complete layout instead of wrapping individual QWERTY rows.
      const keys = keysByRow.flat();
      panel.style.setProperty("--osk-columns-wide", Math.ceil(keys.length / 4));
      panel.style.setProperty("--osk-columns-narrow", Math.ceil(keys.length / 5));
      row(keys);
    }
    panel.hidden = false;
    requestAnimationFrame(fit);
  }

  function show(field) {
    if (!eligible(field)) return hide();
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "general-osk";
      panel.className = "seed-keyboard general-osk-panel";
      panel.setAttribute("data-on-screen-keyboard", "");
      panel.setAttribute("role", "group");
      panel.setAttribute("aria-label", hodlTText("On-screen keyboard"));
      spacer = document.createElement("div");
      spacer.setAttribute("aria-hidden", "true");
      document.body.append(spacer, panel);
      // Retain focus/selection on mouse and touch; click remains the activation.
      panel.addEventListener("pointerdown", event => { if (event.target.closest("button")) event.preventDefault(); });
      panel.addEventListener("mousedown", event => { if (event.target.closest("button")) event.preventDefault(); });
      panel.addEventListener("click", event => {
        // Switching layouts removes the clicked button before document sees it.
        event.stopPropagation();
        const button = event.target.closest("[data-general-key]");
        if (button) { event.preventDefault(); apply(button.dataset.generalKey); }
      });
      new ResizeObserver(fit).observe(panel);
    }
    if (active !== field) { mode = 0; numberDraft = null; }
    active = field;
    render();
  }

  function apply(key) {
    const field = active;
    if (!eligible(field)) return hide();
    if (key === "hide") return hide();
    const limited = layout(field);
    if (key === "mode") {
      if (!limited) { mode = (mode + 1) % 3; render(); }
      return;
    }
    // Attributes may change while the field remains focused.
    if (limited && key !== "backspace" && !limited.some(row => row.includes(key))) return render();
    const value = field.type === "number" && numberDraft?.value === field.value ? numberDraft.raw : field.value;
    const scope = field.closest("[data-general-osk-scope]");
    const fieldKey = field.getAttribute("data-general-osk-key");
    // Number/email inputs have no selection API: append/delete at the end.
    const selectionStart = field.selectionStart, selectionEnd = field.selectionEnd;
    let start = selectionStart ?? value.length;
    const end = selectionEnd ?? value.length;
    if (key === "backspace" && start === end) {
      start -= Array.from(value.slice(0, start)).pop()?.length || 0;
    }
    const text = key === "backspace" ? "" : key;
    const next = value.slice(0, start) + text + value.slice(end);
    if (field.type === "number" && !/^-?\d*\.?\d*$/.test(next)) return;
    if (text && field.maxLength >= 0 && next.length > field.maxLength) return;
    const inputType = key === "backspace" ? "deleteContentBackward" : "insertText";
    const previous = field.value, type = field.type, revision = inputRevision;
    const constraints = [field.maxLength, field.getAttribute("min"), field.getAttribute("max"), field.getAttribute("step"), field.inputMode, category(field)].join("|");
    if (!field.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType, data: text || null }))) return;
    // A validator can rewrite, refocus, remove, or lock this control. Never
    // overwrite that decision or send input/change to an obsolete element.
    if (active !== field) return;
    if (!eligible(field)) return hide();
    if (field.value !== previous || field.type !== type || revision !== inputRevision ||
        field.selectionStart !== selectionStart || field.selectionEnd !== selectionEnd ||
        constraints !== [field.maxLength, field.getAttribute("min"), field.getAttribute("max"), field.getAttribute("step"), field.inputMode, category(field)].join("|")) {
      numberDraft = null;
      return render();
    }
    // Native number inputs sanitize "-" and "1.". Keep a local draft while
    // exposing only a representable value; min/max/step validity stays native.
    const numeric = field.type === "number";
    field.value = numeric && next.endsWith(".") ? next.slice(0, -1) : next;
    if (numeric) numberDraft = { raw: next, value: field.value };
    if (selectionStart !== null) field.setSelectionRange(start + text.length, start + text.length);
    const input = new InputEvent("input", { bubbles: true, inputType, data: text || null });
    ownInput = input;
    try { field.dispatchEvent(input); } finally { ownInput = null; }
    if (eligible(field)) field.dispatchEvent(new Event("change", { bubbles: true }));
    if (active !== field) return;
    if (!field.isConnected) {
      // Only a unique, explicitly keyed replacement inside the original stable
      // scope may inherit focus. Never guess from application IDs or classes.
      const replacements = scope?.isConnected && fieldKey !== null ?
        [...scope.querySelectorAll("[data-general-osk-key]")].filter(candidate =>
          candidate.getAttribute("data-general-osk-key") === fieldKey &&
          candidate.closest("[data-general-osk-scope]") === scope) : [];
      const replacement = replacements.length === 1 ? replacements[0] : null;
      if (!eligible(replacement)) return hide();
      numberDraft = null;
      replacement.focus({ preventScroll: true });
      if (active !== replacement) return hide();
      if (replacement.selectionStart !== null) replacement.setSelectionRange(start + text.length, start + text.length);
    } else if (!eligible(field)) hide();
    else requestAnimationFrame(fit);
  }

  document.addEventListener("focusin", event => {
    if (panel?.contains(event.target)) return;
    // Keep modal buttons stationary between pointer-down focus and click.
    // The click handler releases the reserved space after activation.
    if (modal?.contains(event.target) && event.target.closest("button")) return;
    show(event.target);
  });
  document.addEventListener("click", event => {
    if (panel?.contains(event.target)) return;
    if (eligible(event.target)) {
      if (active !== event.target) show(event.target);
    } else hide();
  });
  // Real typing (including a deletion that leaves the same sanitized number
  // value) invalidates an incomplete OSK draft. Ignore only our own event.
  document.addEventListener("input", event => {
    if (event.target === active && event !== ownInput) {
      numberDraft = null;
      inputRevision++;
    }
  }, true);
  document.addEventListener("keydown", event => { if (event.key === "Escape") hide(); });
  window.addEventListener("resize", fit);
})();
