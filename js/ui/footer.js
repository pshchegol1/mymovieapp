const QUOTES = [
  'Enjoy your movie night.',
  '“Movies touch our hearts and awaken our vision.”',
  'Lights, camera, action.',
  'Keep calm and watch movies.',
  'Every night is movie night.',
  'And the Oscar goes to… you.',
  'Streaming happiness, one show at a time.',
];

export function init({ quoteEl }) {
  if (!quoteEl) return;
  const set = () => { quoteEl.textContent = QUOTES[Math.floor(Math.random() * QUOTES.length)]; };
  set();
  setInterval(set, 9000);
}
