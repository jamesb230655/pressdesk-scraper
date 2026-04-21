import { cleanText, inferBeats, extractTwitterHandle } from '../utils.js';

/**
 * Generic extractor — tries common patterns used by most CMS author pages.
 * Works reasonably well for WordPress, Ghost, and similar platforms.
 * Custom extractors override this for specific outlets.
 */
export function genericExtractor($, outlet) {
  const contacts = [];

  // Common selectors used across most CMS author listing pages
  const candidateSelectors = [
    '.author',
    '.author-card',
    '.contributor',
    '.team-member',
    '.staff-member',
    '[class*="author"]',
    '[class*="contributor"]',
    '[class*="journalist"]',
    'article.author',
  ];

  let found = false;

  for (const selector of candidateSelectors) {
    const elements = $(selector);
    if (elements.length < 2) continue; // skip if fewer than 2 matches — probably not the right selector

    found = true;

    elements.each((_, el) => {
      const $el = $(el);

      const name = cleanText(
        $el.find('h1, h2, h3, h4, .name, .author-name, [class*="name"]').first().text()
      );

      if (!name || name.length < 3) return; // skip if no usable name

      const role = cleanText(
        $el.find('.role, .title, .job-title, [class*="title"], [class*="role"]').first().text()
      );

      const bio = cleanText(
        $el.find('p, .bio, .description, [class*="bio"]').first().text()
      );

      const twitter = extractTwitterHandle(
        $el.find('a[href*="twitter.com"], a[href*="x.com"]').first().attr('href')
      );

      const beats = inferBeats(`${role || ''} ${bio || ''}`);

      contacts.push({
        full_name: name,
        outlet: outlet.name,
        outlet_url: outlet.url,
        role,
        beat: beats.length ? beats : (outlet.beats || []),
        media_type: outlet.category === 'broadcast' ? 'broadcast' : 'online',
        twitter_handle: twitter,
        source_url: outlet.masthead_url || outlet.url,
        source_type: 'scraper',
      });
    });

    break; // stop after first selector that works
  }

  // Last resort: scrape author bylines from article listings
  if (!found) {
    $('a[rel="author"], a[href*="/author/"], a[href*="/authors/"]').each((_, el) => {
      const name = cleanText($(el).text());
      if (!name || name.length < 3) return;

      contacts.push({
        full_name: name,
        outlet: outlet.name,
        outlet_url: outlet.url,
        beat: outlet.beats || [],
        media_type: 'online',
        source_url: outlet.masthead_url || outlet.url,
        source_type: 'scraper',
      });
    });
  }

  // Deduplicate by name
  const seen = new Set();
  return contacts.filter(c => {
    if (seen.has(c.full_name)) return false;
    seen.add(c.full_name);
    return true;
  });
}
