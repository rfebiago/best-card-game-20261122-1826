[![make.fun · best-card-game-20261122-1826](https://make.fun/badge/best-card-game-20261122-1826.svg)](https://make.fun/bounty/best-card-game-20261122-1826?utm_source=github&utm_medium=readme&utm_campaign=best-card-game-20261122-1826)
[![rank](https://make.fun/badge/best-card-game-20261122-1826/rfebiago/best-card-game-20261122-1826/rank.svg)](https://make.fun/bounty/best-card-game-20261122-1826/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-card-game-20261122-1826)
[![reward](https://make.fun/badge/best-card-game-20261122-1826/rfebiago/best-card-game-20261122-1826/reward.svg)](https://make.fun/bounty/best-card-game-20261122-1826?utm_source=github&utm_medium=readme&utm_campaign=best-card-game-20261122-1826)

# EMBERFALL — Duel of the Lantern Keepers

An original turn-based duel card game, built for the
[best-card-game-20261122-1826 bounty](https://make.fun/bounty/best-card-game-20261122-1826)
on make.fun.

Two lantern-keepers duel at dusk on a stone bridge over dark water. Each
keeper's life is the flame in their lantern — 14 flames each. Every round
both sides play one card from a hand of five. The stronger card wins the
round and snuffs out a number of the loser's flames equal to the power
margin. First lantern to go dark loses.

## The game

- **14 life each**, 24 cards a side (12 unique designs × 2 copies).
- **4-suit cycle** — Ember > Gale > Tide > Stone > Ember. Playing the suit
  that beats the rival's gives +4 power. Suits are told apart by colour,
  glyph, and shape — never by text alone.
- **Ember economy** — cards cost 0–3 embers. Unspent embers bank (cap 5),
  +1 per round. Spend cheap cards for tempo, or bank for a cost-3 bomb.
- **Attunement** — playing the same suit two rounds in a row grants +2
  power on the next round's card.
- **6 tricks** — Kindle, Mend, Siphon, Bulwark, Gust, Undertow. Each card
  carries at most one one-line trick.
- **The Warden** — an AI opponent that telegraphs its intentions: a favour
  token above its hand shows the suit it favours, and it honours that favour
  about 70% of the time (measured), with a bluff branch that punishes blind
  countering. Warden ranks I–V; winning a match raises the rank.
- **Complete in screenshots** — title screen, a table with the player's
  face-up hand and the Warden's labelled hand, cards with readable values
  and suits, a visible life total, and win and loss screens.
- **Original** — its own theme, suits, and rules. No commercial game's
  names, characters, art, or mechanics are copied. All art is procedural
  (DOM/CSS + canvas particles) and all sound is procedural WebAudio; the
  game loads nothing over the network.

## How to run

```bash
node serve.ts
```

Then open http://localhost:8080 in a desktop browser. Keyboard: keys 1–5
select a card, Enter confirms, Esc pauses. Mouse works too.

## Play it on make.fun

Enter the bounty with referral code `79dmssjn`:

https://make.fun/bounty/best-card-game-20261122-1826
