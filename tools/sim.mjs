// Emberfall — headless balance check (development only, not part of the
// game). Drives the real rules and the real Warden AI in Node, no browser,
// and reports the numbers the design's verification step asks for: the
// Warden's win rate against a random player and against a greedy player,
// the average match length, and how often the damage cap binds.
// Usage: node tools/sim.mjs [matches] [first-seed]
import { createMatch, beginRound, sortedHand } from '../game/src/state.js';
import { chooseCard } from '../game/src/warden.js';
import { matchWinner, resolveRound, suitThatBeats } from '../game/src/rules.js';
import { DAMAGE_CAP } from '../game/src/config.js';

const MATCHES = Number(process.argv[2] ?? 200);
const FIRST_SEED = Number(process.argv[3] ?? 1);

function playCard(state, card) {
  state.player.embers -= card.cost;
  state.player.played = card;
  state.player.hand = state.player.hand.filter((held) => held.instance !== card.instance);
}

function playWardenCard(state) {
  const card = chooseCard(state, state.favour, state.random);
  if (!card) return false;
  state.warden.embers -= card.cost;
  state.warden.played = card;
  state.warden.hand = state.warden.hand.filter((held) => held.instance !== card.instance);
  return true;
}

function playMatch(seed, policy) {
  const state = createMatch(seed, 1);
  let capBinds = 0;
  let favourHits = 0;
  let favourRounds = 0;
  for (let round = 0; round < 40; round += 1) {
    if (!beginRound(state)) break;
    const affordable = sortedHand(state.player.hand).filter((card) => card.cost <= state.player.embers);
    if (affordable.length === 0) break;
    const pick = policy(state, affordable);
    playCard(state, pick);
    const hadFavoured = state.warden.hand.some((card) => card.suit === state.favour && card.cost <= state.warden.embers);
    if (!playWardenCard(state)) break;
    // Favour adherence counts only rounds where the Warden held an
    // affordable card of the favoured suit — the promise only binds then.
    if (hadFavoured) {
      favourRounds += 1;
      if (state.warden.played.suit === state.favour) favourHits += 1;
    }
    const report = resolveRound(state);
    if (report.damage === DAMAGE_CAP) capBinds += 1;
    const winner = matchWinner(state);
    if (winner) return { winner, rounds: state.round, capBinds, favourHits, favourRounds };
  }
  return { winner: matchWinner(state) ?? 'unfinished', rounds: state.round, capBinds, favourHits, favourRounds };
}

function randomPolicy(state, affordable) {
  return affordable[Math.floor(state.random() * affordable.length)];
}

function greedyPolicy(state, affordable) {
  const counter = suitThatBeats(state.favour);
  const counters = affordable.filter((card) => card.suit === counter);
  const pool = counters.length > 0 ? counters : affordable;
  return [...pool].sort((a, b) => b.power - a.power)[0];
}

function run(label, policy) {
  const tally = { player: 0, warden: 0, unfinished: 0 };
  let rounds = 0;
  let caps = 0;
  let favourHits = 0;
  let favourRounds = 0;
  for (let index = 0; index < MATCHES; index += 1) {
    const result = playMatch(FIRST_SEED + index, policy);
    tally[result.winner] = (tally[result.winner] ?? 0) + 1;
    rounds += result.rounds;
    caps += result.capBinds;
    favourHits += result.favourHits;
    favourRounds += result.favourRounds;
  }
  console.log(`--- ${label} (${MATCHES} matches) ---`);
  console.log(`Warden wins: ${tally.warden} (${((tally.warden / MATCHES) * 100).toFixed(1)}%)`);
  console.log(`Player wins: ${tally.player} (${((tally.player / MATCHES) * 100).toFixed(1)}%)`);
  console.log(`Unfinished: ${tally.unfinished}`);
  console.log(`Average match length: ${(rounds / MATCHES).toFixed(1)} rounds`);
  console.log(`Damage cap bound: ${caps} rounds (${((caps / (rounds || 1)) * 100).toFixed(1)}% of rounds)`);
  console.log(`Favour adherence: ${favourHits}/${favourRounds} (${favourRounds ? ((favourHits / favourRounds) * 100).toFixed(1) : '0'}%)`);
}

run('random player', randomPolicy);
run('greedy player (counters the favour)', greedyPolicy);
