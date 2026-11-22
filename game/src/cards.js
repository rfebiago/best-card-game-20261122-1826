// Emberfall — the card roster and the deck. Twelve original designs, two
// copies each, twenty-four cards a side. Both sides play the same deck, so
// the duel is fair and the player can count what is left.
import { DECK_COPIES } from './config.js';

// A small seeded generator (mulberry32) so a match and a screenshot can be
// replayed exactly from one seed number.
export function createSeededRandom(seed) {
  let state = seed >>> 0;
  return function nextRandom() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

// Fisher-Yates, driven by the caller's generator so the shuffle is seeded.
export function shuffleDeck(deck, random) {
  for (let index = deck.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    const held = deck[index];
    deck[index] = deck[other];
    deck[other] = held;
  }
  return deck;
}

export const CARD_DESIGNS = [
  { id: 'cinder-spark', name: 'Cinder Spark', suit: 'ember', power: 2, cost: 0, trick: null },
  { id: 'hearth-wisp', name: 'Hearth Wisp', suit: 'ember', power: 4, cost: 1, trick: 'kindle' },
  { id: 'bonfire-herald', name: 'Bonfire Herald', suit: 'ember', power: 7, cost: 3, trick: 'kindle' },
  { id: 'gull-cry', name: 'Gull Cry', suit: 'gale', power: 3, cost: 0, trick: null },
  { id: 'storm-kite', name: 'Storm Kite', suit: 'gale', power: 5, cost: 1, trick: 'gust' },
  { id: 'tempest-bell', name: 'Tempest Bell', suit: 'gale', power: 8, cost: 3, trick: 'undertow' },
  { id: 'still-pool', name: 'Still Pool', suit: 'tide', power: 3, cost: 1, trick: 'mend' },
  { id: 'moon-current', name: 'Moon Current', suit: 'tide', power: 6, cost: 2, trick: 'siphon' },
  { id: 'deep-undertow', name: 'Deep Undertow', suit: 'tide', power: 8, cost: 3, trick: 'undertow' },
  { id: 'pebble-ward', name: 'Pebble Ward', suit: 'stone', power: 2, cost: 0, trick: 'bulwark' },
  { id: 'cairn-watch', name: 'Cairn Watch', suit: 'stone', power: 5, cost: 2, trick: 'bulwark' },
  { id: 'old-mountain', name: 'Old Mountain', suit: 'stone', power: 9, cost: 3, trick: null },
];

export const DESIGN_BY_ID = new Map(CARD_DESIGNS.map((design) => [design.id, design]));

// Build one fresh 24-card deck: every design twice, shuffled with the
// caller's generator. Each card gets a unique instance id so the two copies
// of one design can be told apart on the table.
export function buildDeck(random) {
  const deck = [];
  for (const design of CARD_DESIGNS) {
    for (let copy = 0; copy < DECK_COPIES; copy += 1) {
      deck.push({ ...design, instance: `${design.id}#${copy + 1}` });
    }
  }
  return shuffleDeck(deck, random);
}

// The suit a side holds most of, ties broken by the caller's preference list.
export function mostHeldSuit(hand, preference) {
  const counts = { ember: 0, gale: 0, tide: 0, stone: 0 };
  for (const card of hand) counts[card.suit] += 1;
  let best = preference[0];
  for (const suit of preference) {
    if (counts[suit] > counts[best]) best = suit;
  }
  return best;
}
