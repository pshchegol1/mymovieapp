import { searchShows, fetchShows } from '../api.js';
import * as grid from './grid.js';

let formEl, inputEl;

async function onSubmit(e) {
  e.preventDefault();
  const query = inputEl.value.trim();
  if (!query) return;
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

async function onReset() {
  inputEl.value = '';
  grid.showLoading();
  try {
    const shows = await fetchShows(1);
    grid.setShows(shows);
  } catch (err) {
    grid.showError('Failed to load shows.');
  }
}

export function init({ form, input }) {
  formEl = form; inputEl = input;
  formEl.addEventListener('submit', onSubmit);
  inputEl.addEventListener('search', (e) => {
    if (inputEl.value === '') onReset();
  });
}
