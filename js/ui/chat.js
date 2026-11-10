import { html, raw, stripTags } from '../util/dom.js';
import { searchShows, fetchCast, fetchNextEpisode, fetchShowEpisodes, showImage } from '../api.js';
import { getChatState, saveChatState, isInWatchlist, toggleWatchlist, getRating, subscribe } from '../storage.js';
import { episodeText, relativeTime } from '../util/episode.js';
import { parseMessage } from '../util/chat-intents.js';
import * as modal from './modal.js';

// Show helper: a small chat that answers questions about TV shows from TVMaze
// data. It appears a few seconds after Home is first shown.

const PROMPT_DELAY_MS = 4000;
const MIN_TYPING_MS = 350;   // even instant answers "type" briefly, so replies don't feel abrupt
const CAST_COUNT = 6;
const SUGGEST_COUNT = 3;

let rootEl, launcher, prompt, panel, log, form, input;
let getShows = () => [];
let timer = null;
let revealed = false;
let queue = Promise.resolve();   // messages are answered one at a time, in order
let pending = 0;
let current = null;           // the show the conversation is about
const known = new Map();      // id → show, for buttons in the log

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const yearOf = (date) => (date ? date.slice(0, 4) : null);
const channelOf = (show) => show.network?.name || show.webChannel?.name || '';
const remember = (show) => { known.set(show.id, show); return show; };

// ---- Messages ----

function scrollDown() { log.scrollTop = log.scrollHeight; }

function addUser(text) {
  const li = document.createElement('li');
  li.className = 'chat__msg chat__msg--user';
  li.textContent = text;
  log.append(li);
  scrollDown();
}

// `body` is markup built with the `html` template; `chips` are quick replies.
function addBot(body, chips = []) {
  const li = document.createElement('li');
  li.className = 'chat__msg chat__msg--bot';
  li.innerHTML = body + (chips.length ? html`
    <div class="chat__chips">${raw(chips.map((c) => (c.show
      ? html`<button type="button" class="chat__chip" data-chat-pick="${c.show.id}">${c.label}</button>`
      : html`<button type="button" class="chat__chip" data-chat-chip="${c.label}">${c.label}</button>`)).join(''))}</div>` : '');
  log.append(li);
  scrollDown();
}

function showTyping() {
  const li = document.createElement('li');
  li.className = 'chat__msg chat__msg--bot chat__typing';
  li.dataset.chatTyping = '';
  li.setAttribute('aria-label', 'Show helper is typing');
  li.innerHTML = '<span></span><span></span><span></span>';
  log.append(li);
  scrollDown();
  return () => li.remove();
}

const FOLLOW_UP_CHIPS = ['Cast', 'Next episode', 'Similar shows', 'Binge time'].map((label) => ({ label }));

// ---- Show card ----

const addLabel = (on) => html`<i class="fa-${on ? 'solid' : 'regular'} fa-heart" aria-hidden="true"></i> ${on ? 'In My list' : 'Add to My list'}`;

function addButtonHTML(show) {
  const on = isInWatchlist(show.id);
  return html`<button type="button" class="chat-card__btn${on ? ' is-on' : ''}" data-chat-add="${show.id}" aria-pressed="${on}">${raw(addLabel(on))}</button>`;
}

function showCardHTML(show) {
  remember(show);
  const start = yearOf(show.premiered);
  const end = show.status === 'Running' ? 'present' : yearOf(show.ended);
  const years = start ? `${start}${end && end !== start ? `–${end}` : ''}` : '';
  const rating = show.rating?.average;
  const meta = [years, rating != null ? `★ ${Number(rating).toFixed(1)}` : '', channelOf(show)].filter(Boolean).join(' · ');
  const summary = stripTags(show.summary);
  return html`
    <div class="chat-card">
      <img class="chat-card__poster" src="${showImage(show)}" alt="">
      <div class="chat-card__info">
        <p class="chat-card__title">${show.name}</p>
        ${raw(meta ? html`<p class="chat-card__meta">${meta}</p>` : '')}
        ${raw(show.genres?.length ? html`<p class="chat-card__genres">${show.genres.join(', ')}</p>` : '')}
        ${raw(show.status ? html`<p class="chat-card__status">${show.status}</p>` : '')}
      </div>
    </div>
    ${raw(summary ? html`<p class="chat-card__summary">${summary}</p>` : '')}
    <div class="chat-card__actions">
      <button type="button" class="chat-card__btn chat-card__btn--primary" data-chat-open="${show.id}">
        <i class="fa-solid fa-circle-info" aria-hidden="true"></i> Open details</button>
      ${raw(addButtonHTML(show))}
    </div>`;
}

// A short list of shows; picking one shows its card.
function showListHTML(shows) {
  return html`<ul class="chat-list">${raw(shows.map((s) => {
    remember(s);
    const bits = [s.rating?.average != null ? `★ ${Number(s.rating.average).toFixed(1)}` : '', yearOf(s.premiered), channelOf(s)].filter(Boolean).join(' · ');
    return html`<li><button type="button" class="chat-list__item" data-chat-pick="${s.id}">
      <img class="chat-list__poster" src="${showImage(s)}" alt="">
      <span class="chat-list__text"><span class="chat-list__name">${s.name}</span><span class="chat-list__meta">${bits}</span></span>
    </button></li>`;
  }).join(''))}</ul>`;
}

// Updated in place (not replaced), so a focused button keeps focus.
function syncAddButtons() {
  log?.querySelectorAll('[data-chat-add]').forEach((btn) => {
    const on = isInWatchlist(Number(btn.dataset.chatAdd));
    btn.classList.toggle('is-on', on);
    btn.setAttribute('aria-pressed', String(on));
    btn.innerHTML = addLabel(on);
  });
}

// ---- Answers ----

function present(show, alternatives = []) {
  current = remember(show);
  const others = alternatives.filter((s) => s.id !== show.id).slice(0, 2).map((s) => ({ label: `${s.name}${yearOf(s.premiered) ? ` (${yearOf(s.premiered)})` : ''}`, show: remember(s) }));
  addBot(showCardHTML(show), FOLLOW_UP_CHIPS);
  if (others.length) addBot(html`<p>Or did you mean one of these?</p>`, others);
}

async function lookup(query) {
  const results = await searchShows(query);
  if (!results.length) {
    addBot(html`<p>I couldn’t find a show called “${query}”. Try another spelling?</p>`);
    return;
  }
  present(results[0], results);
}

async function findShow(query) {
  const results = await searchShows(query);
  return results[0] ? remember(results[0]) : null;
}

const ANSWERS = {
  async cast(show) {
    const cast = (await fetchCast(show.id)).slice(0, CAST_COUNT);
    if (!cast.length) return addBot(html`<p>TVMaze doesn’t list a cast for ${show.name}.</p>`);
    addBot(html`<p>The main cast of <strong>${show.name}</strong>:</p>
      <ul class="chat-cast">${raw(cast.map((c) => html`<li>
        <a class="chat-cast__name" href="#/person/${c.person.id}">${c.person.name}</a>
        ${raw(c.character?.name ? html`<span class="chat-cast__role">as ${c.character.name}</span>` : '')}</li>`).join(''))}</ul>`);
  },
  async next(show) {
    if (show.status === 'Ended') {
      return addBot(html`<p><strong>${show.name}</strong> ended${show.ended ? ` in ${yearOf(show.ended)}` : ''}, so there are no new episodes.</p>`, [{ label: 'Similar shows' }]);
    }
    const ep = await fetchNextEpisode(show.id);
    const airs = Date.parse(ep?.airstamp);
    if (!ep || !airs) return addBot(html`<p>No upcoming episode of <strong>${show.name}</strong> has been announced yet.</p>`);
    const when = new Date(airs);
    const date = when.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    const time = when.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const channel = channelOf(show);
    addBot(html`<p>Next up on <strong>${show.name}</strong>: <strong>${episodeText(ep)}</strong>,
      ${date} at ${time}${channel ? ` on ${channel}` : ''} (${relativeTime(airs)}).</p>`);
  },
  async similar(show) {
    const genres = new Set(show.genres || []);
    const picks = getShows()
      .filter((s) => s.id !== show.id && s.image?.medium)
      .map((s) => ({ s, overlap: (s.genres || []).filter((g) => genres.has(g)).length }))
      .filter((x) => x.overlap > 0)
      .sort((a, b) => (b.overlap - a.overlap) || ((b.s.rating?.average ?? 0) - (a.s.rating?.average ?? 0)))
      .slice(0, SUGGEST_COUNT)
      .map((x) => x.s);
    if (!picks.length) return addBot(html`<p>I don’t have anything like ${show.name} on the home page right now.</p>`);
    addBot(html`<p>If you like <strong>${show.name}</strong>, try:</p>${raw(showListHTML(picks))}`);
  },
  async binge(show) {
    const eps = await fetchShowEpisodes(show.id);
    if (!eps.length) return addBot(html`<p>TVMaze doesn’t list episodes for ${show.name} yet.</p>`);
    const seasons = new Set(eps.map((e) => e.season)).size;
    const minutes = eps.reduce((sum, e) => sum + (e.runtime || show.averageRuntime || show.runtime || 0), 0);
    const hours = Math.round(minutes / 60);
    const nights = Math.ceil(eps.length / 2);
    addBot(html`<p><strong>${show.name}</strong> has ${eps.length} episodes over ${seasons} season${seasons === 1 ? '' : 's'}${hours ? `, about ${hours} hours of TV` : ''}.
      At two episodes a night, that’s ${nights} night${nights === 1 ? '' : 's'}.</p>`);
  },
  async status(show) {
    const text = show.status === 'Running' ? `${show.name} is still running.`
      : show.status === 'Ended' ? `${show.name} ended${show.ended ? ` in ${yearOf(show.ended)}` : ''}.`
        : `${show.name}’s status on TVMaze: ${show.status || 'unknown'}.`;
    addBot(html`<p>${text}</p>`, [{ label: 'Next episode' }]);
  },
  async rating(show) {
    const rating = show.rating?.average;
    const mine = getRating(show.id);
    addBot(html`<p>${rating != null ? `TVMaze viewers rate ${show.name} ${Number(rating).toFixed(1)} out of 10.` : `${show.name} doesn’t have a TVMaze rating yet.`}
      ${mine ? `You rated it ${mine}/10.` : ''}</p>`);
  },
  async add(show) {
    if (isInWatchlist(show.id)) return addBot(html`<p><strong>${show.name}</strong> is already in My list.</p>`);
    toggleWatchlist(show);
    addBot(html`<p>Added <strong>${show.name}</strong> to My list.</p>`);
  },
  async open(show) {
    addBot(html`<p>Opening <strong>${show.name}</strong>…</p>`);
    modal.open(show, input);
  },
};

function recommend(genre) {
  const pool = getShows().filter((s) => s.image?.medium && (!genre || s.genres?.includes(genre)));
  if (!getShows().length) return addBot(html`<p>The home page shows are still loading. Try again in a moment.</p>`);
  if (!pool.length) return addBot(html`<p>No ${genre.toLowerCase()} shows on the home page right now. Try asking about a title instead.</p>`);
  const picks = [...pool].sort((a, b) => (b.rating?.average ?? 0) - (a.rating?.average ?? 0)).slice(0, SUGGEST_COUNT);
  addBot(html`<p>${genre ? `The best-rated ${genre === 'Science-Fiction' ? 'sci-fi' : genre.toLowerCase()} shows on the home page:` : 'The best-rated shows on the home page right now:'}</p>${raw(showListHTML(picks))}`);
}

const HELP = html`<p>Type a show’s title and I’ll tell you about it. Then ask about its <strong>cast</strong>,
  <strong>next episode</strong>, <strong>similar shows</strong> or <strong>binge time</strong>, or say “add it to my list”.
  Not sure what to watch? Try “something funny” or “a scary show”.</p>`;

async function respond(text) {
  const { intent, query, genre } = parseMessage(text, { hasShow: Boolean(current) });
  if (intent === 'greeting') return addBot(html`<p>Hi! Which show are you curious about?</p>`, [{ label: 'What can you do?' }]);
  if (intent === 'thanks') return addBot(html`<p>Happy watching! Ask me about another show any time.</p>`);
  if (intent === 'help') return addBot(HELP, [{ label: 'Something funny' }]);
  if (intent === 'mood') return recommend(genre);
  if (intent === 'title') return lookup(query);
  // A follow-up: about a named show, or the one we're already discussing.
  let show = current;
  if (query) {
    show = await findShow(query);
    if (!show) return addBot(html`<p>I couldn’t find a show called “${query}”. Try another spelling?</p>`);
    current = show;
  }
  if (!show) return addBot(html`<p>Which show do you mean? Type its title first.</p>`);
  return ANSWERS[intent](show);
}

// Echo the message, then answer it.
async function answer(text, pickId) {
  addUser(text);
  const stopTyping = showTyping();
  try {
    const reply = pickId ? Promise.resolve(present(known.get(pickId))) : respond(text);
    await Promise.all([reply, sleep(MIN_TYPING_MS)]);
  } catch (err) {
    console.error(err);
    addBot(html`<p>Sorry, I couldn’t reach TVMaze just now. Try again in a moment?</p>`);
  } finally {
    stopTyping();
    scrollDown();
  }
}

// Messages sent while a reply is still coming wait their turn instead of being dropped.
function send(text, pickId = null) {
  if (!text) return;
  pending++;
  log.setAttribute('aria-busy', 'true');
  queue = queue.then(() => answer(text, pickId)).finally(() => {
    if (--pending === 0) log.setAttribute('aria-busy', 'false');
  });
}

// ---- Launcher, prompt and panel ----

function dismissPrompt() {
  prompt.hidden = true;
  if (!getChatState().promptDismissed) saveChatState({ ...getChatState(), promptDismissed: true });
}

function reveal() {
  revealed = true;
  launcher.hidden = false;
  if (!getChatState().promptDismissed) prompt.hidden = false;
}

function open() {
  dismissPrompt();
  panel.hidden = false;
  rootEl.classList.add('is-open');
  launcher.setAttribute('aria-expanded', 'true');
  launcher.setAttribute('aria-label', 'Close the show helper chat');
  if (!log.children.length) {
    addBot(html`<p>Hi! I’m your show helper. Type a TV show’s title and I’ll tell you about it.</p>`,
      [{ label: 'Breaking Bad' }, { label: 'Something funny' }, { label: 'What can you do?' }]);
  }
  input.focus();
}

function close({ focusLauncher = true } = {}) {
  if (panel.hidden) return;
  panel.hidden = true;
  rootEl.classList.remove('is-open');
  launcher.setAttribute('aria-expanded', 'false');
  launcher.setAttribute('aria-label', 'Open the show helper chat');
  if (focusLauncher) launcher.focus();
}

// Called whenever Home is shown; the first time starts the countdown.
export function homeShown() {
  if (!rootEl || revealed || timer) return;
  timer = setTimeout(reveal, PROMPT_DELAY_MS);
}

export function init({ root, shows }) {
  rootEl = root;
  if (!rootEl) return;
  getShows = shows || getShows;
  launcher = rootEl.querySelector('[data-chat-launcher]');
  prompt = rootEl.querySelector('[data-chat-prompt]');
  panel = rootEl.querySelector('[data-chat-panel]');
  log = rootEl.querySelector('[data-chat-log]');
  form = rootEl.querySelector('[data-chat-form]');
  input = rootEl.querySelector('[data-chat-input]');

  launcher.addEventListener('click', () => (panel.hidden ? open() : close()));
  rootEl.querySelector('[data-chat-prompt-open]').addEventListener('click', open);
  rootEl.querySelector('[data-chat-prompt-close]').addEventListener('click', dismissPrompt);
  rootEl.querySelector('[data-chat-close]').addEventListener('click', () => close());
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.stopPropagation(); close(); }
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    send(text);
  });

  log.addEventListener('click', (e) => {
    const chip = e.target.closest('[data-chat-chip]');
    if (chip) { send(chip.dataset.chatChip); return; }
    const pick = e.target.closest('[data-chat-pick]');
    if (pick) {
      const show = known.get(Number(pick.dataset.chatPick));
      if (show) send(show.name, show.id);
      return;
    }
    const openBtn = e.target.closest('[data-chat-open]');
    const toOpen = openBtn && known.get(Number(openBtn.dataset.chatOpen));
    if (toOpen) { modal.open(toOpen, openBtn); return; }
    const addBtn = e.target.closest('[data-chat-add]');
    const toAdd = addBtn && known.get(Number(addBtn.dataset.chatAdd));
    if (toAdd) toggleWatchlist(toAdd);
  });

  subscribe(syncAddButtons);
}
