// Works out what a show helper chat message is asking for. No AI: keyword
// rules over the text. Returns { intent, query, genre }, where `query` is a
// show title when the message names one ("cast of Friends" → "friends").

// Follow-up questions, checked in order. Each can be about the show the chat is
// already discussing, or name a new one.
const FOLLOW_UPS = [
  ['cast', /\b(cast|actors?|actress(es)?|starring|who (stars|plays|is in|acts))\b/],
  // "when" only counts with an airing word later, and the title between them is kept.
  ['next', /\b(next( episode| ep)?|new episodes?|air ?date|airing|com(e|ing) back|returns?|when\b(?=.*\b(on|airs?|out|back|returns?)\b))\b/],
  ['similar', /\b(similar( to)?|shows? like|more like|like (this|it|that))\b/],
  ['binge', /\b(binge|how long|how many (episodes|seasons)|episodes|seasons|runtime)\b/],
  ['status', /\b(still (running|on|airing|going)|ended|cancell?ed|renewed|status)\b/],
  ['rating', /\b(rating|rated|score|worth (it|watching)|any good|is it good)\b/],
  ['add', /\b(add|save|watchlist|my list|remember)\b/],
  ['open', /\b(open|details|more info|tell me more)\b/],
];

// Words that are left over once the keyword is gone, but aren't part of a title.
const FILLER = /\b(of|for|the show|show|shows|series|tv|to|in|is|does|do|it|me|about|please|what|whats|what's|are|on|a|an|with|be|when|will|how|many|can|you|i|there|any|this|that|its|it's|time|watch|watching)\b/g;

// Moods and genre words → TVMaze genres.
const GENRES = [
  [/\b(funny|comedy|comedies|laugh|hilarious|sitcom)\b/, 'Comedy'],
  [/\b(scary|horror|creepy|spooky|frightening)\b/, 'Horror'],
  [/\b(crime|detective|cops?|heist|gangster)\b/, 'Crime'],
  [/\b(mystery|mysteries|whodunn?it)\b/, 'Mystery'],
  [/\b(sci-?fi|science fiction|space|aliens?|futuristic)\b/, 'Science-Fiction'],
  [/\b(romance|romantic|love stor(y|ies))\b/, 'Romance'],
  [/\b(action|explosive|fights?)\b/, 'Action'],
  [/\b(thriller|thrilling|suspense|tense|edge of my seat)\b/, 'Thriller'],
  [/\b(fantasy|magic|dragons?|wizards?)\b/, 'Fantasy'],
  [/\b(drama|dramatic|emotional|cry|sad)\b/, 'Drama'],
  [/\b(family|kids|children)\b/, 'Family'],
  [/\b(anime)\b/, 'Anime'],
  [/\b(supernatural|ghosts?|vampires?|witch(es)?)\b/, 'Supernatural'],
  [/\b(war|military)\b/, 'War'],
  [/\b(history|historical|period)\b/, 'History'],
  [/\b(medical|hospital|doctors?)\b/, 'Medical'],
  [/\b(legal|lawyers?|courtroom)\b/, 'Legal'],
];

const ASKS_FOR_IDEAS = /\b(something|recommend|suggest(ion)?s?|ideas?|give me|show me|looking for|in the mood|what should i watch|anything)\b/;

function genreOf(text) {
  return GENRES.find(([re]) => re.test(text))?.[1] || null;
}

// What's left of `text` once `re` and filler words are taken out: a title, or ''.
function leftover(text, re) {
  return text
    .replace(new RegExp(re.source, 'g'), ' ')   // every match: "add it to my list"
    .replace(FILLER, ' ')
    .replace(/[^\w\s'&:-]/g, ' ')
    .replace(/\b(the\s+)+/g, 'the ')            // "the next episode of the office"
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^the$|\s+the$/, '');
}

export function parseMessage(input, { hasShow = false } = {}) {
  const raw = String(input || '').trim();
  const text = raw.toLowerCase().replace(/[?!.]+$/, '').trim();
  if (!text) return { intent: 'empty' };

  if (/^(hi|hello|hey|yo|howdy|hiya|good (morning|afternoon|evening))\b/.test(text) && text.split(/\s+/).length <= 3) {
    return { intent: 'greeting' };
  }
  if (/^(thanks|thank you|thx|ty|cheers|great|cool|awesome|nice)\b/.test(text) && text.split(/\s+/).length <= 4) {
    return { intent: 'thanks' };
  }
  if (/\b(help|what can you do|how does this work|commands)\b/.test(text)) return { intent: 'help' };

  // "something funny", "recommend a drama", or just "scary shows".
  const genre = genreOf(text);
  const justGenre = genre && leftover(text, GENRES.find(([, g]) => g === genre)[0]) === '';
  if (genre && (ASKS_FOR_IDEAS.test(text) || justGenre)) return { intent: 'mood', genre };

  for (const [intent, re] of FOLLOW_UPS) {
    if (!re.test(text)) continue;
    const query = leftover(text, re);
    // "recommend something" with no show yet means ideas, not similar shows.
    if (intent === 'similar' && !query && !hasShow) break;
    return { intent, query: query.length >= 2 ? query : null };
  }

  if (ASKS_FOR_IDEAS.test(text)) return { intent: 'mood', genre: null };

  // Anything else is a title. Drop a lead-in like "tell me about".
  const query = raw.replace(/^(tell me about|what about|info (on|about)|search( for)?|find|look up|lookup)\s+/i, '').trim();
  return { intent: 'title', query };
}
