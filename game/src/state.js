// Emberfall — the match state. One object holds the whole duel: both sides'
// life, embers, hands, decks and discard piles, the round number, the
// Warden's favour, the log and the tally. The renderer reads it; the rules
// mutate it; nothing else keeps a copy of it.
import {
  EMBER_CAP,
  EMBER_PER_ROUND,
  EMBER_START,
  HAND_START,
  LIFE_START,
  WARDEN_DESPERATE_LIFE,
} from './config.js';
import { buildDeck, createSeededRandom } from './cards.js';
import { drawCard } from './rules.js';
import { chooseFavour, rankStartEmbers } from './warden.js';

function createSide(label, deck) {
  return {
    label,
    life: LIFE_START,
    embers: EMBER_START,
    hand: [],
    deck,
    discard: [],
    shield: 0,
    weakened: 0,
    attuned: false,
    lastSuit: null,
    lastPower: 0,
    lastDamage: 0,
    roundsWon: 0,
    played: null,
  };
}

// A fresh match. Both sides get the same 24-card deck, shuffled differently
// from the one seed, five cards each, and the Warden's rank (I on the first
// match, higher after wins) shapes its opening embers.
export function createMatch(seed, rank = 1) {
  const random = createSeededRandom(seed);
  const state = {
    seed,
    rank,
    random,
    round: 0,
    phase: 'title',
    favour: null,
    favourDesperate: false,
    log: [],
    deckOut: false,
    winner: null,
    player: createSide('You', buildDeck(random)),
    warden: createSide('The Warden', buildDeck(random)),
    stats: { damageDealt: 0, cardsPlayed: 0 },
  };
  state.warden.embers = rankStartEmbers(rank);
  for (let deal = 0; deal < HAND_START; deal += 1) {
    drawCard(state.player, state);
    drawCard(state.warden, state);
  }
  return state;
}

// Start a round: both sides gain an ember (capped), draw a card, and the
// Warden shows its favour before the player chooses. When a side cannot
// draw, the decks are out and the match ends by the life totals. Kindling:
// a side whose hand holds nothing it can afford kindles embers until one
// card is playable, so a round never stalls for lack of a legal play.
export function beginRound(state) {
  state.round += 1;
  for (const side of [state.player, state.warden]) {
    side.embers = Math.min(EMBER_CAP, side.embers + EMBER_PER_ROUND);
  }
  const playerDraw = drawCard(state.player, state);
  const wardenDraw = drawCard(state.warden, state);
  if (playerDraw === null || wardenDraw === null) {
    state.deckOut = true;
    return false;
  }
  for (const side of [state.player, state.warden]) {
    while (side.embers < EMBER_CAP && !side.hand.some((card) => card.cost <= side.embers)) {
      side.embers += 1;
    }
  }
  state.favour = chooseFavour(state);
  state.favourDesperate = state.warden.life <= WARDEN_DESPERATE_LIFE;
  state.phase = 'choose';
  return true;
}

// Can this side afford to play this card right now?
export function canAfford(side, card) {
  return card.cost <= side.embers;
}

// The player's hand, sorted for the table: cheapest first, then strongest,
// so the eye finds a playable card without hunting.
export function sortedHand(hand) {
  return [...hand].sort((a, b) => a.cost - b.cost || b.power - a.power);
}
