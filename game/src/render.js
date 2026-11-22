// Emberfall — the table renderer. It owns the DOM: it builds card elements,
// paints life, embers, hands, the arena and the log from the match state, and
// nothing else touches the page. The state stays the single source of truth;
// this file only shows it.
import { LIFE_START, SUITS, TRICK_TEXT } from './config.js';
import { DESIGN_BY_ID } from './cards.js';
import { suitThatBeats } from './rules.js';
import { sortedHand } from './state.js';

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function glyphSvg(glyphId) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#${glyphId}`);
  svg.appendChild(use);
  return svg;
}

// One face-up card. Cost is flame pips (filled = cost, hollow = the rest up
// to 3; a cost-0 card says FREE), power is the big numeral, the suit is a
// coloured band plus a glyph plus a name — colour and shape, never text alone.
export function buildCardElement(card, options = {}) {
  const suit = SUITS[card.suit];
  const node = element('div', `card suit-${card.suit}`);
  node.dataset.instance = card.instance;
  node.appendChild(element('div', 'card-band'));
  const top = element('div', 'card-top');
  const cost = element('span', 'card-cost');
  if (card.cost === 0) {
    cost.appendChild(element('span', 'cost-free', 'FREE'));
  } else {
    for (let pip = 0; pip < 3; pip += 1) {
      const flame = glyphSvg('glyph-flame');
      if (pip >= card.cost) flame.classList.add('cost-off');
      cost.appendChild(flame);
    }
  }
  top.appendChild(cost);
  top.appendChild(element('span', 'card-suit-name', suit.name.toUpperCase()));
  node.appendChild(top);
  const glyph = element('div', 'card-glyph');
  glyph.appendChild(glyphSvg(suit.glyph));
  node.appendChild(glyph);
  node.appendChild(element('div', 'card-power', String(card.power)));
  node.appendChild(element('div', 'card-name', card.name));
  node.appendChild(element('div', 'card-trick', options.trickText ?? (card.trick ? TRICK_TEXT[card.trick] : '—')));
  if (options.selected) node.classList.add('selected');
  if (options.playable) node.classList.add('playable');
  if (options.unaffordable) node.classList.add('unaffordable');
  if (options.dimmed) node.classList.add('dimmed');
  return node;
}

// One face-down card back: the lantern mark on deep blue, no value visible.
export function buildBackElement() {
  const node = element('div', 'card back');
  node.appendChild(element('div', 'back-ring'));
  const glyph = glyphSvg('glyph-flame');
  glyph.classList.add('back-glyph');
  node.appendChild(glyph);
  node.appendChild(element('div', 'back-word', 'EMBERFALL'));
  return node;
}

function renderEmberPips(container, count) {
  container.replaceChildren();
  container.appendChild(element('span', 'pip-label', 'EMBERS'));
  for (let pip = 0; pip < 5; pip += 1) {
    const flame = glyphSvg('glyph-flame');
    flame.style.fill = '#f2b544';
    if (pip >= count) flame.classList.add('pip-off');
    container.appendChild(flame);
  }
  container.appendChild(element('span', 'pip-label', `${count}/5`));
}

function renderSide(side, prefix, state) {
  document.getElementById(`${prefix}-life`).textContent = String(side.life);
  const fill = document.getElementById(`${prefix}-life-fill`);
  fill.style.width = `${Math.max(0, (side.life / LIFE_START) * 100)}%`;
  renderEmberPips(document.getElementById(`${prefix}-embers`), side.embers);
  document.getElementById(`${prefix}-deck`).textContent = String(side.deck.length);
  document.getElementById(`${prefix}-discard`).textContent = String(side.discard.length);
  document.getElementById(`${prefix}-won`).textContent = String(side.roundsWon);
  const shield = document.getElementById(`${prefix}-shield`);
  shield.hidden = side.shield <= 0;
  if (side.shield > 0) shield.textContent = `BULWARK — blocks ${side.shield} damage`;
  const weakened = document.getElementById(`${prefix}-weakened`);
  if (weakened) weakened.hidden = side.weakened <= 0;
  const attune = document.getElementById(`${prefix}-attune`);
  if (attune) attune.hidden = !side.attuned;
}

// The favour token: the suit the Warden is most likely to play, named in
// words and shown as a glyph, with the suit that beats it as the counter.
export function renderFavour(state) {
  const token = document.getElementById('favour-token');
  token.replaceChildren();
  if (!state.favour) {
    token.textContent = 'The Warden has not shown its favour yet.';
    return;
  }
  const suit = SUITS[state.favour];
  const counterSuit = suitThatBeats(state.favour);
  const counter = SUITS[counterSuit];
  const glyph = glyphSvg(suit.glyph);
  glyph.style.fill = suit.color;
  token.appendChild(glyph);
  token.appendChild(element('span', null, state.favourDesperate
    ? `The Warden is DESPERATE — it favours ${suit.name} and will spend freely`
    : `The Warden favours ${suit.name} — counter with ${counter.name}`));
  token.style.color = suit.color;
  token.classList.toggle('desperate', state.favourDesperate);
}

// The event log: the latest round in full (summary plus its first trick
// line, so Mend, Siphon, Gust and Undertow are visible, not silent), the
// one before it dimmed. Each summary also says whether the Warden's card
// honoured the favour it showed — "favoured Tide, as told".
export function renderLog(state) {
  const log = document.getElementById('event-log');
  log.replaceChildren();
  const entries = state.log.slice(-2);
  entries.forEach((entry, index) => {
    const latest = index === entries.length - 1;
    const line = element('div', latest ? null : 'log-old');
    const favourNote = entry.favour
      ? entry.wardenSuit === entry.favour
        ? ` — favoured ${SUITS[entry.favour].name}, as told`
        : ` — broke its favour (${SUITS[entry.favour].name})`
      : '';
    const summary = entry.winner
      ? `Round ${entry.round}: you played ${entry.playerCard} (${entry.playerPower}) vs ${entry.wardenCard} (${entry.wardenPower}) — ${entry.winner === 'player' ? 'you win' : 'Warden wins'}${entry.damage > 0 ? `, ${entry.damage} flame${entry.damage === 1 ? '' : 's'} snuffed` : ''}.`
      : `Round ${entry.round}: ${entry.playerCard} (${entry.playerPower}) meets ${entry.wardenCard} (${entry.wardenPower}) — evenly matched.`;
    line.textContent = summary + favourNote;
    log.appendChild(line);
    if (latest && entry.events.length > 0) {
      const eventLine = element('div', 'log-event');
      eventLine.textContent = entry.events[0];
      log.appendChild(eventLine);
    }
  });
  if (entries.length === 0) {
    log.appendChild(element('div', null, 'The bridge is quiet. Play a card to begin the duel.'));
  }
}

// The whole table, painted from the state. Called on every state change;
// the hands are rebuilt each time, which is cheap at five cards a side.
export function renderTable(state, ui) {
  document.getElementById('round-label').textContent = `Round ${Math.max(1, state.round)}`;
  document.getElementById('warden-rank').textContent = `RANK ${['I', 'II', 'III', 'IV', 'V'][Math.min(state.rank, 5) - 1] || state.rank}`;
  renderSide(state.warden, 'warden', state);
  renderSide(state.player, 'player', state);
  const badge = document.getElementById('attune-badge');
  badge.hidden = !state.player.attuned;
  if (state.player.attuned && state.player.lastSuit) {
    badge.textContent = `ATTUNED — ${SUITS[state.player.lastSuit].name.toUpperCase()} +2`;
  }

  const wardenHand = document.getElementById('warden-hand');
  wardenHand.replaceChildren();
  document.getElementById('warden-hand-count').textContent = String(state.warden.hand.length);
  for (let index = 0; index < state.warden.hand.length; index += 1) {
    wardenHand.appendChild(buildBackElement());
  }

  const playerHand = document.getElementById('player-hand');
  playerHand.replaceChildren();
  const hand = sortedHand(state.player.hand);
  hand.forEach((card, index) => {
    const affordable = card.cost <= state.player.embers;
    const node = buildCardElement(card, {
      selected: ui.selected === index,
      playable: state.phase === 'choose' && affordable,
      unaffordable: state.phase === 'choose' && !affordable,
    });
    node.dataset.handIndex = String(index);
    playerHand.appendChild(node);
  });
  const hint = document.getElementById('player-hint');
  hint.textContent = state.phase === 'choose'
    ? 'click a card, then Enter to play it'
    : state.phase === 'resolving'
      ? 'the cards are in the arena…'
      : 'the duel is over';

  renderFavour(state);
  renderLog(state);
}

// Fill an arena slot with a face-up card, or empty it.
export function renderArenaSlot(slotId, card) {
  const slot = document.getElementById(slotId);
  const holder = slot.querySelector('.slot-card');
  holder.replaceChildren();
  if (card) holder.appendChild(buildCardElement(card));
}

// Fill an arena slot with a face-down card, for the flip reveal.
export function renderArenaBack(slotId) {
  const slot = document.getElementById(slotId);
  const holder = slot.querySelector('.slot-card');
  holder.replaceChildren();
  holder.appendChild(buildBackElement());
}

export function setBanner(text) {
  document.getElementById('round-banner').textContent = text;
}

// The title screen: three sample cards fanned along the bottom (with
// shortened trick lines, so the small cards never overflow), and the best
// result line (seeded in shot mode so it never reads as an empty zero).
export function renderTitle(best, sampleCards) {
  const fan = document.getElementById('title-cards');
  fan.replaceChildren();
  const shortTricks = {
    'cinder-spark': '—',
    'bonfire-herald': 'Kindle +2',
    'tempest-bell': 'Undertow −2',
    'old-mountain': '—',
  };
  for (const card of sampleCards) {
    fan.appendChild(buildCardElement(card, { trickText: shortTricks[card.id] ?? undefined }));
  }
  const bestLine = document.getElementById('best-line');
  if (best && best.rank > 0) {
    bestLine.textContent = `Best: Warden Rank ${['I', 'II', 'III'][best.rank - 1] || best.rank} beaten in ${best.rounds} rounds`;
  } else {
    bestLine.textContent = 'No duel yet — the bridge is waiting for its first keeper.';
  }
}

// The win/loss tally: rounds, damage dealt, cards played, rounds won, and
// the flames the player's lantern has left.
export function renderTally(tallyId, state) {
  const tally = document.getElementById(tallyId);
  tally.replaceChildren();
  const cells = [
    [String(state.round), 'ROUNDS'],
    [String(state.stats.damageDealt), 'DAMAGE DEALT'],
    [String(state.stats.cardsPlayed), 'CARDS PLAYED'],
    [`${state.player.roundsWon}–${state.warden.roundsWon}`, 'ROUNDS WON'],
    [String(Math.max(0, state.player.life)), 'FLAMES LEFT'],
  ];
  for (const [number, label] of cells) {
    const cell = element('div');
    cell.appendChild(element('div', 'tally-num', number));
    cell.appendChild(element('div', 'tally-label', label));
    tally.appendChild(cell);
  }
}

// A whole end screen: the tally, the two cards of the final round (so the
// screen carries game state instead of empty space), and the final round's
// line. The cards are rebuilt from the log's names — names are unique
// across the twelve designs.
export function renderEndScreen(prefix, state) {
  renderTally(`${prefix}-tally`, state);
  const arena = document.getElementById(`${prefix}-arena`);
  if (arena) {
    arena.replaceChildren();
    const last = state.log[state.log.length - 1];
    if (last) {
      for (const name of [last.playerCard, last.wardenCard]) {
        const design = [...DESIGN_BY_ID.values()].find((candidate) => candidate.name === name);
        if (design) arena.appendChild(buildCardElement({ ...design, instance: `${design.id}#1` }));
      }
    }
  }
  const logLine = document.getElementById(`${prefix}-log`);
  if (logLine) {
    const last = state.log[state.log.length - 1];
    logLine.textContent = last
      ? `Final round: ${last.playerCard} (${last.playerPower}) vs ${last.wardenCard} (${last.wardenPower}) — ${last.winner === 'player' ? 'you win the round' : last.winner === 'warden' ? 'the Warden wins the round' : 'evenly matched'}.`
      : '';
  }
}
