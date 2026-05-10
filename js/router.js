const routes = new Map();
let currentRoute = null;
let notFoundHandler = null;

function parse(hash) {
  const raw = (hash || '').replace(/^#\/?/, '');
  if (!raw) return { path: '', parts: [], query: {} };
  const [pathPart, qs] = raw.split('?');
  const parts = pathPart.split('/').filter(Boolean);
  const query = {};
  if (qs) {
    for (const pair of qs.split('&')) {
      if (!pair) continue;
      const [k, v = ''] = pair.split('=');
      query[decodeURIComponent(k)] = decodeURIComponent(v);
    }
  }
  return { path: pathPart, parts, query };
}

function match(parts) {
  for (const [pattern, handler] of routes.entries()) {
    const segs = pattern.split('/').filter(Boolean);
    if (segs.length !== parts.length) continue;
    const params = {};
    let ok = true;
    for (let i = 0; i < segs.length; i++) {
      if (segs[i].startsWith(':')) params[segs[i].slice(1)] = decodeURIComponent(parts[i]);
      else if (segs[i] !== parts[i]) { ok = false; break; }
    }
    if (ok) return { handler, params };
  }
  return null;
}

function resolve() {
  const { parts, query } = parse(location.hash);
  const found = match(parts) || (parts.length === 0 ? match([]) : null);
  if (found) {
    currentRoute = { parts, query };
    found.handler({ params: found.params, query });
  } else if (notFoundHandler) {
    notFoundHandler({ query });
  }
}

export function on(pattern, handler) { routes.set(pattern, handler); }
export function notFound(handler) { notFoundHandler = handler; }
export function start() {
  window.addEventListener('hashchange', resolve);
  resolve();
}
export function go(path) {
  if (location.hash === `#${path}`) resolve();
  else location.hash = path;
}
export function current() { return currentRoute; }
