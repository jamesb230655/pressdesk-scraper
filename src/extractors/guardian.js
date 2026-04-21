import { cleanText, extractTwitterHandle, inferBeats } from '../utils.js';

/**
 * Guardian extractor — targets /profile/ pages and contributor listings.
 * The Guardian has a clean, consistent author page structure.
 */
export function guardianExtractor($, outlet) {
  const contacts = [];

  // Guardian contributor cards on their /info/about pages
  $('.profile-summary, .contributor, [data-component="contributor"]').each((_, el) => {
    const $el = $(el);

    const name = cleanText($el.find('h1, h2, h3, .profile-summary__name').first().text());
    if (!name) return;

    const role = cleanText($el.find('.profile-summary__role, .contributor__role').first().text());
    const twitter = extractTwitterHandle(
      $el.find('a[href*="twitter.com"], a[href*="x.com"]').first().attr('href')
    );

    contacts.push({
      full_name: name,
      outlet: 'The Guardian',
      outlet_url: 'https://theguardian.com',
      role,
      beat: inferBeats(role),
      media_type: 'online',
      twitter_handle: twitter,
      source_url: outlet.masthead_url || outlet.url,
      source_type: 'scraper',
    });
  });

  // Fallback: scrape byline links from homepage/section fronts
  if (!contacts.length) {
    const seen = new Set();
    $('a[href^="https://www.theguardian.com/profile/"]').each((_, el) => {
      const name = cleanText($(el).text());
      const profileUrl = $(el).attr('href');
      if (!name || name.length < 3 || seen.has(name)) return;
      seen.add(name);

      contacts.push({
        full_name: name,
        outlet: 'The Guardian',
        outlet_url: 'https://theguardian.com',
        beat: outlet.beats || ['news'],
        media_type: 'online',
        source_url: profileUrl,
        source_type: 'scraper',
      });
    });
  }

  return contacts;
}
