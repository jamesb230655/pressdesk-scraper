export function log(msg, data = null) {
  const ts = new Date().toISOString();
  if (data) {
    console.log(`[${ts}] ${msg}`, JSON.stringify(data, null, 2));
  } else {
    console.log(`[${ts}] ${msg}`);
  }
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Clean up scraped text — remove extra whitespace, newlines etc
export function cleanText(str) {
  if (!str) return null;
  return str.replace(/\s+/g, ' ').trim() || null;
}

// Extract Twitter handle from a URL or raw handle string
export function extractTwitterHandle(str) {
  if (!str) return null;
  const match = str.match(/(?:twitter\.com\/|x\.com\/|^@?)([A-Za-z0-9_]{1,15})/);
  return match ? `@${match[1]}` : null;
}

// Very basic email format check
export function looksLikeEmail(str) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str || '');
}

// Infer beat tags from role/title text
export function inferBeats(roleText) {
  if (!roleText) return [];
  const lower = roleText.toLowerCase();
  const beats = [];
  const map = {
    music:       ['music', 'album', 'gig', 'concert', 'band', 'artist'],
    fashion:     ['fashion', 'style', 'beauty', 'luxury'],
    food:        ['food', 'restaurant', 'dining', 'drink', 'chef'],
    film:        ['film', 'cinema', 'movie', 'screen'],
    tv:          ['television', ' tv ', 'streaming', 'broadcast'],
    tech:        ['tech', 'technology', 'digital', 'ai', 'startup'],
    politics:    ['politics', 'political', 'westminster', 'parliament'],
    business:    ['business', 'finance', 'economy', 'markets'],
    culture:     ['culture', 'arts', 'theatre', 'gallery'],
    sport:       ['sport', 'football', 'cricket', 'tennis'],
    lifestyle:   ['lifestyle', 'wellness', 'health', 'travel'],
  };
  for (const [beat, keywords] of Object.entries(map)) {
    if (keywords.some(k => lower.includes(k))) beats.push(beat);
  }
  return beats;
}
