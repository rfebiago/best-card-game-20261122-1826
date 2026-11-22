// Debug probe: what is under the click point in round 2, and does the
// pointerdown handler fire? (Development only.)
import { spawn } from 'node:child_process';

const CHROME = `${process.env.HOME}/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell`;
const PORT = 9224;
const GAME = 'http://localhost:8093/';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const server = spawn('node', ['serve.ts', '8093'], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
  const chrome = spawn(CHROME, ['--headless', '--disable-gpu', '--no-sandbox', '--window-size=1280,720', `--remote-debugging-port=${PORT}`, 'about:blank'], { stdio: 'ignore' });
  try {
    await sleep(1500);
    const targets = await (await fetch(`http://localhost:${PORT}/json/list`)).json();
    const target = targets.find((c) => c.type === 'page');
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0;
    const pending = new Map();
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    };
    const send = (method, params = {}) => new Promise((res) => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
    const ev = async (expr) => {
      const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
      if (r.result?.exceptionDetails) throw new Error(JSON.stringify(r.result.exceptionDetails).slice(0, 300));
      return r.result?.result?.value;
    };
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.navigate', { url: GAME });
    for (let i = 0; i < 20; i++) {
      const s = await send('Runtime.evaluate', { expression: `document.readyState`, returnByValue: true });
      if (s.result?.result?.value === 'complete') break;
      await sleep(300);
    }
    await sleep(800);
    await ev(`window.__hits = []; document.getElementById('player-hand').addEventListener('pointerdown', (e) => window.__hits.push(e.target.tagName + '.' + (e.target.className.baseVal ?? e.target.className)), true)`);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 640, y: 340, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 640, y: 340, button: 'left', clickCount: 1 });
    await sleep(600);
    console.log('round:', await ev(`document.getElementById('round-label').textContent`));
    // Play round 1 by clicking the first affordable card.
    const pick1 = await ev(`(() => {
      const cards = [...document.querySelectorAll('#player-hand .card')];
      const embers = Number((document.getElementById('player-embers').textContent.match(/(\\d+)\\/5/) || [])[1] ?? 0);
      const pick = cards.find((c) => c.querySelector('.cost-free') || c.querySelectorAll('.card-cost svg:not(.cost-off)').length <= embers);
      const r = pick.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, name: pick.querySelector('.card-name').textContent };
    })()`);
    console.log('pick1:', JSON.stringify(pick1));
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: pick1.x, y: pick1.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: pick1.x, y: pick1.y, button: 'left', clickCount: 1 });
    await sleep(300);
    console.log('after press 1: selected =', await ev(`document.querySelectorAll('#player-hand .card.selected').length`), 'hits =', JSON.stringify(await ev(`window.__hits`)));
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await sleep(2200);
    console.log('round now:', await ev(`document.getElementById('round-label').textContent`));
    // Now round 2: what is at the click point?
    const probe = await ev(`(() => {
      const cards = [...document.querySelectorAll('#player-hand .card')];
      const embers = Number((document.getElementById('player-embers').textContent.match(/(\\d+)\\/5/) || [])[1] ?? 0);
      const pick = cards.find((c) => c.querySelector('.cost-free') || c.querySelectorAll('.card-cost svg:not(.cost-off)').length <= embers);
      const r = pick.getBoundingClientRect();
      const x = r.left + r.width / 2, y = r.top + r.height / 2;
      const at = document.elementFromPoint(x, y);
      return { x, y, name: pick.querySelector('.card-name').textContent, atPoint: at ? at.tagName + '.' + (at.className.baseVal ?? at.className) : 'none', handChildren: cards.length, stageTransform: getComputedStyle(document.getElementById('stage')).transform };
    })()`);
    console.log('probe round 2:', JSON.stringify(probe));
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: probe.x, y: probe.y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: probe.x, y: probe.y, button: 'left', clickCount: 1 });
    await sleep(300);
    console.log('after press 2: selected =', await ev(`document.querySelectorAll('#player-hand .card.selected').length`), 'hits =', JSON.stringify(await ev(`window.__hits`)));
  } finally {
    chrome.kill();
    server.kill();
  }
}
main().catch((e) => { console.error('DEBUG FAIL:', e.message); process.exit(1); });
