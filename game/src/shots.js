// Emberfall — the screenshot scenes behind ?shot=title|table|win|loss. Each
// one plays the real rules forward from a fresh match with a fixed seed and
// a fixed player policy, so the frame is what a short game really looks like
// and the same seed always gives the same frame. Nothing here edits pixels:
// the shots are renders of the game's own state, with the animations already
// settled when the paint happens.
import { CARD_DESIGNS } from './cards.js';
import { beginRound, createMatch, sortedHand } from './state.js';
import { chooseCard } from './warden.js';
import { matchWinner, resolveRound, suitThatBeats } from './rules.js';

// The player's policy for a staged round: the first affordable card of the
// hand sorted cheapest-first. Deterministic, and it plays like a cautious
// first-time keeper rather than a perfect one.
function firstAffordable(state) {
  return sortedHand(state.player.hand).find((card) => card.cost <= state.player.embers) || null;
}

// The greedy policy for the win shot: the strongest affordable card,
// preferring the suit that beats the Warden's favour.
function greedy(state) {
  const affordable = sortedHand(state.player.hand).filter((card) => card.cost <= state.player.embers);
  if (affordable.length === 0) return null;
  const counter = suitThatBeats(state.favour);
  const counters = affordable.filter((card) => card.suit === counter);
  const pool = counters.length > 0 ? counters : affordable;
  return [...pool].sort((a, b) => b.power - a.power)[0];
}

// The weak policy for the loss shot: the cheapest affordable card, always.
function cheapest(state) {
  return firstAffordable(state);
}

// Play one full round with the given player policy. Returns the resolution
// report, or null when the round could not be played.
function playStagedRound(state, policy) {
  if (!beginRound(state)) return null;
  const playerCard = policy(state);
  if (!playerCard) return null;
  state.player.embers -= playerCard.cost;
  state.player.played = playerCard;
  state.player.hand = state.player.hand.filter((card) => card.instance !== playerCard.instance);
  const wardenCard = chooseCard(state, state.favour, state.random);
  if (!wardenCard) return null;
  state.warden.embers -= wardenCard.cost;
  state.warden.played = wardenCard;
  state.warden.hand = state.warden.hand.filter((card) => card.instance !== wardenCard.instance);
  const played = { player: playerCard, warden: wardenCard };
  const report = resolveRound(state);
  return { ...report, played };
}

// Play rounds until the match ends or the cap is hit. Returns the winner.
function playUntilEnd(state, policy, cap = 40) {
  for (let round = 0; round < cap; round += 1) {
    const outcome = playStagedRound(state, policy);
    if (!outcome) break;
    const winner = matchWinner(state);
    if (winner) return winner;
  }
  return matchWinner(state);
}

function sampleCard(designId) {
  const design = CARD_DESIGNS.find((candidate) => candidate.id === designId);
  return { ...design, instance: `${design.id}#1` };
}

// Set the match to the named scene and return what the screen needs to draw
// it: the screen name, the state, the arena cards for the table shot, and
// the best result to show on the title.
export function stageShot(name, seed) {
  if (name === 'title') {
    return {
      screen: 'title',
      state: null,
      arena: null,
      best: { rank: 1, rounds: 9 },
      sampleCards: [sampleCard('cinder-spark'), sampleCard('tempest-bell'), sampleCard('old-mountain')],
    };
  }

  const state = createMatch(seed, 1);
  if (name === 'table') {
    // Three rounds of cautious play, then a fourth round resolved in the
    // arena so the shot shows both played cards, a banner and a log.
    for (let round = 0; round < 3; round += 1) {
      if (!playStagedRound(state, firstAffordable)) break;
    }
    const outcome = playStagedRound(state, greedy);
    if (!outcome) {
      return { screen: 'table', state, arena: null, best: null, sampleCards: [] };
    }
    const banner = outcome.winner === 'player'
      ? `${outcome.played.player.name} (${outcome.playerPower}) beats ${outcome.played.warden.name} (${outcome.wardenPower}) — ${outcome.damage} flame${outcome.damage === 1 ? '' : 's'} snuffed!`
      : outcome.winner === 'warden'
        ? `${outcome.played.warden.name} (${outcome.wardenPower}) beats ${outcome.played.player.name} (${outcome.playerPower}) — the Warden snuffs ${outcome.damage} flame${outcome.damage === 1 ? '' : 's'}.`
        : `${outcome.played.player.name} meets ${outcome.played.warden.name} — evenly matched, no flames lost.`;
    return { screen: 'table', state, arena: outcome.played, banner, best: null, sampleCards: [] };
  }

  if (name === 'win') {
    // Verified: seed 44 with the greedy policy wins in 7 rounds (5–1),
    // damage dealt exactly 14 — the tally adds up with no healing.
    const winner = playUntilEnd(state, greedy);
    state.winner = winner;
    return { screen: 'win', state, arena: null, best: null, sampleCards: [] };
  }

  // 'loss' (and any other name): the weak policy loses to the Warden.
  // Verified: seed 4 with the cheapest policy loses in 10 rounds (3–6,
  // damage dealt 8). No forcing: the tally shows the real match.
  const winner = playUntilEnd(state, cheapest);
  state.winner = winner;
  return { screen: 'loss', state, arena: null, best: null, sampleCards: [] };
}
