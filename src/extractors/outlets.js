import { cleanText, extractTwitterHandle, inferBeats } from '../utils.js';

// ── DIY Magazine ──────────────────────────────────────────────
export function diymagExtractor($, outlet) {
  const contacts = [];
  const seen = new Set();

  $('a[href*="/authors/"], .author-link, [class*="author"]').each((_, el) => {
    const name = cleanText($(el).text());
    if (!name || name.length < 3 || seen.has(name)) return;
    seen.add(name);

    contacts.push({
      full_name: name,
      outlet: 'DIY Magazine',
      outlet_url: 'https://diymag.com',
      beat: ['music'],
      media_type: 'online',
      source_url: outlet.masthead_url,
      source_type: 'scraper',
    });
  });

  return contacts;
}

// ── Kerrang! ──────────────────────────────────────────────────
export function kerrangExtractor($, outlet) {
  const contacts = [];
  const seen = new Set();

  $('a[href*="/authors/"], [class*="author"], [class*="Author"]').each((_, el) => {
    const $el = $(el);
    const name = cleanText($el.find('[class*="name"], h2, h3').first().text() || $el.text());
    if (!name || name.length < 3 || seen.has(name)) return;
    seen.add(name);

    const role = cleanText($el.find('[class*="role"], [class*="title"]').first().text());

    contacts.push({
      full_name: name,
      outlet: 'Kerrang!',
      outlet_url: 'https://kerrang.com',
      role,
      beat: ['music'],
      media_type: 'print',
      source_url: outlet.masthead_url,
      source_type: 'scraper',
    });
  });

  return contacts;
}

// ── BBC News ──────────────────────────────────────────────────
// BBC has a public correspondents page with clean markup
export function bbcExtractor($, outlet) {
  const contacts = [];
  const seen = new Set();

  // BBC correspondents page structure
  $('.correspondent, [class*="correspondent"], .journalist-card').each((_, el) => {
    const $el = $(el);
    const name = cleanText($el.find('h2, h3, .name, [class*="name"]').first().text());
    if (!name || seen.has(name)) return;
    seen.add(name);

    const role = cleanText($el.find('.role, .title, [class*="role"]').first().text());
    const beat = inferBeats(role);

    contacts.push({
      full_name: name,
      outlet: 'BBC News',
      outlet_url: 'https://bbc.co.uk/news',
      role,
      beat: beat.length ? beat : ['news'],
      media_type: 'broadcast',
      source_url: outlet.masthead_url,
      source_type: 'scraper',
    });
  });

  return contacts;
}

// ── Deadline ──────────────────────────────────────────────────
export function deadlineExtractor($, outlet) {
  const contacts = [];
  const seen = new Set();

  // Deadline author archive
  $('[class*="author"], .author-card, a[href*="/author/"]').each((_, el) => {
    const $el = $(el);
    const name = cleanText(
      $el.find('h2, h3, [class*="name"]').first().text() || $el.text()
    );
    if (!name || name.length < 3 || seen.has(name)) return;
    seen.add(name);

    const role = cleanText($el.find('[class*="title"], [class*="role"]').first().text());
    const twitter = extractTwitterHandle(
      $el.find('a[href*="twitter.com"], a[href*="x.com"]').first().attr('href')
    );

    contacts.push({
      full_name: name,
      outlet: 'Deadline',
      outlet_url: 'https://deadline.com',
      role,
      beat: ['film', 'tv', 'entertainment'],
      media_type: 'online',
      twitter_handle: twitter,
      source_url: outlet.masthead_url,
      source_type: 'scraper',
    });
  });

  return contacts;
}
