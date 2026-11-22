// Emberfall — tuning constants. Every number the rules use lives here so a
// balance pass touches one file and nothing else.
export const LIFE_START = 14;
export const EMBER_START = 0;
export const EMBER_CAP = 5;
export const EMBER_PER_ROUND = 1;
export const HAND_START = 5;
export const HAND_CAP = 7;
export const DECK_COPIES = 2;
export const SUIT_BONUS = 4;
export const DAMAGE_MIN = 1;
export const DAMAGE_CAP = 8;
export const ATTUNE_BONUS = 2;
export const MEND_HEAL = 2;
export const SIPHON_STEAL = 1;
export const BULWARK_BLOCK = 2;
export const UNDERTOW_WEAKEN = 2;
export const GUST_DRAW = 1;
export const KINDLE_BONUS = 2;

// The four suits. Each suit is told apart by colour AND glyph AND name, never
// by text alone: the glyph is an SVG symbol, the colour a CSS band, the name a
// label under the glyph on the card.
export const SUITS = {
  ember: { name: 'Ember', color: '#E4572E', dark: '#B23A17', glyph: 'glyph-ember' },
  gale: { name: 'Gale', color: '#43AA8B', dark: '#2C7A64', glyph: 'glyph-gale' },
  tide: { name: 'Tide', color: '#2E86AB', dark: '#1F5E7A', glyph: 'glyph-tide' },
  stone: { name: 'Stone', color: '#9C7FA8', dark: '#6E5578', glyph: 'glyph-stone' },
};

// The suit cycle: each suit beats one and loses to one. Read clockwise.
export const SUIT_BEATS = {
  ember: 'gale',
  gale: 'tide',
  tide: 'stone',
  stone: 'ember',
};

// Trick flavour text, one line each, printed on the card that carries it.
export const TRICK_TEXT = {
  kindle: 'Kindle — +2 power if you won last round',
  mend: 'Mend — restore 2 flames',
  siphon: 'Siphon — steal 1 ember from the rival',
  bulwark: 'Bulwark — block the next 2 damage',
  gust: 'Gust — draw an extra card',
  undertow: 'Undertow — rival’s next card loses 2 power',
};

// Warden rank scaling: each rank the Warden honours its favour more often
// and opens with more banked embers. Rank I is the first match.
// The base is the ROLL, not the measured rate: in about one round in five
// the Warden holds no other affordable card (or the bomb hold removes the
// rest), so it plays favoured by force, and the desperate fall-through
// plays the biggest affordable card, which is often favoured too — a 0.5
// roll measures at ~70%.
// When it does not honour the favour, this is how often it bluffs instead
// of playing its strongest non-favoured card.
export const WARDEN_FAVOUR_BASE = 0.5;
export const WARDEN_FAVOUR_PER_RANK = 0.1;
export const WARDEN_BLUFF_CHANCE = 0.9;
export const WARDEN_START_EMBERS_PER_RANK = 1;

// The Warden turns desperate below this life: it spends freely and plays its
// biggest card, and the favour token flickers red so the change is telegraphed.
export const WARDEN_DESPERATE_LIFE = 10;
// The Warden will not throw a cost-3 card while its life is above this,
// unless that card wins the round by this margin or more.
export const WARDEN_BOMB_HOLD_LIFE = 10;
export const WARDEN_BOMB_HOLD_MARGIN = 4;

// Presentation: the stage is a fixed 1280x720 board, letterboxed to the window.
export const STAGE_WIDTH = 1280;
export const STAGE_HEIGHT = 720;
export const CARD_WIDTH = 132;
export const CARD_HEIGHT = 184;

// Local storage key for the best result shown on the title screen.
export const BEST_KEY = 'emberfall-best-v1';
