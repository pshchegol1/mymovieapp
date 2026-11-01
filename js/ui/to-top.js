// Floating "back to top" button: appears once the page is scrolled down, and
// its ring fills with how far down the page you are.
const SHOW_AFTER = 0.8;   // viewport heights scrolled before it appears
const RING_LENGTH = 2 * Math.PI * 22;   // circumference of the SVG ring (r=22)

let btnEl, ringEl;
let frame = 0;

const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)');

function scrollToTop() {
  window.scrollTo({ top: 0, behavior: reducedMotion?.matches ? 'auto' : 'smooth' });
}

function sync() {
  frame = 0;
  const max = document.documentElement.scrollHeight - window.innerHeight;
  const y = window.scrollY;
  const visible = y > window.innerHeight * SHOW_AFTER;
  btnEl.classList.toggle('is-visible', visible);
  // Toasts share the corner, so they move up while the button is there.
  document.body.classList.toggle('has-to-top', visible);
  const progress = max > 0 ? Math.min(y / max, 1) : 0;
  ringEl.style.strokeDashoffset = String(RING_LENGTH * (1 - progress));
}

function onScroll() {
  if (!frame) frame = requestAnimationFrame(sync);
}

export function init({ button }) {
  btnEl = button;
  if (!btnEl) return;
  ringEl = btnEl.querySelector('[data-to-top-ring]');
  ringEl.style.strokeDasharray = String(RING_LENGTH);
  btnEl.addEventListener('click', () => {
    btnEl.classList.remove('is-launching');
    void btnEl.offsetWidth;   // restart the animation
    btnEl.classList.add('is-launching');
    scrollToTop();
  });
  btnEl.addEventListener('animationend', () => btnEl.classList.remove('is-launching'));
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });
  sync();
}
