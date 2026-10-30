import { searchShows } from '../api.js';
import * as grid from './grid.js';

let formEl, inputEl;
let onSubmitCb = null;
let onSearchCb = null;
let onResetCb = null;
let onResultsCb = null;
let requestId = 0;

function onSubmit(e) {
  e.preventDefault();
  const query = inputEl.value.trim();
  if (!query) return;
  if (onSubmitCb) onSubmitCb(query);
  else run(query);
}

export async function run(query) {
  inputEl.value = query;
  const id = ++requestId;
  onSearchCb?.(query);
  grid.showLoading();
  try {
    const results = await searchShows(query);
    // A newer search (or a reset) started while this one was in flight.
    if (id !== requestId) return;
    onResultsCb?.(results || [], query);
  } catch (err) {
    if (id !== requestId) return;
    console.error(err);
    grid.showError('Search failed. Please try again.');
  }
}

export function cancel() {
  requestId++;
}

export function init({ form, input, onSubmit: submitCb, onSearch, onReset, onResults }) {
  formEl = form;
  inputEl = input;
  onSubmitCb = submitCb || null;
  onSearchCb = onSearch || null;
  onResetCb = onReset || null;
  onResultsCb = onResults || null;

  formEl.addEventListener('submit', onSubmit);
  inputEl.addEventListener('search', () => {
    if (inputEl.value === '') onResetCb?.();
  });
}
