// Emberfall — the round rules. Pure functions over the match state: no DOM,
// no sound, no animation, so the same code can be driven headlessly to test
// the balance. A round resolves in a fixed order:
//   1. power modifiers (suit bonus, Kindle, attunement, Undertow)
//   2. tricks: defensive ones first (Bulwark, Mend, Gust), then offensive
//      ones (Siphon, Undertow) — so a Mend can never resurrect a side the
//      round's damage just killed
//   3. the stronger card wins the round; damage is the margin, capped
//   4. attunement for the next round, and the round is logged
import {
  ATTUNE_BONUS,
  BULWARK_BLOCK,
  DAMAGE_CAP,
  DAMAGE_MIN,
  EMBER_CAP,
  GUST_DRAW,
  HAND_CAP,
  KINDLE_BONUS,
  MEND_HEAL,
  LIFE_START,
  SIPHON_STEAL,
  SUIT_BEATS,
  SUIT_BONUS,
  UNDERTOW_WEAKEN,
} from './config.js';

// True when suit A beats suit B in the four-way cycle.
export function suitBeats(attacker, defender) {
  return SUIT_BEATS[attacker] === defender;
}

// The suit that beats the given suit — the counter the favour token names.
export function suitThatBeats(suit) {
  for (const [candidate, beaten] of Object.entries(SUIT_BEATS)) {
    if (beaten === suit) return candidate;
  }
  return null;
}

// The power a card fights with this round, before the two cards are compared.
export function cardPower(card, side, state) {
  let power = card.power;
  const rival = side === 'player' ? state.warden : state.player;
  if (suitBeats(card.suit, rival.played ? rival.played.suit : '')) power += SUIT_BONUS;
  if (card.trick === 'kindle' && state.lastWinner === side) power += KINDLE_BONUS;
  if (state[side].attuned) power += ATTUNE_BONUS;
  if (state[side].weakened > 0) power -= UNDERTOW_WEAKEN;
  return Math.max(0, power);
}

// Draw one card for a side. A full hand sends the card to the discard pile
// face-up, so the player can count what is gone. Returns the drawn card, or
// null when the deck is empty (the match then ends by the life totals).
export function drawCard(side, state) {
  const deck = side.deck;
  if (deck.length === 0) return null;
  const card = deck.pop();
  if (side.hand.length >= HAND_CAP) {
    side.discard.push(card);
    return card;
  }
  side.hand.push(card);
  return card;
}

// Play one trick's board effect. Power tricks (Kindle) are handled in
// cardPower; this covers the tricks that change life, embers, shields,
// hands and the rival's next round. Tricks resolve in two waves — defensive
// first (Bulwark, Mend, Gust), then offensive (Siphon, Undertow) — so a
// Mend heals before the round's damage lands and can never resurrect.
function applyTrick(card, owner, rival, state, events, when) {
  if (!card.trick) return;
  const defensive = card.trick === 'mend' || card.trick === 'bulwark' || card.trick === 'gust';
  if ((when === 'defensive') !== defensive) return;
  if (card.trick === 'mend') {
    const healed = Math.min(MEND_HEAL, LIFE_START - owner.life);
    owner.life += healed;
    if (healed > 0) events.push(`${owner.label} mends ${healed} flame${healed === 1 ? '' : 's'}.`);
  } else if (card.trick === 'siphon') {
    const stolen = Math.min(SIPHON_STEAL, rival.embers);
    rival.embers -= stolen;
    owner.embers = Math.min(EMBER_CAP, owner.embers + stolen);
    if (stolen > 0) events.push(`${owner.label} siphons ${stolen} ember from ${rival.label}.`);
  } else if (card.trick === 'bulwark') {
    owner.shield += BULWARK_BLOCK;
    events.push(`${owner.label} raises a Bulwark (${BULWARK_BLOCK}).`);
  } else if (card.trick === 'gust') {
    for (let draw = 0; draw < GUST_DRAW; draw += 1) drawCard(owner, state);
    events.push(`${owner.label} draws an extra card on the Gust.`);
  } else if (card.trick === 'undertow') {
    rival.weakened = UNDERTOW_WEAKEN;
    events.push(`${rival.label} is caught in the Undertow — next card −${UNDERTOW_WEAKEN}.`);
  }
}

// Resolve one round. Both cards must already be set as side.played and paid
// for. Mutates the state and returns a report the renderer and the log use.
export function resolveRound(state) {
  const player = state.player;
  const warden = state.warden;
  const playerCard = player.played;
  const wardenCard = warden.played;
  const events = [];

  const playerPower = cardPower(playerCard, 'player', state);
  const wardenPower = cardPower(wardenCard, 'warden', state);
  // The weaken is spent now: it applied to this round's cards, and any
  // Undertow played this round sets a fresh one for the next round.
  player.weakened = 0;
  warden.weakened = 0;

  // Tricks resolve before the damage: defensive first, then offensive.
  applyTrick(playerCard, player, warden, state, events, 'defensive');
  applyTrick(wardenCard, warden, player, state, events, 'defensive');
  applyTrick(playerCard, player, warden, state, events, 'offensive');
  applyTrick(wardenCard, warden, player, state, events, 'offensive');

  let winner = null;
  let damage = 0;
  if (playerPower > wardenPower) {
    winner = 'player';
    damage = Math.min(DAMAGE_CAP, Math.max(DAMAGE_MIN, playerPower - wardenPower));
  } else if (wardenPower > playerPower) {
    winner = 'warden';
    damage = Math.min(DAMAGE_CAP, Math.max(DAMAGE_MIN, wardenPower - playerPower));
  }

  if (winner) {
    const loser = winner === 'player' ? warden : player;
    const blocked = Math.min(loser.shield, damage);
    if (blocked > 0) {
      loser.shield -= blocked;
      events.push(`${loser.label}'s Bulwark blocks ${blocked} damage.`);
    }
    const dealt = damage - blocked;
    loser.life = Math.max(0, loser.life - dealt);
    if (dealt > 0) {
      events.push(
        `${winner === 'player' ? player.label : warden.label} wins the round — ${dealt} flame${dealt === 1 ? '' : 's'} snuffed.`,
      );
    }
    state.lastWinner = winner;
    if (winner === 'player') {
      player.roundsWon += 1;
      state.stats.damageDealt += dealt;
    } else {
      warden.roundsWon += 1;
    }
  } else {
    // A tie clears the last winner: Kindle ("+2 if you won last round")
    // must not fire on a two-round-old win after a tied round.
    state.lastWinner = null;
    events.push('Evenly matched — no flames lost this round.');
  }

  // Attunement, for both sides alike: playing the same suit two rounds
  // running arms +2 power on the next round's card, whatever its suit.
  // Consumed on use. The player's badge shows on the table; the Warden's
  // shows beside its name, so the bonus is never a hidden advantage.
  for (const side of ['player', 'warden']) {
    const sideState = state[side];
    const playedCard = side === 'player' ? playerCard : wardenCard;
    if (sideState.attuned) sideState.attuned = false;
    if (playedCard.suit === sideState.lastSuit) {
      sideState.attuned = true;
      events.push(`${sideState.label} is attuned — next card +${ATTUNE_BONUS} power.`);
    }
    sideState.lastSuit = playedCard.suit;
  }
  state.stats.cardsPlayed += 2;

  // The played cards go to the discard piles.
  player.discard.push(playerCard);
  warden.discard.push(wardenCard);
  player.played = null;
  warden.played = null;

  state.log.push({
    round: state.round,
    favour: state.favour,
    playerCard: playerCard.name,
    playerSuit: playerCard.suit,
    wardenCard: wardenCard.name,
    wardenSuit: wardenCard.suit,
    playerPower,
    wardenPower,
    winner,
    damage,
    events,
  });

  // The Warden reads only the public log, so the last round's numbers are
  // recorded on the sides for its next decision.
  player.lastPower = playerPower;
  warden.lastPower = wardenPower;
  player.lastDamage = winner === 'player' ? damage : 0;
  warden.lastDamage = winner === 'warden' ? damage : 0;
  return { playerPower, wardenPower, winner, damage, events };
}

// Who has won the match, if anyone: a lantern at 0, or the higher life when
// a side can no longer draw. Returns 'player', 'warden', 'draw' or null.
export function matchWinner(state) {
  if (state.player.life <= 0 && state.warden.life <= 0) return 'draw';
  if (state.player.life <= 0) return 'warden';
  if (state.warden.life <= 0) return 'player';
  if (state.deckOut) {
    if (state.player.life !== state.warden.life) {
      return state.player.life > state.warden.life ? 'player' : 'warden';
    }
    if (state.player.roundsWon !== state.warden.roundsWon) {
      return state.player.roundsWon > state.warden.roundsWon ? 'player' : 'warden';
    }
    return 'player';
  }
  return null;
}
