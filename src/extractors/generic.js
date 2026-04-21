import { cleanText, extractTwitterHandle, inferBeats } from '../utils.js'

/**
 * Generic extractor — quality-focused.
 * Only saves contacts where we have at minimum: name + role or name + outlet.
 */
export function genericExtractor($, outlet) {
  const contacts = []
  const seen = new Set()

  function addContact(name, role, twitter, sourceUrl) {
    const clean = cleanText(name)
    if (!clean || clean.length < 4) return
    if (seen.has(clean.toLowerCase())) return
    if (/^\d|^(home|menu|search|subscribe|login|about|contact|advertise|cookie|privacy|terms)$/i.test(clean)) return
    // Must look like a real name — at least 2 parts
    const parts = clean.split(' ').filter(Boolean)
    if (parts.length < 2) return
    seen.add(clean.toLowerCase())

    contacts.push({
      full_name:      clean,
      outlet:         outlet.name,
      outlet_url:     outlet.url,
      role:           cleanText(role) || null,
      beat:           inferBeats(role || ''),
      media_type:     outlet.category === 'broadcast' ? 'broadcast' : 'online',
      twitter_handle: extractTwitterHandle(twitter),
      source_url:     sourceUrl || outlet.masthead_url || outlet.url,
      source_type:    'scraper',
    })
  }

  // Strategy 1: Structured author/team cards
  const cardSelectors = [
    { wrap: '.author-card, .contributor-card, .team-card, .staff-card, .journalist-card', name: 'h1,h2,h3,h4,.name,.author-name', role: '.role,.title,.job-title,.position' },
    { wrap: '[class*="AuthorCard"], [class*="author-card"], [class*="StaffCard"]',         name: 'h2,h3,.name',                    role: '.role,.title,[class*="role"]' },
    { wrap: '.team-member, .staff-member, .contributor',                                   name: 'h3,h4,.name',                    role: '.role,.title,.position' },
    { wrap: 'article[class*="author"], div[class*="author-profile"]',                      name: 'h1,h2,h3',                       role: '.role,p:first-of-type' },
  ]

  for (const { wrap, name: namesel, role: rolesel } of cardSelectors) {
    const elements = $(wrap)
    if (elements.length < 2) continue
    elements.each((_, el) => {
      const $el     = $(el)
      const name    = $el.find(namesel).first().text()
      const role    = $el.find(rolesel).first().text()
      const twitter = $el.find('a[href*="twitter.com"], a[href*="x.com"]').first().attr('href')
      addContact(name, role, twitter, outlet.masthead_url)
    })
    if (contacts.length > 0) break
  }

  // Strategy 2: Schema.org Person markup
  if (contacts.length === 0) {
    $('[itemtype*="Person"], [itemtype*="schema.org/Person"]').each((_, el) => {
      const $el  = $(el)
      const name = $el.find('[itemprop="name"]').first().text()
      const role = $el.find('[itemprop="jobTitle"]').first().text()
      addContact(name, role, null, outlet.masthead_url)
    })
  }

  // Strategy 3: Author byline links (last resort)
  if (contacts.length === 0) {
    const patterns = ['a[href*="/author/"]','a[href*="/authors/"]','a[href*="/journalist/"]','a[href*="/writer/"]','a[href*="/profile/"]','a[rel="author"]']
    for (const pattern of patterns) {
      $(pattern).each((_, el) => {
        const name = cleanText($(el).text())
        const href = $(el).attr('href') || ''
        if (name && name.split(' ').length >= 2 && name.length < 60) {
          addContact(name, null, null, href)
        }
      })
    }
  }

  return contacts
}
