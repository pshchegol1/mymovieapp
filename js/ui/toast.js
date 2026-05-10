import { escapeHtml } from '../util/dom.js';

let containerEl = null;
let counter = 0;

function ensure() {
  if (containerEl) return containerEl;
  containerEl = document.createElement('div');
  containerEl.className = 'toast-stack';
  containerEl.setAttribute('aria-live', 'polite');
  containerEl.setAttribute('aria-atomic', 'true');
  document.body.appendChild(containerEl);
  return containerEl;
}

export function show(message, opts = {}) {
  const root = ensure();
  const id = `toast-${++counter}`;
  const icon = opts.icon || 'fa-solid fa-circle-check';
  const tone = opts.tone || 'success';
  const node = document.createElement('div');
  node.className = `toast toast--${tone}`;
  node.id = id;
  node.innerHTML = `<i class="${escapeHtml(icon)}" aria-hidden="true"></i><span>${escapeHtml(message)}</span>`;
  root.appendChild(node);
  requestAnimationFrame(() => node.classList.add('toast--in'));
  const dur = opts.duration ?? 2200;
  setTimeout(() => {
    node.classList.remove('toast--in');
    node.classList.add('toast--out');
    setTimeout(() => node.remove(), 240);
  }, dur);
}
