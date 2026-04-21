import { cleanText, extractTwitterHandle, inferBeats } from '../utils.js';

/**
 * NME extractor — targets nme.com/authors listing page.
 * NME uses a WordPress-based CMS with clean author archive pages.
 */
export function nmeExtractor($, outlet) {
  const contacts = [];
  const seen = new Set();

  // NME authors page: .author-card or similar
  $('.author-card, .contributor-card, [class*="AuthorCard"], [class*="author-card"]').each((_, el) => {
    const $el = $(el);

    const name = cleanText($el.find('h2, h3, .author-name, [class*="name"]').first().text());
    if (!name || seen.has(name)) return;
    seen.add(name);

    const role = cleanText($el.find('.role, .title, [class*="title"]').first().text());
    const twitter = extractTwitterHandle(
      $el.find('a[href*="twitter.com"], a[href*="x.com"]').first().attr('href')
    );

    contacts.push({
      full_name: name,
      outlet: 'NME',
      outlet_url: 'https://nme.com',
      role,
      beat: ['music', 'culture'],
      media_type: 'online',
      twitter_handle: twitter,
      source_url: outlet.masthead_url,
      source_type: 'scraper',
    });
  });

  // Fallback: byline links
  if (!contacts.length) {
    $('a[href*="/authors/"]').each((_, el) => {
      const name = cleanText($(el).text());
      if (!name || name.length < 3 || seen.has(name)) return;
      seen.add(name);

      contacts.push({
        full_name: name,
        outlet: 'NME',
        outlet_url: 'https://nme.com',
        beat: ['music', 'culture'],
        media_type: 'online',
        source_url: outlet.masthead_url,
        source_type: 'scraper',
      });
    });
  }

  return contacts;
}
