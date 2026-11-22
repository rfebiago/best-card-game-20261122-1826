// Emberfall — the Warden, the rival keeper. The Warden is meant to be read,
// not just beaten: every round it shows a favour token naming the suit it is
// most likely to play, and it honours that favour most of the time. The
// player counters by playing the suit that beats the favoured one, or a
// bigger number. The Warden never sees the player's hand; it only knows the
// public log (cards played, suits used).
import {
  EMBER_CAP,
  SUIT_BEATS,
  SUIT_BONUS,
  WARDEN_BOMB_HOLD_LIFE,
  WARDEN_BOMB_HOLD_MARGIN,
  WARDEN_DESPERATE_LIFE,
  WARDEN_FAVOUR_BASE,
  WARDEN_FAVOUR_PER_RANK,
  WARDEN_BLUFF_CHANCE,
} from './config.js';
import { mostHeldSuit } from './cards.js';
import { suitBeats, suitThatBeats } from './rules.js';

const SUIT_ORDER = ['ember', 'gale', 'tide', 'stone'];

// How often the Warden plays the favoured suit when it holds one it can
// afford. Rises with rank: 70% at rank I, 80% at II, 90% at III.
export function favourAdherence(rank) {
  return Math.min(0.9, WARDEN_FAVOUR_BASE + WARDEN_FAVOUR_PER_RANK * (rank - 1));
}

// Pick the favour for this round: the suit the Warden holds most of. Ties
// break toward the suit that beats the suit the player has played most, so
// the token feels like the Warden is watching the player — because it is,
// through the public log only.
export function chooseFavour(state) {
  const warden = state.warden;
  const playerSuits = { ember: 0, gale: 0, tide: 0, stone: 0 };
  for (const entry of state.log) {
    if (entry.playerSuit) playerSuits[entry.playerSuit] += 1;
  }
  let playerFavourite = 'ember';
  for (const suit of SUIT_ORDER) {
    if (playerSuits[suit] > playerSuits[playerFavourite]) playerFavourite = suit;
  }
  // The suit that beats the player's favourite leads the tie-break order.
  const preference = [SUIT_BEATS[playerFavourite], ...SUIT_ORDER.filter((suit) => suit !== SUIT_BEATS[playerFavourite])];
  return mostHeldSuit(warden.hand, preference);
}

// The Warden's card choice, in priority order:
//   1. desperate (life below the threshold): the biggest card it can afford,
//      still honouring the favour at the rank's rate so the token stays
//      honest even when the Warden is low
//   2. the strongest affordable card of the favoured suit (at the rank's
//      adherence rate — the favour is a promise, so it is honoured before
//      any cleverness; the token is only worth trusting if it usually holds)
//   3. when it does not honour the favour, the rest of the choice comes
//      from the non-favoured cards: a card that wins the round outright,
//      cheapest such card first — then the bluff, the suit that beats the
//      counter-suit, so blindly countering the favour is punished sometimes
//      — then the strongest non-favoured card. The break from the favour is
//      real: the fall-through pools exclude the favoured suit, because
//      picking "the strongest card" from the full hand would land on the
//      favoured suit most of the time anyway (it is the most-held suit) and
//      push adherence toward 90%.
// Cost-3 bombs are held while life is high unless they win the round by a
// wide margin or the bank is full, and Bulwark is held until the player is
// hitting hard or the Warden is low.
export function chooseCard(state, favour, random) {
  const warden = state.warden;
  const player = state.player;
  const affordable = warden.hand.filter((card) => card.cost <= warden.embers);
  if (affordable.length === 0) return null;
  const usable = affordable.filter((card) => {
    // A cost-3 bomb is held while life is high and the bank is not full,
    // unless it wins the round by a wide margin — the margin is judged
    // against the player's last played power, the only threat it can see.
    if (card.cost === 3 && warden.life > WARDEN_BOMB_HOLD_LIFE && warden.embers < EMBER_CAP) {
      const bonus = suitBeats(card.suit, player.lastSuit || '') ? SUIT_BONUS : 0;
      const margin = card.power + bonus - ((player.lastPower || 4) + 2);
      if (margin < WARDEN_BOMB_HOLD_MARGIN) return false;
    }
    if (card.trick === 'bulwark' && player.lastDamage < 4 && warden.life >= WARDEN_DESPERATE_LIFE) return false;
    return true;
  });
  const pool = usable.length > 0 ? usable : affordable;

  if (warden.life <= WARDEN_DESPERATE_LIFE) {
    // Desperate still reads: the biggest card of the favoured suit if one
    // is affordable and the favour roll holds, else the biggest card
    // outright — it spends freely, it does not play weak.
    const desperateFavoured = affordable.filter((card) => card.suit === favour).sort((a, b) => b.power - a.power);
    if (desperateFavoured.length > 0 && random() < favourAdherence(state.rank)) return desperateFavoured[0];
    return [...affordable].sort((a, b) => b.power - a.power)[0];
  }

  // The favour is a promise, so it is honoured from the affordable hand,
  // not from the bomb-held pool: a favoured bomb is the Warden's natural
  // play, and holding it would break the token's word.
  const favoured = affordable.filter((card) => card.suit === favour).sort((a, b) => b.power - a.power);
  if (favoured.length > 0 && random() < favourAdherence(state.rank)) return favoured[0];

  // It did not honour the favour: the rest of the choice comes from the
  // non-favoured cards (falling back to the full pool only when the hand
  // holds nothing else affordable).
  const nonFavoured = pool.filter((card) => card.suit !== favour);
  const fallPool = nonFavoured.length > 0 ? nonFavoured : pool;
  const fallPower = [...fallPool].sort((a, b) => b.power - a.power);
  const fallCost = [...fallPool].sort((a, b) => a.cost - b.cost || b.power - a.power);

  // A card that wins outright: it beats the player's best plausible card.
  // The Warden cannot see the hand, so it estimates from the player's last
  // played power and the suit bonus it would face.
  const playerThreat = (player.lastPower || 4) + 2;
  const winners = fallCost.filter((card) => {
    const bonus = suitBeats(card.suit, player.lastSuit || '') ? SUIT_BONUS : 0;
    return card.power + bonus > playerThreat;
  });
  if (winners.length > 0) {
    const bomb = winners.find((card) => card.cost === 3);
    if (bomb) return bomb;
    const cheap = winners.filter((card) => card.cost < 3);
    if (cheap.length > 0) return cheap[0];
  }

  // The bluff: the suit that beats the counter-suit, so a player who always
  // counters the favour gets punished for it. The favour stays honest (the
  // Warden still plays it most of the time), but blind countering is not free.
  const counterSuit = suitThatBeats(favour);
  const bluffSuit = suitThatBeats(counterSuit);
  const bluffs = fallPool.filter((card) => card.suit === bluffSuit).sort((a, b) => b.power - a.power);
  if (bluffs.length > 0 && random() < WARDEN_BLUFF_CHANCE) return bluffs[0];

  return fallPower[0];
}

// The Warden's opening embers for a rank: rank I starts at zero, higher
// ranks bank one ember per rank above the first.
export function rankStartEmbers(rank) {
  return Math.max(0, rank - 1);
}
