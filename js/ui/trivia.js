import { escapeHtml } from '../util/dom.js';
import { fetchCast, showImage } from '../api.js';
import { getTriviaStats, saveTriviaStats } from '../storage.js';
import * as modal from './modal.js';
import * as toast from './toast.js';

// A quick quiz built from the home page's shows. Each question kind returns
// null when the data can't support it, and is skipped.

const POOL_SIZE = 60;           // the most popular shows, so questions are guessable
const STREAK_CHEERS = { 3: 'Hat trick!', 5: 'On fire!', 10: 'Ten in a row. Couch legend!' };
const GENERIC_CHARACTER = /^(him|her|them)sel(f|ves)$|^self$|narrator|host|judge|contestant|various|unknown/i;

let rootEl;
let shows = null;         // the home page's shows; null until loaded
let pool = [];
let queue = [];
let lastKind = null;
let question = null;
let answered = false;
let streak = 0;
let asked = 0;            // questions shown so far, so each render is distinguishable
let refs = new Map();     // show id → show, for show names rendered as buttons
let requestId = 0;

const pickOne = (arr) => arr[Math.floor(Math.random() * arr.length)];
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const sample = (arr, n) => shuffle(arr).slice(0, n);

const yearOf = (show) => Number(show.premiered?.slice(0, 4)) || null;
const channelOf = (show) => show.network || show.webChannel || null;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

// A show name that opens its details (only used once the answer is revealed).
function ref(show) {
  refs.set(show.id, show);
  return `<button type="button" class="trivia__show" data-trivia-show="${show.id}">${escapeHtml(show.name)}</button>`;
}

// Two other shows to fill out the options, sharing a genre with `target` when
// possible so the answer isn't obvious.
function distractors(target, n = 2) {
  const others = pool.filter((s) => s.id !== target.id && s.name !== target.name);
  const alike = others.filter((s) => s.genres?.some((g) => target.genres?.includes(g)));
  return sample(alike.length >= n ? alike : others, n);
}

// Options are show names, in random order; `answer` is the index of `target`.
function nameOptions(target, others) {
  const options = shuffle([target, ...others]);
  return { options: options.map((s) => ({ label: s.name, show: s })), answer: options.indexOf(target) };
}

// Each kind returns a question, or null when the data doesn't support it.
const KINDS = [
  {
    id: 'poster', label: 'Poster zoom', icon: 'fa-magnifying-glass',
    make() {
      if (pool.length < 3) return null;
      const target = pickOne(pool);
      const { options, answer } = nameOptions(target, distractors(target));
      // Zoom in somewhere around the middle, away from the title at the edges.
      const origin = `${25 + Math.round(Math.random() * 50)}% ${20 + Math.round(Math.random() * 45)}%`;
      return {
        prompt: 'We zoomed in on a poster. Which show is it?',
        art: { src: showImage(target), origin },
        options, answer,
        reveal: () => `It’s ${ref(target)}${yearOf(target) ? ` (${yearOf(target)})` : ''}.`,
      };
    },
  },
  {
    id: 'character', label: 'Who’s that character?', icon: 'fa-masks-theater',
    async make() {
      if (pool.length < 3) return null;
      const target = pickOne(pool);
      const cast = (await fetchCast(target.id)).slice(0, 5)
        .filter((c) => c.character?.name && !GENERIC_CHARACTER.test(c.character.name));
      if (!cast.length) return null;
      const role = pickOne(cast);
      const { options, answer } = nameOptions(target, distractors(target));
      return {
        prompt: `Which show features the character <strong>${escapeHtml(role.character.name)}</strong>?`,
        options, answer,
        reveal: () => `${escapeHtml(role.character.name)} is played by ${escapeHtml(role.person?.name || 'an unknown actor')} in ${ref(target)}.`,
      };
    },
  },
  {
    id: 'first', label: 'Which came first?', icon: 'fa-hourglass-half', pair: true,
    make() {
      const dated = pool.filter(yearOf);
      for (let tries = 0; tries < 20 && dated.length >= 2; tries++) {
        const [a, b] = sample(dated, 2);
        if (yearOf(a) === yearOf(b)) continue;
        const [older, newer] = yearOf(a) < yearOf(b) ? [a, b] : [b, a];
        const gap = yearOf(newer) - yearOf(older);
        return {
          prompt: 'Which of these premiered first?',
          options: [a, b].map((s) => ({ label: s.name, show: s, poster: true })),
          answer: older === a ? 0 : 1,
          reveal: () => `${ref(older)} premiered in ${yearOf(older)}, ${plural(gap, 'year')} before ${ref(newer)}.`,
        };
      }
      return null;
    },
  },
  {
    id: 'rated', label: 'Higher rated?', icon: 'fa-star', pair: true,
    make() {
      const rated = pool.filter((s) => s.rating?.average != null);
      for (let tries = 0; tries < 20 && rated.length >= 2; tries++) {
        const [a, b] = sample(rated, 2);
        const diff = a.rating.average - b.rating.average;
        if (Math.abs(diff) < 0.3) continue;
        const [hi, lo] = diff > 0 ? [a, b] : [b, a];
        return {
          prompt: 'Which one do TVMaze viewers rate higher?',
          options: [a, b].map((s) => ({ label: s.name, show: s, poster: true })),
          answer: hi === a ? 0 : 1,
          reveal: () => `${ref(hi)} scores ${hi.rating.average.toFixed(1)}, ${ref(lo)} ${lo.rating.average.toFixed(1)}.`,
        };
      }
      return null;
    },
  },
  {
    id: 'network', label: 'Where’s it on?', icon: 'fa-tower-broadcast',
    make() {
      const withChannel = pool.filter((s) => channelOf(s)?.name);
      const names = [...new Set(withChannel.map((s) => channelOf(s).name))];
      if (names.length < 3) return null;
      const target = pickOne(withChannel);
      const right = channelOf(target).name;
      const options = shuffle([right, ...sample(names.filter((n) => n !== right), 2)]);
      const country = channelOf(target).country?.name;
      return {
        prompt: `Which network or streaming service is <strong>${escapeHtml(target.name)}</strong> on?`,
        options: options.map((label) => ({ label })),
        answer: options.indexOf(right),
        reveal: () => `${ref(target)} is on ${escapeHtml(right)}${country ? `, from ${escapeHtml(country)}` : ''}.`,
      };
    },
  },
  {
    id: 'year', label: 'Premiere year', icon: 'fa-calendar-days',
    make() {
      const dated = pool.filter(yearOf);
      if (!dated.length) return null;
      const target = pickOne(dated);
      const year = yearOf(target);
      const now = new Date().getFullYear();
      const wrong = shuffle([-6, -4, -3, -2, 2, 3, 4, 6].map((d) => year + d).filter((y) => y <= now)).slice(0, 2);
      const options = [year, ...wrong].sort((a, b) => a - b);
      const date = new Date(`${target.premiered}T00:00`).toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' });
      return {
        prompt: `In what year did <strong>${escapeHtml(target.name)}</strong> premiere?`,
        options: options.map((y) => ({ label: String(y) })),
        answer: options.indexOf(year),
        reveal: () => `${ref(target)} premiered on ${escapeHtml(date)}.`,
      };
    },
  },
];

// Shuffled, so every kind comes up once before any repeats.
function refill() {
  queue = shuffle(KINDS);
  if (queue.length > 1 && queue[0] === lastKind) queue.push(queue.shift());
}

function statsLine(stats) {
  if (!stats.answered) return 'Answer to start a streak.';
  return `Best streak ${stats.best} · ${stats.correct} of ${stats.answered} right`;
}

function optionHTML(o, i) {
  return `
    <button type="button" class="quiz__opt${o.poster ? ' quiz__opt--poster' : ''}" data-quiz-opt="${i}">
      ${o.poster ? `<img class="quiz__thumb" src="${escapeHtml(showImage(o.show))}" alt="">` : ''}
      <span class="quiz__label">${escapeHtml(o.label)}</span>
      <i class="quiz__mark fa-solid" aria-hidden="true"></i>
    </button>`;
}

function render(kind, q) {
  const body = rootEl.querySelector('[data-trivia-body]');
  body.innerHTML = `
    <div class="quiz" data-quiz="${kind.id}" data-quiz-n="${++asked}">
      <div class="quiz__top">
        <span class="quiz__kind"><i class="fa-solid ${kind.icon}" aria-hidden="true"></i> ${escapeHtml(kind.label)}</span>
        <span class="quiz__streak${streak ? ' is-hot' : ''}" data-quiz-streak title="Current streak"
              aria-label="Current streak: ${streak}"><i class="fa-solid fa-fire" aria-hidden="true"></i> ${streak}</span>
      </div>
      ${q.art ? `
      <div class="quiz__art" data-quiz-art>
        <img class="quiz__poster" src="${escapeHtml(q.art.src)}" alt="A close-up of a show poster"
             style="transform-origin: ${q.art.origin}">
      </div>` : ''}
      <p class="quiz__q">${q.prompt}</p>
      <div class="quiz__options${kind.pair ? ' quiz__options--pair' : ''}" role="group" aria-label="Answers">
        ${q.options.map(optionHTML).join('')}
      </div>
      <p class="quiz__reveal" data-quiz-reveal hidden></p>
      <p class="quiz__stats" data-quiz-stats>${escapeHtml(statsLine(getTriviaStats()))}</p>
    </div>`;
  // A poster zoom can't be answered from the placeholder image, so move on.
  body.querySelector('.quiz__poster')?.addEventListener('error', () => {
    if (question === q && !answered) next();
  }, { once: true });
}

function setAction(label, icon) {
  const btn = rootEl.querySelector('[data-trivia-more]');
  btn.innerHTML = `<i class="fa-solid ${icon}" aria-hidden="true"></i> ${label}`;
  return btn;
}

async function next() {
  const reqId = ++requestId;
  const body = rootEl.querySelector('[data-trivia-body]');
  const more = setAction('Skip', 'fa-forward');
  more.disabled = true;
  answered = false;
  // Skip kinds the data can't support, but stop after one full pass.
  for (let i = 0; i < KINDS.length; i++) {
    if (!queue.length) refill();
    const kind = queue.shift();
    let q = null;
    refs = new Map();
    try {
      const made = kind.make();
      // Questions that need a request (the cast) replace the old one right away.
      if (made instanceof Promise) body.innerHTML = '<p class="quiz__note">Loading a question…</p>';
      q = await made;
    } catch (err) {
      console.error(err);
    }
    if (reqId !== requestId) return;
    if (q) {
      lastKind = kind;
      question = q;
      render(kind, q);
      more.disabled = false;
      return;
    }
  }
  question = null;
  body.innerHTML = '<p class="quiz__note">Not enough shows for a quiz right now.</p>';
}

function answer(i) {
  if (answered || !question) return;
  answered = true;
  const right = i === question.answer;
  const quiz = rootEl.querySelector('.quiz');
  const opts = quiz.querySelectorAll('[data-quiz-opt]');
  opts.forEach((btn, k) => {
    btn.disabled = true;
    if (k === question.answer) {
      btn.classList.add('is-correct');
      btn.querySelector('.quiz__mark').classList.add('fa-check');
    } else if (k === i) {
      btn.classList.add('is-wrong');
      btn.querySelector('.quiz__mark').classList.add('fa-xmark');
    }
  });
  quiz.querySelector('[data-quiz-art]')?.classList.add('is-revealed');

  const stats = getTriviaStats();
  const prevBest = stats.best;
  streak = right ? streak + 1 : 0;
  stats.answered++;
  if (right) stats.correct++;
  stats.best = Math.max(stats.best, streak);
  saveTriviaStats(stats);

  const flame = quiz.querySelector('[data-quiz-streak]');
  flame.innerHTML = `<i class="fa-solid fa-fire" aria-hidden="true"></i> ${streak}`;
  flame.setAttribute('aria-label', `Current streak: ${streak}`);
  flame.classList.toggle('is-hot', streak > 0);
  flame.classList.remove('is-bump');
  void flame.offsetWidth;    // restart the animation
  if (right) flame.classList.add('is-bump');

  const reveal = quiz.querySelector('[data-quiz-reveal]');
  reveal.innerHTML = `<strong class="quiz__verdict quiz__verdict--${right ? 'right' : 'wrong'}">${right ? 'Correct!' : 'Not quite.'}</strong> ${question.reveal()}`;
  reveal.hidden = false;
  quiz.querySelector('[data-quiz-stats]').textContent = statsLine(stats);

  if (right && STREAK_CHEERS[streak]) {
    toast.show(`${streak} in a row. ${STREAK_CHEERS[streak]}`, { icon: 'fa-solid fa-fire', tone: 'warn' });
  } else if (right && streak > prevBest && streak >= 3) {
    toast.show(`New best streak: ${streak}!`, { icon: 'fa-solid fa-trophy', tone: 'warn' });
  }

  const more = setAction('Next question', 'fa-arrow-right');
  more.focus();
}

export function setShows(list) {
  shows = list || [];
  pool = [...shows]
    .filter((s) => s.image?.medium)
    .sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0))
    .slice(0, POOL_SIZE);
  if (rootEl) next();
}

export function init({ root }) {
  rootEl = root;
  if (!rootEl) return;
  rootEl.addEventListener('click', (e) => {
    if (e.target.closest('[data-trivia-more]')) { next(); return; }
    const opt = e.target.closest('[data-quiz-opt]');
    if (opt) { answer(Number(opt.dataset.quizOpt)); return; }
    const btn = e.target.closest('[data-trivia-show]');
    const show = btn && refs.get(Number(btn.dataset.triviaShow));
    if (show) modal.open(show, btn);
  });
}
