export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);

export function html(strings, ...values) {
  let out = '';
  for (let i = 0; i < strings.length; i++) {
    out += strings[i];
    if (i < values.length) {
      const v = values[i];
      if (v && typeof v === 'object' && 'raw' in v) out += v.raw;
      else out += escapeHtml(v);
    }
  }
  return out;
}

export const raw = (s) => ({ raw: String(s ?? '') });

export const stripTags = (s) => String(s ?? '').replace(/<[^>]+>/g, '');
