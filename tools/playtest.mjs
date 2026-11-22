// Emberfall — end-to-end play test (development only, not part of the game).
// Drives the real game in headless Chromium over CDP with Node's built-in
// WebSocket: clicks Play, plays a full match with mouse + keyboard (click a
// card, Enter to confirm), and reports the screens reached, the final tally
// and every console error. Exits non-zero on any failure.
// Usage: node tools/playtest.mjs
import { spawn } from 'node:child_process';

const CHROME = `${process.env.HOME}/.cache/ms-playwright/chromium_headless_shell-1255/chrome-headless-shell-linux64/chrome-headless-shell`;
const PORT = 9223;
const GAME = 'http://localhost:8092/';

const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

async function main() {
  const server = spawn('node', ['serve.ts', '8092'], { cwd: new URL('..', import.meta.url).pathname, stdio: 'ignore' });
  const chrome = spawn(CHROME, [
    '--headless', '--disable-gpu', '--no-sandbox', '--window-size=1280,720',
    `--remote-debugging-port=${PORT}`, '--autoplay-policy=no-user-gesture-required', 'about:blank',
  ], { stdio: 'ignore' });
  const errors = [];
  try {
    await sleep(1500);
    // Navigate the initial about:blank target to the game with Page.navigate.
    const targets = await (await fetch(`http://localhost:${PORT}/json/list`)).json();
    const target = targets.find((candidate) => candidate.type === 'page');
    console.log('target:', JSON.stringify({ url: target?.url, ws: !!target?.webSocketDebuggerUrl }));
    if (!target?.webSocketDebuggerUrl) throw new Error(`no page target: ${JSON.stringify(targets).slice(0, 300)}`);
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolvePromise, rejectPromise) => {
      ws.onopen = resolvePromise;
      ws.onerror = rejectPromise;
    });
    let messageId = 0;
    const pending = new Map();
    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) {
        pending.get(message.id)(message);
        pending.delete(message.id);
      } else if (message.method === 'Runtime.exceptionThrown') {
        errors.push(`exception: ${JSON.stringify(message.params.exceptionDetails).slice(0, 400)}`);
      } else if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        errors.push(`console.error: ${message.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 300)}`);
      }
    };
    const send = (method, params = {}) => new Promise((resolvePromise) => {
      const id = ++messageId;
      pending.set(id, resolvePromise);
      ws.send(JSON.stringify({ id, method, params }));
    });
    const evaluate = async (expression) => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (result.result?.exceptionDetails) throw new Error(`evaluate failed: ${JSON.stringify(result.result.exceptionDetails).slice(0, 300)}`);
      return result.result?.result?.value;
    };
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.navigate', { url: GAME });
    // Wait for the page to finish loading before touching the DOM.
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const state = await send('Runtime.evaluate', { expression: `document.readyState + '|' + location.href`, returnByValue: true });
      const value = state.result?.result?.value ?? '';
      if (value.startsWith('complete|http')) break;
      await sleep(300);
    }
    console.log('ready:', await evaluate(`document.readyState + '|' + location.href`));
    await sleep(800);

    // Title screen is showing.
    const titleVisible = await evaluate(`!document.getElementById('screen-title').hidden && document.querySelector('.game-title').textContent`);
    console.log('title:', JSON.stringify(titleVisible));
    if (!titleVisible) throw new Error('title screen did not show');

    // Click Play with a real mouse event, then check the table appears.
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 640, y: 340, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 640, y: 340, button: 'left', clickCount: 1 });
    await sleep(600);
    const round1 = await evaluate(`!document.getElementById('screen-table').hidden && document.getElementById('round-label').textContent`);
    console.log('table after Play:', JSON.stringify(round1));
    if (!round1) throw new Error('table did not appear after Play');

    // Play rounds: click the first affordable card, then press Enter.
    let endScreen = null;
    for (let round = 0; round < 30; round += 1) {
      const state = await evaluate(`({
        tableHidden: document.getElementById('screen-table').hidden,
        winHidden: document.getElementById('screen-win').hidden,
        lossHidden: document.getElementById('screen-loss').hidden,
        round: document.getElementById('round-label').textContent,
        hand: document.querySelectorAll('#player-hand .card').length,
        favour: document.getElementById('favour-token').textContent,
        banner: document.getElementById('round-banner').textContent,
      })`);
      if (!state.winHidden) { endScreen = 'win'; break; }
      if (!state.lossHidden) { endScreen = 'loss'; break; }
      if (state.tableHidden) throw new Error(`no screen showing at round ${round}`);
      console.log(`round ${state.round} | hand ${state.hand} | ${state.favour.slice(0, 60)} | ${state.banner.slice(0, 70)}`);
      // Click the first affordable card (cost pips filled <= embers), then
      // press Enter to play it.
      const box = await evaluate(`(() => {
        const emberText = document.getElementById('player-embers').textContent;
        const embers = Number((emberText.match(/(\\d+)\\/5/) || [])[1] ?? 0);
        const cards = [...document.querySelectorAll('#player-hand .card')];
        const pick = cards.find((card) => {
          if (card.querySelector('.cost-free')) return true;
          const filled = card.querySelectorAll('.card-cost svg:not(.cost-off)').length;
          return filled <= embers;
        });
        if (!pick) return null;
        const rect = pick.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      })()`);
      if (!box) throw new Error('no cards in hand');
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
      await sleep(200);
      await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
      await sleep(2200);
    }
    const final = await evaluate(`({
      win: !document.getElementById('screen-win').hidden,
      loss: !document.getElementById('screen-loss').hidden,
      winTally: document.getElementById('win-tally').textContent,
      lossTally: document.getElementById('loss-tally').textContent,
    })`);
    console.log('end screen:', endScreen, '| final:', JSON.stringify(final));
    if (!endScreen) throw new Error('match did not end within 30 rounds');

    // Play again from the end screen, then concede to reach the other end.
    const againButton = endScreen === 'win' ? '#btn-again-win' : '#btn-again-loss';
    await evaluate(`document.querySelector(${JSON.stringify(againButton)}).click()`);
    await sleep(600);
    const restarted = await evaluate(`!document.getElementById('screen-table').hidden && document.getElementById('round-label').textContent`);
    console.log('play again:', JSON.stringify(restarted));
    if (!restarted) throw new Error('play again did not restart the table');
    await evaluate(`document.getElementById('btn-concede').click()`);
    await sleep(400);
    const conceded = await evaluate(`!document.getElementById('screen-loss').hidden`);
    console.log('concede reaches loss screen:', conceded);
    if (!conceded) throw new Error('concede did not reach the loss screen');

    // Keyboard path: start again, select with key 2, confirm with Enter.
    await evaluate(`document.getElementById('btn-again-loss').click()`);
    await sleep(600);
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: '2', code: 'Digit2', windowsVirtualKeyCode: 50 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: '2', code: 'Digit2', windowsVirtualKeyCode: 50 });
    await sleep(200);
    const selected = await evaluate(`document.querySelectorAll('#player-hand .card.selected').length`);
    console.log('keyboard select (key 2) selected cards:', selected);
    if (selected !== 1) throw new Error('keyboard select did not select exactly one card');
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
    await sleep(2200);
    const afterKey = await evaluate(`document.getElementById('round-label').textContent`);
    console.log('after keyboard play, round label:', JSON.stringify(afterKey));

    console.log(errors.length === 0 ? 'console errors: NONE' : `console errors:\n${errors.join('\n')}`);
    if (errors.length > 0) throw new Error(`${errors.length} console error(s)`);
    console.log('PLAYTEST PASS');
  } finally {
    chrome.kill();
    server.kill();
  }
}

main().catch((error) => {
  console.error('PLAYTEST FAIL:', error.message);
  process.exit(1);
});
