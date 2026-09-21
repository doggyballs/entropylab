// Optional kiosk keyboard. Ordinary loads install no DOM or event listeners.
(function () {
  "use strict";
  if (new URLSearchParams(location.search).get("osk") !== "1") return;

  const excluded = new Set(["entropy-input", "pass", "key", "private-key-input",
    "base64-input", "bech32-input", "msig-m-number", "msig-n-number"]);
  const digits = "1234567890";
  const paths = [digits, "m/'"];
  const hex = [digits, "abcdef"];
  const letters = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];
  const symbols = [digits, "!@#$%^&*()", "-_=+[]{}", "\\|;:'\",.<>/?`~"];
  const restricted = {
    "derivation-path": paths,
    ".msig-full-path": paths,
    ".msig-master-fingerprint": hex,
    ".msig-path-component-input": [digits],
    "vanity-prefix": [digits, ...letters],
    "sp-verify-outputs": [...hex, " \n"],
  };
  let active = null, panel = null, spacer = null, mode = 0;
  let numberDraft = null;

  function eligible(field) {
    return field?.matches?.("textarea, input") &&
      (field.tagName === "TEXTAREA" || /^(text|number|search|email|url|tel|password)$/.test(field.type)) &&
      !field.matches(":disabled, [readonly]") && !excluded.has(field.id) &&
      !field.closest("[hidden], [inert], [data-on-screen-keyboard]");
  }

  function layout(field) {
    // A paired Harden checkbox supplies the apostrophe; show only the index.
    if (field.closest(".field")?.querySelector('.derivation-harden input[type="checkbox"]')) return [digits];
    if (restricted[field.id]) return restricted[field.id];
    for (const selector of Object.keys(restricted)) {
      if (selector[0] === "." && field.matches(selector)) return restricted[selector];
    }
    if (field.type === "number" || /^(numeric|decimal|tel)$/.test(field.inputMode) || field.type === "tel") {
      let extra = "";
      if (field.inputMode === "decimal" || (field.type === "number" && (field.step === "any" || Number(field.step) % 1))) extra += ".";
      if (field.type === "number" && (!field.hasAttribute("min") || Number(field.min) < 0)) extra += "-";
      if (field.type === "tel" || field.inputMode === "tel") extra += "+*#";
      return extra ? [digits, extra] : [digits];
    }
    return null;
  }

  function hide() {
    if (panel) panel.hidden = true;
    if (spacer) spacer.style.height = "0px";
    active = null;
    numberDraft = null;
  }

  function fit() {
    if (!active || !panel || panel.hidden) return;
    if (!active.isConnected || !eligible(active)) return hide();
    spacer.style.height = panel.getBoundingClientRect().height + "px";
    const field = active.getBoundingClientRect(), dock = panel.getBoundingClientRect();
    // Scroll the nearest scrolling container, then clear the dock if necessary.
    if (field.bottom > dock.top || field.top < 0) {
      active.scrollIntoView({ block: "center", behavior: "instant" });
      const bottom = active.getBoundingClientRect().bottom;
      if (bottom > dock.top - 8) window.scrollBy(0, bottom - dock.top + 8);
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
        const label = ({ backspace: "Backspace", mode: "aA1", hide: "Hide keyboard", " ": "Space", "\n": "Enter" })[key] || key;
        button.textContent = key === "backspace" ? "⌫" : key === "hide" ? "⌄" : label;
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
      panel.setAttribute("aria-label", "On-screen keyboard");
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
    if (!field?.isConnected || !eligible(field)) return hide();
    if (key === "hide") return hide();
    if (key === "mode") { mode = (mode + 1) % 3; return render(); }
    const value = field.type === "number" && numberDraft?.value === field.value ? numberDraft.raw : field.value;
    const container = field.closest(".msig-path-components");
    const componentIndex = field.dataset.pathIndex;
    // Number/email inputs have no selection API: append/delete at the end.
    let start = field.selectionStart ?? value.length;
    const end = field.selectionEnd ?? value.length;
    if (key === "backspace" && start === end) {
      start -= Array.from(value.slice(0, start)).pop()?.length || 0;
    }
    const text = key === "backspace" ? "" : key;
    const next = value.slice(0, start) + text + value.slice(end);
    if (field.type === "number" && !/^-?\d*\.?\d*$/.test(next)) return;
    if (text && field.maxLength >= 0 && next.length > field.maxLength) return;
    const inputType = key === "backspace" ? "deleteContentBackward" : "insertText";
    if (!field.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType, data: text || null }))) return;
    field.value = next;
    if (field.type === "number") numberDraft = { raw: next, value: field.value };
    if (field.selectionStart !== null) field.setSelectionRange(start + text.length, start + text.length);
    field.dispatchEvent(new InputEvent("input", { bubbles: true, inputType, data: text || null }));
    field.dispatchEvent(new Event("change", { bubbles: true }));
    // Upstream may replace a dynamic component on input: resolve within its
    // original container, never by a globally ambiguous component index.
    if (!field.isConnected) {
      const replacement = container?.querySelector(`[data-path-index="${CSS.escape(componentIndex || "")}"]`);
      if (!eligible(replacement)) return hide();
      active = replacement;
      replacement.focus({ preventScroll: true });
      replacement.setSelectionRange(start + text.length, start + text.length);
    }
  }

  document.addEventListener("focusin", event => {
    if (panel?.contains(event.target)) return;
    show(event.target);
  });
  document.addEventListener("click", event => {
    if (panel?.contains(event.target)) return;
    if (eligible(event.target)) {
      if (active !== event.target) show(event.target);
    } else hide();
  });
  document.addEventListener("keydown", event => { if (event.key === "Escape") hide(); });
  window.addEventListener("resize", fit);
})();
