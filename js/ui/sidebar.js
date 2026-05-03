import { $, escapeHtml } from '../util/dom.js';

const FUN_FACTS = [
  'The longest movie ever made is over 85 hours long.',
  'The first feature-length animated movie was made in 1917.',
  'James Cameron drew the sketch of Rose in Titanic himself.',
  'The sound of velociraptors in Jurassic Park is mating tortoises.',
  'Psycho was the first American film to show a toilet flushing.',
];

const QUOTES = [
  'May the Force be with you.',
  "Here's looking at you, kid.",
  "I'll be back.",
  'You talking to me?',
  'To infinity and beyond!',
  "I'm king of the world!",
  'Why so serious?',
  'Houston, we have a problem.',
];

function makeUpcoming() {
  const now = new Date();
  const day = (offset, h, m = 0) => {
    const d = new Date(now); d.setDate(now.getDate() + offset); d.setHours(h, m, 0, 0); return d;
  };
  return [
    { title: 'Avengers: Secret Wars',     release: day(2, 20),     window: 7 },
    { title: 'Star Wars: New Dawn',       release: day(7, 18, 30), window: 14 },
    { title: 'Jurassic World: Extinction',release: day(14, 21),    window: 21 },
  ];
}

function pad(n) { return String(n).padStart(2, '0'); }

function renderCountdownItem(movie) {
  const now = new Date();
  let diff = Math.max(0, movie.release - now);
  const finished = (movie.release - now) <= 0;
  const totalMs = movie.window * 24 * 60 * 60 * 1000;
  const remainingMs = movie.release - now;
  const percent = finished ? 100 : Math.min(100, Math.max(0, (1 - remainingMs / totalMs) * 100));

  const days = Math.floor(diff / 86400000); diff -= days * 86400000;
  const hours = Math.floor(diff / 3600000); diff -= hours * 3600000;
  const mins = Math.floor(diff / 60000);    diff -= mins * 60000;
  const secs = Math.floor(diff / 1000);

  const timeHtml = finished
    ? `<span class="countdown-item__time countdown-item__time--live">Now showing</span>`
    : `<span class="countdown-item__time">${pad(days)}d ${pad(hours)}h ${pad(mins)}m ${pad(secs)}s</span>`;

  return `
    <li class="countdown-item">
      <span class="countdown-item__title">${escapeHtml(movie.title)}</span>
      ${timeHtml}
      <div class="countdown-item__bar"><div class="countdown-item__fill" style="width:${percent}%"></div></div>
    </li>`;
}

export function init({ countdownList, funFact, quote }) {
  const movies = makeUpcoming();
  const tick = () => {
    countdownList.innerHTML = movies.map(renderCountdownItem).join('');
  };
  tick();
  setInterval(tick, 1000);

  funFact.textContent = FUN_FACTS[Math.floor(Math.random() * FUN_FACTS.length)];
  quote.textContent = `“${QUOTES[Math.floor(Math.random() * QUOTES.length)]}”`;
}
