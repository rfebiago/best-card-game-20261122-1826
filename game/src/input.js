// Emberfall — keyboard and mouse input. The game is played with both: press
// a card to select it, press it again (or Enter) to play it; keys 1-7 select
// a card by position, Enter confirms, Escape pauses. The handlers are
// callbacks the main loop wires up; this file only turns keys and presses
// into calls.
export function createInput() {
  let selected = -1;
  let onSelect = null;
  let onConfirm = null;
  let onPause = null;
  let onMute = null;

  function keyDown(event) {
    if (event.repeat) return;
    const key = event.key;
    if (key >= '1' && key <= '7') {
      selected = Number.parseInt(key, 10) - 1;
      if (onSelect) onSelect(selected);
      event.preventDefault();
    } else if (key === 'Enter' || key === ' ') {
      if (onConfirm) onConfirm();
      event.preventDefault();
    } else if (key === 'Escape') {
      if (onPause) onPause();
      event.preventDefault();
    } else if (key === 'm' || key === 'M') {
      if (onMute) onMute();
    }
  }

  window.addEventListener('keydown', keyDown);

  return {
    getSelected() {
      return selected;
    },
    setSelected(index) {
      selected = index;
    },
    onSelect(handler) {
      onSelect = handler;
    },
    onConfirm(handler) {
      onConfirm = handler;
    },
    onPause(handler) {
      onPause = handler;
    },
    onMute(handler) {
      onMute = handler;
    },
    // A press on a card: select it, or play it when it is already the
    // selected card. Returns the card's hand index.
    clickCard(index) {
      if (selected === index) {
        if (onConfirm) onConfirm();
      } else {
        selected = index;
        if (onSelect) onSelect(index);
      }
      return selected;
    },
  };
}
