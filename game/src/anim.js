// Emberfall — motion. All animation is transform and opacity only, never
// layout, so the table never reflows mid-deal. The particle canvas is the
// one place pixels move freely: embers drift up from the lanterns, and a win
// bursts them outward. Reduced motion turns every effect instant.
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Slide a card element from the deck corner to its place in the hand, with a
// stagger so the deal reads as a sequence, not a pop.
export function dealCard(element, delay) {
  if (reducedMotion) return;
  element.style.transition = 'none';
  element.style.transform = 'translateY(-40px) rotate(-6deg)';
  element.style.opacity = '0';
  requestAnimationFrame(() => {
    element.style.transition = `transform 380ms cubic-bezier(.2,.9,.3,1.2) ${delay}ms, opacity 240ms ease ${delay}ms`;
    element.style.transform = '';
    element.style.opacity = '';
  });
}

// Flip a card face-up in the arena: a half-turn on Y, then the face swaps.
export function flipCard(element, onMidway) {
  if (reducedMotion) {
    if (onMidway) onMidway();
    return;
  }
  element.style.transition = 'transform 200ms ease-in';
  element.style.transform = 'rotateY(90deg)';
  setTimeout(() => {
    if (onMidway) onMidway();
    element.style.transition = 'transform 220ms cubic-bezier(.2,.9,.3,1.2)';
    element.style.transform = '';
  }, 200);
}

// The winner's card pops; the loser's dims. Called once the round resolves.
export function resolvePop(winnerElement, loserElement) {
  if (reducedMotion) return;
  if (winnerElement) {
    winnerElement.style.transition = 'transform 260ms cubic-bezier(.2,.9,.3,1.4)';
    winnerElement.style.transform = 'scale(1.07)';
    setTimeout(() => {
      winnerElement.style.transform = '';
    }, 480);
  }
  if (loserElement) loserElement.classList.add('dimmed');
}

// A floating damage numeral that rises and fades above the loser. The
// position is computed from the slot's box relative to the stage, unscaled,
// so it lands in the right place at any window size.
export function floatDamage(container, text) {
  const bubble = document.createElement('div');
  bubble.className = 'damage-float';
  bubble.textContent = text;
  const stage = document.getElementById('stage');
  const stageRect = stage.getBoundingClientRect();
  const scale = stageRect.width / 1280 || 1;
  const rect = container.getBoundingClientRect();
  bubble.style.left = `${(rect.left - stageRect.left) / scale + rect.width / scale / 2 - 20}px`;
  bubble.style.top = `${(rect.top - stageRect.top) / scale + 20}px`;
  stage.appendChild(bubble);
  setTimeout(() => bubble.remove(), 1400);
}

// A short shake of the whole stage on heavy damage (4+). Never more than
// a third of a second, and never when reduced motion is on.
export function shakeStage(stage) {
  if (reducedMotion) return;
  stage.classList.remove('shake');
  void stage.offsetWidth;
  stage.classList.add('shake');
  setTimeout(() => stage.classList.remove('shake'), 350);
}

// One gold flash across the stage for a win: a single overlay fade, never a
// strobe (at most one flash per win, well under three flashes a second).
export function goldFlash(stage) {
  if (reducedMotion) return;
  const flash = document.createElement('div');
  flash.className = 'gold-flash';
  stage.appendChild(flash);
  setTimeout(() => flash.remove(), 700);
}

// Ember particles on the overlay canvas. A burst is one win flourish; the
// ambient drift runs quietly behind the title and the table.
export function createParticles(canvas) {
  const context = canvas.getContext('2d');
  const particles = [];
  let running = false;

  function resize() {
    canvas.width = canvas.clientWidth * Math.min(window.devicePixelRatio || 1, 2);
    canvas.height = canvas.clientHeight * Math.min(window.devicePixelRatio || 1, 2);
  }
  resize();
  window.addEventListener('resize', resize);

  function spawn(x, y, count, spread, upward) {
    for (let index = 0; index < count; index += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 0.4 + Math.random() * spread;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: upward ? -Math.abs(Math.sin(angle)) * speed - 0.4 : Math.sin(angle) * speed,
        life: 1,
        size: 2 + Math.random() * 3.5,
        gold: Math.random() < 0.75,
      });
    }
  }

  function frame() {
    if (!running) return;
    const width = canvas.width;
    const height = canvas.height;
    context.clearRect(0, 0, width, height);
    for (let index = particles.length - 1; index >= 0; index -= 1) {
      const particle = particles[index];
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vy -= 0.012;
      particle.life -= 0.012;
      if (particle.life <= 0 || particle.y < -10) {
        particles.splice(index, 1);
        continue;
      }
      context.globalAlpha = Math.max(0, particle.life);
      context.fillStyle = particle.gold ? '#F2B544' : '#E4572E';
      context.beginPath();
      context.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    if (particles.length > 0) requestAnimationFrame(frame);
    else running = false;
  }

  function ensureRunning() {
    if (!running) {
      running = true;
      requestAnimationFrame(frame);
    }
  }

  return {
    burst(x, y, count = 36) {
      if (reducedMotion) return;
      spawn(x, y, count, 2.6, true);
      ensureRunning();
    },
    drift(x, y) {
      if (reducedMotion) return;
      if (particles.length < 24 && Math.random() < 0.4) spawn(x, y, 1, 0.3, true);
      ensureRunning();
    },
    clear() {
      particles.length = 0;
      if (context) context.clearRect(0, 0, canvas.width, canvas.height);
      running = false;
    },
  };
}
