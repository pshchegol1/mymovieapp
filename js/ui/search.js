import { searchShows } from '../api.js';
import * as grid from './grid.js';

let formEl, inputEl;
let onSearchCb = null;
let onResetCb = null;

async function onSubmit(e) {
  e.preventDefault();
  const query = inputEl.value.trim();
  if (!query) return;
  onSearchCb?.();
  grid.showLoading();
  try {
    const results = await searchShows(query);
    if (!results || results.length === 0) grid.showEmpty(query);
    else grid.setShows(results);
  } catch (err) {
    console.error(err);
    grid.showError('Search failed. Please try again.');
  }
}

export function init({ form, input, onSearch, onReset }) {
  formEl = form;
  inputEl = input;
  onSearchCb = onSearch || null;
  onResetCb = onReset || null;

  formEl.addEventListener('submit', onSubmit);
  inputEl.addEventListener('search', () => {
    if (inputEl.value === '') onResetCb?.();
  });
}
