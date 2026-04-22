/**
 * learn-patterns.js
 * 
 * Analyses existing public_contacts to detect email patterns per domain.
 * Run once (or periodically) to keep domain_patterns table up to date.
 * 
 * Usage: node src/learn-patterns.js
 */

import 'dotenv/config'
import { supabase } from './supabase.js'
import { log } from './utils.js'

const ALL_PATTERN_TEMPLATES = [
  'firstname.lastname',
  'flastname',
  'firstnamelastname',
  'firstname',
  'f.lastname',
  'lastname',
]

function detectPattern(fullName, email) {
  if (!fullName || !email) return null
  const parts     = fullName.toLowerCase().trim().split(/\s+/)
  const first     = parts[0]?.replace(/[^a-z]/g, '') || ''
  const last      = parts[parts.length - 1]?.replace(/[^a-z]/g, '') || ''
  const fInitial  = first[0] || ''
  const localPart = email.split('@')[0].toLowerCase()

  if (!first || !last) return null

  if (localPart === `${first}.${last}`)   return 'firstname.lastname'
  if (localPart === `${fInitial}${last}`) return 'flastname'
  if (localPart === `${first}${last}`)    return 'firstnamelastname'
  if (localPart === first)                return 'firstname'
  if (localPart === `${fInitial}.${last}`) return 'f.lastname'
  if (localPart === last)                 return 'lastname'

  return null
}

async function learnPatterns() {
  log('🔍 Starting pattern learning...')

  // Fetch all contacts with valid emails
  const { data: contacts, error } = await supabase
    .from('public_contacts')
    .select('full_name, email, outlet_url')
    .not('email', 'is', null)
    .in('email_status', ['valid', 'guessed'])
    .limit(5000)

  if (error) { log('❌ Failed to fetch contacts: ' + error.message); return }
  log(`Found ${contacts.length} contacts with emails`)

  // Group by domain
  const domainData = {}

  for (const contact of contacts) {
    if (!contact.email || !contact.full_name) continue
    const domain = contact.email.split('@')[1]
    if (!domain) continue

    const pattern = detectPattern(contact.full_name, contact.email)
    if (!pattern) continue

    if (!domainData[domain]) domainData[domain] = { patterns: {}, samples: [], count: 0 }
    domainData[domain].patterns[pattern] = (domainData[domain].patterns[pattern] || 0) + 1
    domainData[domain].samples.push(contact.email)
    domainData[domain].count++
  }

  log(`Detected patterns for ${Object.keys(domainData).length} domains`)

  // Write to Supabase
  let updated = 0
  for (const [domain, data] of Object.entries(domainData)) {
    if (data.count < 2) continue // need at least 2 contacts to be confident

    // Sort patterns by frequency
    const sortedPatterns = Object.entries(data.patterns)
      .sort((a, b) => b[1] - a[1])
      .map(([p]) => p)

    const sampleEmail = data.samples[0]

    const { error: upsertError } = await supabase
      .from('domain_patterns')
      .upsert({
        domain,
        patterns:      sortedPatterns,
        sample_email:  sampleEmail,
        confidence:    'learned',
        contact_count: data.count,
        updated_at:    new Date().toISOString(),
      }, { onConflict: 'domain' })

    if (upsertError) {
      log(`⚠️  Failed to save pattern for ${domain}: ${upsertError.message}`)
    } else {
      log(`✅ ${domain}: [${sortedPatterns.join(', ')}] (${data.count} contacts)`)
      updated++
    }
  }

  log(`\n🎉 Done — updated patterns for ${updated} domains`)
}

learnPatterns()
