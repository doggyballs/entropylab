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

test("kiosk opt-in, editing, exclusions, dynamic fields and responsive geometry", { timeout: 45000 }, async t => {
  const html = `<style>${read("../src/css/styles.css")}</style><body><input id="plain"><input id="number" type="number" min="0"><textarea id="json"></textarea><input id="key"><input id="pass"><input id="entropy-input"><input id="readonly" readonly><script>${read("../src/js/general-osk.js")}</script>`;
  const directory = mkdtempSync(join(homedir(), "osk-test-"));
  const fixture = join(directory, "fixture.html");
  writeFileSync(fixture, html);
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const browser = spawn(process.env.CHROME_BINARY || "chromium", ["--headless", "--no-sandbox", "--disable-dev-shm-usage", "--remote-debugging-port=0", `--user-data-dir=/tmp/entropylab-osk-test-${process.pid}`, "about:blank"], { stdio: ["ignore", "ignore", "pipe"] });
  t.after(() => browser.kill());
  const endpoint = await new Promise((resolve, reject) => {
    let output = "";
    const timer = setTimeout(() => reject(new Error("Chromium did not start: " + output)), 15000);
    browser.on("error", reject);
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
  await load("");
  assert.equal(await evaluate(`document.querySelector('#plain').focus(); !!document.querySelector('#general-osk')`), false);
  await load("?osk=1");
  await evaluate(`window.field = id => document.getElementById(id); window.key = k => { const b = [...document.querySelectorAll('[data-general-key]')].find(b => b.dataset.generalKey === k); if (!b) throw Error('Missing key '+k); b.click(); }; field('plain').focus();`);
  assert.equal(await evaluate(`!!field('general-osk')`), true, await evaluate(`JSON.stringify({focus:document.activeElement.outerHTML,body:document.body.innerHTML.slice(0,800),url:location.href})`));
  assert.equal(await evaluate(`key('a'); key('b'); field('plain').setSelectionRange(0,1); key('c'); field('plain').value`), "cb");
  assert.equal(await evaluate(`key('backspace'); field('plain').value`), "b");
  assert.equal(await evaluate(`field('number').focus(); key('1'); key('2'); key('backspace'); field('number').value`), "1");
  assert.equal(await evaluate(`!![...document.querySelectorAll('[data-general-key]')].find(b=>b.dataset.generalKey==='a')`), false);
  assert.equal(await evaluate(`field('json').focus(); key('mode'); key('A'); key('mode'); key('"'); key('{'); key('\\n'); field('json').value`), 'A"{\n');
  assert.equal(await evaluate(`field('key').focus(); field('general-osk').hidden`), true);
  assert.equal(await evaluate(`field('pass').focus(); field('general-osk').hidden`), true);
  assert.equal(await evaluate(`field('entropy-input').focus(); field('general-osk').hidden`), true);
  assert.equal(await evaluate(`window.newField=document.createElement('input'); document.body.append(newField); newField.focus(); key('z'); newField.value`), "z");
  assert.equal(await evaluate(`newField.maxLength=1; key('a'); newField.value`), "z");
  assert.equal(await evaluate(`newField.maxLength=10; newField.addEventListener('beforeinput',e=>e.preventDefault(),{once:true}); key('a'); newField.value`), "z");
  assert.equal(await evaluate(`window.decimal=document.createElement('input'); decimal.type='number'; decimal.step='any'; document.body.append(decimal); decimal.focus(); key('-'); key('1'); key('.'); key('5'); decimal.value`), "-1.5");
  assert.equal(await evaluate(`field('readonly').focus(); field('general-osk').hidden`), true);
  assert.equal(await evaluate(`
    window.components=[];
    for(let i=0;i<2;i++) {
      const c=document.createElement('div'); c.className='msig-path-components';
      const f=document.createElement('input'); f.className='msig-path-component-input'; f.dataset.pathIndex='0';
      c.append(f); document.body.append(c); components.push(c);
      c.addEventListener('input', e => { const clone=e.target.cloneNode(); clone.value=e.target.value; c.replaceChildren(clone); });
    }
    components[1].firstChild.focus(); key('1'); key('2');
    JSON.stringify(components.map(c=>c.firstChild.value));
  `), '["","12"]');
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
