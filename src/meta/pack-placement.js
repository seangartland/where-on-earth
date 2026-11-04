// ---------------------------------------------------------------------------
// Pack placement (Sean, 2026-11-03, modeled on TCG Pocket): after a pack
// opening, each new card hovers over its pack's Passport dex, the dex scrolls
// fast until the card's numbered slot is centered, and the card drops into
// it. An upgrade takes a shorter landing on its existing slot and the slot's
// earned stamp re-stamps at the new tier as the card lands.
//
// passport.js renders the dex with every placed card still in its before
// state (the empty numbered slot, or the slot at its old tier) and hands each
// step here with a build() for the slot after landing. The flying card is a
// build() of that same slot component, in a fixed layer over the dex.
//
// Every timed piece is a Web Animation (the scroll reads its progress from
// one), so a tap can finish them and a stepped capture can pause them. A tap
// lands the current card; a second tap, the Skip button or Escape lands
// everything that is left. Reduced motion lands everything at once.
// ---------------------------------------------------------------------------
import { audio } from '../core/audio.js';

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const HOVER_SCALE = 1.8; // a new card, held up over the dex
const UPGRADE_SCALE = 1.35; // an upgrade hovers lower and smaller: a shorter landing
const APPEAR = 220;
const DESCEND = 320;
const UPGRADE_DESCEND = 240;
const LAND = 240;

// Scroll time grows with the distance but stays short: fast, still trackable.
const scrollDuration = (px) => (px < 4 ? 0 : Math.min(700, Math.max(300, 260 + px * 0.16)));

export function playPackPlacement({ scroller, steps, onEnd }) {
  const layer = document.createElement('div');
  layer.className = 'pp-place-layer';
  // The flight list carries the dex classes so the flying card is styled by
  // the slot component's own rules.
  const flight = document.createElement('ul');
  flight.className = 'pp-dex pp-pack-grid pp-place-flight';
  flight.setAttribute('aria-hidden', 'true');
  const skip = document.createElement('button');
  skip.type = 'button';
  skip.className = 'pp-place-skip';
  skip.textContent = 'Skip';
  layer.append(flight, skip);
  scroller.append(layer);

  let running = []; // the animations of the current step
  let cut = false; // land the current card now
  let skipAll = false; // land every card that is left
  let taps = 0;
  const finishRunning = () => { for (const anim of running) anim.finish(); };
  const endAll = () => { skipAll = true; cut = true; finishRunning(); };
  layer.addEventListener('pointerdown', (event) => {
    if (event.target === skip) return;
    event.preventDefault();
    taps += 1;
    if (taps > 1) endAll();
    else { cut = true; finishRunning(); }
  });
  skip.addEventListener('click', endAll);
  const onKey = (event) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    endAll();
  };
  window.addEventListener('keydown', onKey, true);

  const play = (el, keys, options) => {
    const anim = el.animate(keys, options);
    running.push(anim);
    return anim.finished.catch(() => {});
  };
  const scrollTarget = (slot) => {
    const view = scroller.getBoundingClientRect();
    const rect = slot.getBoundingClientRect();
    const delta = rect.top + rect.height / 2 - (view.top + scroller.clientHeight / 2);
    return Math.min(scroller.scrollHeight - scroller.clientHeight, Math.max(0, scroller.scrollTop + delta));
  };
  // The scroll follows a timing animation's eased progress each frame.
  const scrollTo = async (top) => {
    const from = scroller.scrollTop;
    const duration = scrollDuration(Math.abs(top - from));
    if (!duration || cut) { scroller.scrollTop = top; return; }
    const clock = flight.animate([{ opacity: 1 }, { opacity: 1 }], { duration, easing: 'cubic-bezier(.55,0,.35,1)' });
    running.push(clock);
    const follow = () => {
      const progress = clock.effect.getComputedTiming().progress;
      if (progress != null) scroller.scrollTop = from + (top - from) * progress;
      if (clock.playState !== 'finished' && !cut) requestAnimationFrame(follow);
    };
    requestAnimationFrame(follow);
    await clock.finished.catch(() => {});
    scroller.scrollTop = top;
  };

  const land = (step) => {
    const slot = step.build();
    step.slot.replaceWith(slot);
    step.slot = slot;
    return slot;
  };

  const runStep = async (step) => {
    running = [];
    cut = skipAll;
    const upgrade = step.kind === 'upgrade';
    step.slot.classList.add('pp-place-target');
    const flyer = step.build();
    flyer.removeAttribute('tabindex');
    flyer.classList.add('pp-place-card');
    flight.replaceChildren(flyer);
    const w = step.slot.getBoundingClientRect().width;
    flyer.style.width = `${w}px`;
    // An empty numbered slot is shorter than a placed card: the slot takes
    // the card's height now, while the dex scrolls, so the card lands flush
    // instead of overhanging it.
    const h = flyer.offsetHeight;
    step.slot.style.minHeight = `${h}px`;
    // Held over the middle of the screen, just above where the slot will sit
    // once it is centered.
    const scale = upgrade ? UPGRADE_SCALE : HOVER_SCALE;
    const view = scroller.getBoundingClientRect();
    const midY = view.top + scroller.clientHeight / 2;
    const hoverY = midY - h / 2 - 18 - (h * scale) / 2;
    const at = (cx, cy, s) => `translate(${cx - (w * s) / 2}px, ${cy - (h * s) / 2}px) scale(${s})`;
    const hover = at(view.left + scroller.clientWidth / 2, hoverY, scale);
    if (!cut) {
      await play(flyer, [
        { transform: `${hover} translateY(-18px)`, opacity: 0 },
        { transform: hover, opacity: 1 },
      ], { duration: APPEAR, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' });
    }
    await scrollTo(scrollTarget(step.slot));
    if (!cut) {
      const rect = step.slot.getBoundingClientRect();
      await play(flyer, [
        { transform: hover, opacity: 1 },
        { transform: at(rect.left + w / 2, rect.top + h / 2, 1), opacity: 1 },
      ], { duration: upgrade ? UPGRADE_DESCEND : DESCEND, easing: 'cubic-bezier(.5,0,.25,1)', fill: 'forwards' });
    }
    flyer.remove();
    step.slot.classList.remove('pp-place-target');
    const slot = land(step);
    if (cut) return;
    audio.thump();
    if (upgrade) audio.chime();
    if (navigator.vibrate) navigator.vibrate(12);
    const landing = [play(slot, [{ transform: 'scale(1.07)' }, { transform: 'none' }], { duration: LAND, easing: 'cubic-bezier(.2,1.4,.4,1)' })];
    if (upgrade) {
      // The earned stamp strikes again at its new tier, with one foil glint
      // across the card.
      const stamp = slot.querySelector('.pp-slot-score');
      if (stamp) {
        landing.push(play(stamp, [
          { transform: 'rotate(-11deg) scale(1.9)', opacity: 0 },
          { transform: 'rotate(-11deg) scale(1)', opacity: 1 },
        ], { duration: LAND, easing: 'cubic-bezier(.3,1.5,.5,1)' }));
      }
      const glint = document.createElement('span');
      glint.className = 'pp-place-glint';
      slot.append(glint);
      landing.push(play(glint, [{ transform: 'translateX(-110%)' }, { transform: 'translateX(110%)' }], { duration: 420, easing: 'ease-out' })
        .then(() => glint.remove()));
    }
    await Promise.all(landing);
  };

  const run = async () => {
    if (reducedMotion()) skipAll = true;
    for (const step of steps) {
      if (skipAll) {
        land(step);
        continue;
      }
      await runStep(step);
    }
    // Leave the dex on the last card placed.
    const last = steps[steps.length - 1]?.slot;
    if (last?.isConnected) scroller.scrollTop = scrollTarget(last);
    window.removeEventListener('keydown', onKey, true);
    layer.remove();
    onEnd?.();
  };
  run();
}
