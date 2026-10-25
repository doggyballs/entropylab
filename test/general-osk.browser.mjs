// Focused real-browser regression checks; no additional dependencies.
// Run: node --test test/general-osk.browser.mjs (Chromium/Chrome required).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { once } from "node:events";

const read = path => readFileSync(new URL(path, import.meta.url), "utf8");

test("semantic kiosk editing, validation, dynamic fields and responsive geometry", { timeout: 60000 }, async t => {
  // Only translation is stubbed: the browser runs the shipped keyboard source.
  const source = read("../src/js/general-osk.js").replace('import { t as hodlTText } from "./i18n.js";', "const hodlTText = text => text;");
  const html = `<style>${read("../src/css/styles.css")}</style><body>
    <input id="plain"><input id="number" type="number" min="0"><textarea id="json"></textarea>
    <input id="key" data-general-osk="off"><input id="pass" type="password">
    <section data-general-osk="off"><input id="entropy-input" data-general-osk="text"></section>
    <input id="readonly" readonly><input id="disabled" disabled>
    <fieldset disabled><input id="fieldset-disabled"></fieldset>
    <section hidden><input id="hidden"></section><section inert><input id="inert"></section>
    <section data-on-screen-keyboard><input id="specialized"></section>
    <input id="password-text" type="password" data-general-osk="text">
    <input id="password-integer" type="password" data-general-osk="integer">
    <input id="integer" data-general-osk="integer" min="0">
    <input id="decimal" data-general-osk="decimal" min="0">
    <input id="path" data-general-osk="path"><input id="hex" data-general-osk="hex">
    <textarea id="hex-lines" data-general-osk="hex"></textarea>
    <textarea id="path-lines" data-general-osk="path"></textarea>
    <input id="numeric-mode" inputmode="numeric" min="0">
    <input id="decimal-mode" inputmode="decimal" min="0"><input id="telephone" type="tel">
    <input id="none-mode" inputmode="none"><input id="unknown" data-general-osk="unknown">
    <button id="outside" type="button">Outside</button>
    <script>
      window.oskListeners = [];
      const originalAdd = EventTarget.prototype.addEventListener;
      EventTarget.prototype.addEventListener = function(type, ...args) {
        oskListeners.push(type); return originalAdd.call(this, type, ...args);
      };
    </script>
    <script>${source}</script>
    <script>EventTarget.prototype.addEventListener = originalAdd;</script>`;
  const directory = mkdtempSync(join(homedir(), "osk-test-"));
  const fixture = join(directory, "fixture.html");
  writeFileSync(fixture, html);
  let browser;
  t.after(async () => {
    if (browser?.pid && browser.exitCode === null && browser.signalCode === null) {
      const exited = once(browser, "exit");
      browser.kill();
      await exited;
    }
    rmSync(directory, { recursive: true, force: true });
  });
  browser = spawn(process.env.CHROME_BINARY || "chromium", ["--headless", "--no-sandbox", "--disable-dev-shm-usage", "--remote-debugging-port=0", `--user-data-dir=${join(directory, "profile")}`, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  const endpoint = await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error("Chromium did not start: " + output)), 15000);
    browser.on("error", error => { clearTimeout(timer); reject(error); });
    browser.stderr.on("data", chunk => {
      output += chunk;
      const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) { clearTimeout(timer); resolve(match[1]); }
    });
  });
  const origin = endpoint.replace(/^ws:/, "http:").split("/devtools/")[0];
  const targets = await (await fetch(origin + "/json/list")).json();
  const ws = new WebSocket(targets.find(target => target.type === "page").webSocketDebuggerUrl);
  await once(ws, "open");
  t.after(() => ws.close());
  let sequence = 0;
  const pending = new Map();
  ws.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error))); else resolve(message.result);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method} ${JSON.stringify(params).slice(0,150)}`)); }, 8000);
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    ws.send(JSON.stringify({ id, method, params }));
  });
  await send("Page.bringToFront");
  const evaluate = async expression => {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const url = pathToFileURL(fixture).href;
  async function load(query) {
    await send("Page.navigate", { url: url + query });
    for (let attempt = 0; attempt < 100; attempt++) {
      if (await evaluate(`location.href === ${JSON.stringify(url + query)} && document.readyState === 'complete'`)) return;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error("Fixture did not load");
  }
  for (const query of ["", "?osk=0", "?osk=true", "?osk=01"]) {
    await load(query);
    assert.equal(await evaluate(`document.querySelector('#plain').focus(); !!document.querySelector('#general-osk')`), false);
    assert.deepEqual(await evaluate("oskListeners"), [], "ordinary loads install no keyboard listeners");
  }
  await load("?osk=1");
  await evaluate(`
    window.field = id => document.getElementById(id);
    window.hasKey = k => [...document.querySelectorAll('[data-general-key]')].some(b => b.dataset.generalKey === k);
    window.key = k => {
      const b = [...document.querySelectorAll('[data-general-key]')].find(b => b.dataset.generalKey === k);
      if (!b) throw Error('Missing key '+k); b.click();
    };
    window.fresh = (attributes = {}) => {
      const f = document.createElement('input');
      for (const [name, value] of Object.entries(attributes)) f.setAttribute(name, value);
      document.body.append(f); f.focus(); return f;
    };
    field('plain').focus();
  `);
  assert.equal(await evaluate(`!field('general-osk').hidden`), true);
  assert.equal(await evaluate(`key('a'); key('b'); field('plain').setSelectionRange(0,1); key('c'); field('plain').value`), "cb");
  assert.equal(await evaluate(`key('backspace'); field('plain').value`), "b");
  assert.equal(await evaluate(`field('plain').value='a😀b'; field('plain').setSelectionRange(3,3); key('backspace'); field('plain').value`), "ab");
  assert.equal(await evaluate(`field('number').focus(); key('1'); key('2'); key('backspace'); field('number').value`), "1");
  assert.equal(await evaluate(`hasKey('a') || hasKey('.') || hasKey('-')`), false);
  assert.equal(await evaluate(`field('json').focus(); key('mode'); key('A'); key('mode'); key('"'); key('{'); key('\\n'); field('json').value`), 'A"{\n');

  for (const id of ["key", "pass", "entropy-input", "readonly", "disabled", "fieldset-disabled", "hidden", "inert", "specialized", "password-integer", "none-mode", "unknown"]) {
    assert.equal(await evaluate(`
      field('plain').focus();
      field('${id}').dispatchEvent(new FocusEvent('focusin', {bubbles:true}));
      field('general-osk').hidden;
    `), true, `${id} must not open the general keyboard`);
  }
  assert.equal(await evaluate(`field('password-text').focus(); key('a'); field('password-text').value`), "a");
  for (const id of ["integer", "numeric-mode"]) {
    assert.deepEqual(await evaluate(`field('${id}').focus(); [hasKey('1'),hasKey('a'),hasKey('.'),hasKey('-')]`), [true, false, false, false]);
  }
  for (const id of ["decimal", "decimal-mode"]) {
    assert.deepEqual(await evaluate(`field('${id}').focus(); [hasKey('1'),hasKey('.'),hasKey('a'),hasKey('-')]`), [true, true, false, false]);
  }
  assert.equal(await evaluate(`field('path').focus(); key('m'); key('/'); key('1'); key("'"); field('path').value`), "m/1'");
  assert.equal(await evaluate(`hasKey('a') || hasKey('.')`), false);
  assert.equal(await evaluate(`
    field('path').value='';
    for (const character of "m/84'/0'/0'/{0-1}/{0-9}") key(character);
    field('path').value;
  `), "m/84'/0'/0'/{0-1}/{0-9}", "the path layout covers the v1 BIP-88 template grammar");
  assert.equal(await evaluate(`field('path').value=''; key('1'); key('h'); key('/'); key('2'); key('H'); field('path').value`), "1h/2H");
  assert.equal(await evaluate(`field('hex').focus(); key('f'); key('0'); hasKey('g') || hasKey(' ') || field('hex').value !== 'f0'`), false);
  for (const id of ["hex-lines", "path-lines"]) {
    assert.equal(await evaluate(`field('${id}').focus(); key('1'); key(' '); key('2'); key('\\n'); field('${id}').value`), "1 2\n");
  }
  assert.equal(await evaluate(`field('telephone').focus(); key('+'); key('1'); key('*'); key('#'); field('telephone').value`), "+1*#");
  assert.equal(await evaluate(`window.f=fresh({'data-general-osk':'text',inputmode:'numeric'}); key('z'); f.value`), "z", "explicit text overrides inputmode");
  assert.equal(await evaluate(`f.id='entropy-input'; f.className='msig-path-component-input'; key('a'); f.value`), "za", "application identities cannot restrict the engine");

  // Native selection and maxlength semantics, including replacement at the limit.
  assert.equal(await evaluate(`f.maxLength=2; key('a'); f.value`), "za");
  assert.equal(await evaluate(`f.setSelectionRange(0,1); key('b'); f.value`), "ba");
  assert.equal(await evaluate(`f.setSelectionRange(0,2); key('backspace'); f.value`), "");
  assert.equal(await evaluate(`f.addEventListener('beforeinput',e=>e.preventDefault(),{once:true}); key('a'); f.value`), "");
  assert.deepEqual(await evaluate(`
    window.events=[];
    for (const type of ['beforeinput','input','change']) f.addEventListener(type,e=>events.push([e.type,e.inputType||null,e.data??null]));
    key('c'); events;
  `), [["beforeinput", "insertText", "c"], ["input", "insertText", "c"], ["change", null, null]]);
  for (const type of ["search", "email", "url"]) {
    assert.equal(await evaluate(`window.f=fresh({type:'${type}'}); key('a'); key('b'); key('backspace'); f.value`), "a", `${type} supports ordinary text editing`);
  }
  assert.equal(await evaluate(`
    window.f=fresh({type:'number',step:'any'}); key('1'); key('.'); key('.'); key('-'); key('5'); f.value;
  `), "1.5", "invalid numeric key combinations cannot destroy a draft");

  // beforeinput is an application veto point, not permission to overwrite a
  // validator's later rewrite, selection change, lock, or DOM replacement.
  for (const mutation of [
    "f.readOnly=true", "f.disabled=true", "f.remove()",
    "f.value='validator'", "f.setSelectionRange(0,0)",
    "f.maxLength=0", "f.type='number'", "f.dataset.generalOsk='off'",
    "f.dataset.generalOsk='integer'", "field('plain').focus()",
    "f.replaceWith(f.cloneNode())", "f.setAttribute('min','0')",
    "f.setAttribute('step','0.1')", "f.parentElement.dataset.generalOsk='off'",
  ]) {
    const result = await evaluate(`
      window.f=fresh(); f.value='x'; f.setSelectionRange(1,1); window.changes=0;
      f.addEventListener('input',()=>changes++); f.addEventListener('change',()=>changes++);
      f.addEventListener('beforeinput',()=>{${mutation}},{once:true});
      key('a'); ({changes, value:f.value});
    `);
    assert.equal(result.changes, 0, `no edit events after ${mutation}`);
    assert.notEqual(result.value, "xa", `no stale write after ${mutation}`);
    await evaluate(`delete document.body.dataset.generalOsk`);
  }
  for (const mutation of ["f.disabled=true", "f.readOnly=true", "f.remove()"]) {
    assert.deepEqual(await evaluate(`
      window.f=fresh(); f.value='safe'; ${mutation}; key('a');
      [f.value,field('general-osk').hidden];
    `), ["safe", true]);
  }
  assert.equal(await evaluate(`
    window.f=fresh({type:'number',step:'any'}); key('-'); key('1'); key('.'); key('5'); f.value;
  `), "-1.5");
  assert.equal(await evaluate(`key('backspace'); key('2'); f.value`), "-1.2");
  assert.equal(await evaluate(`
    window.f=fresh({type:'number',step:'0.1',min:'0'}); key('1'); key('.'); f.value;
  `), "1", "a trailing decimal must not erase the preceding digits");
  assert.equal(await evaluate(`key('5'); f.value`), "1.5");
  assert.deepEqual(await evaluate(`
    window.f=fresh({type:'number',min:'0.5',max:'2.5'}); key('0'); key('.'); key('5');
    [hasKey('.'),hasKey('-'),f.value,f.checkValidity()];
  `), [true, false, "0.5", true], "fractional min supplies the native default step base");
  assert.deepEqual(await evaluate(`
    window.f=fresh({type:'number',min:'10',max:'20',step:'2'}); key('1');
    const draft=[f.value,f.validity.rangeUnderflow]; key('2');
    [...draft,f.value,f.checkValidity()];
  `), ["1", true, "12", true], "min and step must not clamp a partially entered number");
  assert.deepEqual(await evaluate(`key('backspace'); key('3'); [f.value,f.validity.stepMismatch]`), ["13", true]);
  assert.deepEqual(await evaluate(`key('9'); [f.value,f.validity.rangeOverflow]`), ["139", true]);
  assert.equal(await evaluate(`
    window.f=fresh({type:'number',step:'any'}); key('-');
    f.dispatchEvent(new InputEvent('input',{bubbles:true,inputType:'deleteContentBackward'}));
    key('2'); f.value;
  `), "2", "external input must discard even an identically sanitized draft");

  // CDP inserts text using Chromium's actual editing path, not our event shim.
  await evaluate(`window.f=fresh({type:'number',step:'any'}); key('1'); key('.');`);
  await send("Input.insertText", { text: "2" });
  assert.equal(await evaluate(`key('3'); f.value`), "123", "real typing invalidates a stale decimal draft");
  assert.equal(await evaluate(`
    window.f=fresh({type:'number',step:'any'}); key('-'); f.value='8'; key('2'); f.value;
  `), "82", "a programmatic value rewrite must discard the old draft");

  assert.equal(await evaluate(`
    window.components=[];
    for(let i=0;i<2;i++) {
      const c=document.createElement('div'); c.dataset.generalOskScope='';
      const f=document.createElement('input'); f.dataset.generalOsk='integer'; f.min='0'; f.dataset.generalOskKey='index';
      c.append(f); document.body.append(c); components.push(c);
      c.addEventListener('input', e => { const clone=e.target.cloneNode(); clone.value=e.target.value; c.replaceChildren(clone); });
    }
    components[1].firstChild.focus(); key('1'); key('2');
    JSON.stringify(components.map(c=>c.firstChild.value));
  `), '["","12"]', "rerenders resolve only within the original semantic scope");
  assert.equal(await evaluate(`
    window.f=fresh(); f.addEventListener('input',()=>f.replaceWith(f.cloneNode()),{once:true});
    key('a'); field('general-osk').hidden;
  `), true, "unkeyed replacements must not inherit edit authority");
  assert.equal(await evaluate(`
    const c=document.createElement('div'); c.dataset.generalOskScope=''; document.body.append(c);
    const f=document.createElement('input'); f.dataset.generalOskKey='duplicate'; c.append(f); f.focus();
    f.addEventListener('input',()=>c.replaceChildren(f.cloneNode(),f.cloneNode()),{once:true});
    key('a'); field('general-osk').hidden;
  `), true, "ambiguous replacement keys must not redirect typing");
  assert.equal(await evaluate(`field('plain').focus(); key('hide'); field('general-osk').hidden`), true);
  assert.equal(await evaluate(`field('plain').click(); !field('general-osk').hidden`), true, "click reopens an already focused field");
  assert.equal(await evaluate(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})); field('general-osk').hidden`), true);
  assert.equal(await evaluate(`field('plain').click(); field('outside').click(); field('general-osk').hidden`), true);
  for (const [width, height] of [[320, 640], [480, 800], [800, 480], [1024, 600], [1920, 1080]]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
    for (const id of ["plain", "number", "json"]) {
      await evaluate(`field('${id}').focus(); new Promise(resolve => requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
      assert.equal(await evaluate(`(()=>{const p=field('general-osk'), r=p.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1 && p.scrollWidth <= p.clientWidth && [...p.querySelectorAll('button')].every(b=>{const r=b.getBoundingClientRect(); return r.left>=0 && r.right<=innerWidth+1;});})()`), true, `${id}: horizontal clipping at ${width}`);
    }
  }
  // A genuine touch sequence must insert once without stealing field focus.
  await evaluate(`field('plain').value=''; field('plain').focus()`);
  const point = await evaluate(`(()=>{const r=[...document.querySelectorAll('[data-general-key]')].find(b=>b.dataset.generalKey==='a').getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  await send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [point] });
  await send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  assert.equal(await evaluate(`field('plain').value`), "a");
  assert.equal(await evaluate(`document.activeElement.id`), "plain");
});
