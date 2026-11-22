// Emberfall — boot and the game flow. The screen machine (title -> table ->
// win/loss), the round loop, the ?shot= staging for screenshots, and the
// stage scaling. Turn-based, so the loop is light: it only drifts embers and
// keeps the stage fitted to the window. All rules live in rules.js, all
// painting in render.js — this file only wires them together.
//
// ?seed=N fixes the shuffle. ?shot=title|table|win|loss (with &seed=N)
// stages that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { BEST_KEY, STAGE_HEIGHT, STAGE_WIDTH } from './config.js';
import { createMatch, beginRound, sortedHand, canAfford } from './state.js';
import { chooseCard } from './warden.js';
import { matchWinner, resolveRound } from './rules.js';
import { renderTable, renderTitle, renderEndScreen, renderArenaSlot, renderArenaBack, setBanner } from './render.js';
import { createInput } from './input.js';
import { createParticles, dealCard, flipCard, resolvePop, floatDamage, shakeStage, goldFlash } from './anim.js';
import { sounds, unlockAudio, setMuted, isMuted, watchVisibility } from './audio.js';
import { stageShot } from './shots.js';

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const stage = document.getElementById('stage');
const status = document.getElementById('status');
const screens = {
  title: document.getElementById('screen-title'),
  table: document.getElementById('screen-table'),
  win: document.getElementById('screen-win'),
  loss: document.getElementById('screen-loss'),
};
const particles = createParticles(document.getElementById('fx'));

function showScreen(name) {
  for (const [key, element] of Object.entries(screens)) {
    element.hidden = key !== name;
  }
}

function announce(message) {
  status.textContent = message;
}

// Fit the fixed 1280x720 stage into the window, centred, keeping the aspect.
function fitStage() {
  const scale = Math.min(window.innerWidth / STAGE_WIDTH, window.innerHeight / STAGE_HEIGHT);
  stage.style.transform = `scale(${scale})`;
  stage.style.marginLeft = `${Math.max(0, (window.innerWidth - STAGE_WIDTH * scale) / 2)}px`;
  stage.style.marginTop = `${Math.max(0, (window.innerHeight - STAGE_HEIGHT * scale) / 2)}px`;
}
window.addEventListener('resize', fitStage);
fitStage();

function readBest() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(BEST_KEY) ?? 'null');
    if (parsed && Number.isInteger(parsed.rank) && Number.isInteger(parsed.rounds)) return parsed;
  } catch {
    // Storage can be off: the best result then lasts this visit only.
  }
  return null;
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, JSON.stringify(value));
  } catch {
    // See readBest.
  }
}

function runShot(name) {
  const scene = stageShot(name, seed);
  if (scene.screen === 'title') {
    renderTitle(scene.best, scene.sampleCards);
    showScreen('title');
  } else if (scene.screen === 'table') {
    showScreen('table');
    renderTable(scene.state, { selected: -1, phase: 'choose' });
    if (scene.arena) {
      renderArenaSlot('player-slot', scene.arena.player);
      renderArenaSlot('warden-slot', scene.arena.warden);
    }
    if (scene.banner) setBanner(scene.banner);
  } else if (scene.screen === 'win') {
    renderEndScreen('win', scene.state);
    showScreen('win');
  } else {
    renderEndScreen('loss', scene.state);
    showScreen('loss');
  }
  let painted = 0;
  function paint() {
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput();
  const ui = { selected: -1, deal: false, paused: false };
  let state = null;
  let rank = 1;
  let best = readBest();
  let resolving = false;

  function updateMuteButtons() {
    const label = isMuted() ? 'Sound: off' : 'Sound: on';
    document.getElementById('btn-mute').textContent = label;
    document.getElementById('btn-mute-title').textContent = label;
  }
  updateMuteButtons();
  watchVisibility();

  function render() {
    if (!state) return;
    renderTable(state, ui);
    if (ui.deal) {
      const hand = document.getElementById('player-hand');
      [...hand.children].forEach((card, index) => dealCard(card, index * 90));
      ui.deal = false;
    }
  }

  function startMatch() {
    state = createMatch(Math.floor(Math.random() * 4294967296), rank);
    ui.selected = -1;
    input.setSelected(-1);
    ui.paused = false;
    document.getElementById('pause-veil').hidden = true;
    resolving = false;
    beginRound(state);
    showScreen('table');
    renderArenaSlot('player-slot', null);
    renderArenaSlot('warden-slot', null);
    setBanner('Choose a card — the Warden has shown its favour.');
    ui.deal = true;
    render();
    announce(`Round 1. The Warden favours ${state.favour}. Choose a card.`);
  }

  function endMatch(winner) {
    state.winner = winner;
    if (winner === 'player') {
      const result = { rank, rounds: state.round };
      if (!best || rank > best.rank || (rank === best.rank && state.round < best.rounds)) {
        best = result;
        saveBest(best);
      }
      renderEndScreen('win', state);
      showScreen('win');
      sounds.win();
      goldFlash(stage);
      particles.burst(640, 360, 42);
      document.getElementById('btn-again-win').focus();
      announce(`You win in ${state.round} rounds. The lantern is yours.`);
      rank = Math.min(5, rank + 1);
    } else {
      renderEndScreen('loss', state);
      showScreen('loss');
      sounds.lose();
      document.getElementById('btn-again-loss').focus();
      announce('You lose. The Warden keeps the bridge tonight.');
    }
  }

  function playSelectedCard() {
    if (!state || state.phase !== 'choose' || resolving) return;
    const hand = sortedHand(state.player.hand);
    const index = ui.selected;
    if (index < 0 || index >= hand.length) {
      setBanner('Select a card first — click one, or press 1–7.');
      return;
    }
    const card = hand[index];
    if (!canAfford(state.player, card)) {
      sounds.denied();
      setBanner(`${card.name} costs ${card.cost} embers — you have ${state.player.embers}. Bank embers or play cheaper.`);
      return;
    }
    resolving = true;
    state.player.embers -= card.cost;
    state.player.played = card;
    state.player.hand = state.player.hand.filter((held) => held.instance !== card.instance);
    const wardenCard = chooseCard(state, state.favour, state.random);
    if (!wardenCard) {
      state.deckOut = true;
      endMatch(matchWinner(state));
      return;
    }
    state.warden.embers -= wardenCard.cost;
    state.warden.played = wardenCard;
    state.warden.hand = state.warden.hand.filter((held) => held.instance !== wardenCard.instance);
    state.phase = 'resolving';
    ui.selected = -1;
    input.setSelected(-1);
    render();
    // The cards are dealt face-down and flip over, as promised on the
    // title: the flip finishes inside the 750ms before the round resolves.
    renderArenaBack('player-slot');
    renderArenaBack('warden-slot');
    sounds.flip();
    setTimeout(() => {
      flipCard(document.querySelector('#player-slot .card'), () => renderArenaSlot('player-slot', card));
      flipCard(document.querySelector('#warden-slot .card'), () => renderArenaSlot('warden-slot', wardenCard));
    }, 120);
    setBanner(`${card.name} meets ${wardenCard.name}…`);

    setTimeout(() => {
      const report = resolveRound(state);
      const playerSlot = document.querySelector('#player-slot .card');
      const wardenSlot = document.querySelector('#warden-slot .card');
      if (report.winner === 'player') {
        resolvePop(playerSlot, wardenSlot);
        sounds.damage();
        floatDamage(document.getElementById('warden-slot'), `−${report.damage}`);
        if (report.damage >= 4) shakeStage(stage);
      } else if (report.winner === 'warden') {
        resolvePop(wardenSlot, playerSlot);
        sounds.damage();
        floatDamage(document.getElementById('player-slot'), `−${report.damage}`);
        if (report.damage >= 4) shakeStage(stage);
      } else {
        sounds.trick();
      }
      if (report.events.some((line) => line.includes('attuned'))) sounds.trick();
      const banner = report.winner === 'player'
        ? `${card.name} (${report.playerPower}) beats ${wardenCard.name} (${report.wardenPower}) — ${report.damage} flame${report.damage === 1 ? '' : 's'} snuffed!`
        : report.winner === 'warden'
          ? `${wardenCard.name} (${report.wardenPower}) beats ${card.name} (${report.playerPower}) — the Warden snuffs ${report.damage} flame${report.damage === 1 ? '' : 's'}.`
          : `${card.name} (${report.playerPower}) meets ${wardenCard.name} (${report.wardenPower}) — evenly matched.`;
      setBanner(banner);
      render();
      announce(banner);

      setTimeout(() => {
        const winner = matchWinner(state);
        if (winner) {
          endMatch(winner);
          resolving = false;
          return;
        }
        if (!beginRound(state)) {
          endMatch(matchWinner(state));
          resolving = false;
          return;
        }
        state.phase = 'choose';
        renderArenaSlot('player-slot', null);
        renderArenaSlot('warden-slot', null);
        setBanner('Choose a card — the Warden has shown its favour.');
        ui.deal = true;
        render();
        resolving = false;
        announce(`Round ${state.round}. The Warden favours ${state.favour}.`);
      }, 950);
    }, 750);
  }

  function togglePause() {
    if (!state || screens.table.hidden) return;
    ui.paused = !ui.paused;
    document.getElementById('pause-veil').hidden = !ui.paused;
    announce(ui.paused ? 'Paused.' : 'Playing.');
  }

  function toggleMute() {
    setMuted(!isMuted());
    updateMuteButtons();
  }

  input.onSelect((index) => {
    if (!state || state.phase !== 'choose' || resolving) return;
    const hand = sortedHand(state.player.hand);
    if (index >= hand.length) return;
    ui.selected = index;
    sounds.hover();
    render();
  });
  input.onConfirm(() => {
    unlockAudio();
    playSelectedCard();
  });
  input.onPause(() => togglePause());
  input.onMute(() => toggleMute());

  // Select on pointer press, not on click: the deal animation moves cards
  // under the pointer, and a press-and-release that land on different
  // elements fires no click at all — a press always lands on the card.
  document.getElementById('player-hand').addEventListener('pointerdown', (event) => {
    unlockAudio();
    const card = event.target.closest('.card');
    if (!card || !card.dataset.handIndex) return;
    // A press on a card selects it; a press on the already-selected card
    // confirms it. The input handlers do the work (select renders, confirm plays).
    input.clickCard(Number.parseInt(card.dataset.handIndex, 10));
  });
  document.getElementById('player-hand').addEventListener('mouseover', (event) => {
    if (event.target.closest('.card')) sounds.hover();
  });

  document.getElementById('btn-play').addEventListener('click', () => {
    unlockAudio();
    sounds.select();
    startMatch();
  });
  document.getElementById('btn-again-win').addEventListener('click', () => {
    unlockAudio();
    startMatch();
  });
  document.getElementById('btn-again-loss').addEventListener('click', () => {
    unlockAudio();
    startMatch();
  });
  document.getElementById('btn-concede').addEventListener('click', () => {
    if (!state || resolving) return;
    state.player.life = 0;
    endMatch('warden');
  });
  document.getElementById('btn-mute').addEventListener('click', () => {
    unlockAudio();
    toggleMute();
  });
  document.getElementById('btn-mute-title').addEventListener('click', () => {
    unlockAudio();
    toggleMute();
  });

  // Leaving the tab pauses a running game rather than letting it sit unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && state && !screens.table.hidden && !ui.paused) togglePause();
  });

  renderTitle(best, [
    { id: 'cinder-spark', name: 'Cinder Spark', suit: 'ember', power: 2, cost: 0, trick: null, instance: 'cinder-spark#1' },
    { id: 'tempest-bell', name: 'Tempest Bell', suit: 'gale', power: 8, cost: 3, trick: 'undertow', instance: 'tempest-bell#1' },
    { id: 'old-mountain', name: 'Old Mountain', suit: 'stone', power: 9, cost: 3, trick: null, instance: 'old-mountain#1' },
  ]);
  showScreen('title');
  announce('Emberfall. Duel of the Lantern Keepers. Press Enter or click Play to start.');

  // Ambient embers drift up from the title lantern while the title shows.
  (function drift() {
    if (!screens.title.hidden) particles.drift(640, 560);
    requestAnimationFrame(drift);
  })();
}

if (shot) runShot(shot);
else runGame();
