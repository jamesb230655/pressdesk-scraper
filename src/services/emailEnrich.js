import fetch from 'node-fetch'
import { log, sleep } from '../utils.js'
import { supabase } from '../supabase.js'

const HUNTER_API_KEY = process.env.HUNTER_API_KEY

// Fallback hardcoded patterns (used if Supabase is unavailable)
const FALLBACK_PATTERNS = {
  'theguardian.com':       ['firstname.lastname'],
  'thetimes.co.uk':        ['firstname.lastname'],
  'telegraph.co.uk':       ['firstname.lastname'],
  'independent.co.uk':     ['firstname.lastname'],
  'bbc.co.uk':             ['firstname.lastname'],
  'dailymail.co.uk':       ['firstname.lastname'],
  'standard.co.uk':        ['firstname.lastname'],
  'nme.com':               ['firstname.lastname', 'firstname'],
  'kerrang.com':           ['firstname.lastname'],
  'mixmag.net':            ['firstname.lastname', 'firstname'],
  'clashmusic.com':        ['firstname.lastname'],
  'vogue.co.uk':           ['firstname.lastname'],
  'elle.com':              ['firstname.lastname'],
  'graziadaily.co.uk':     ['firstname.lastname'],
  'glamourmagazine.co.uk': ['firstname.lastname'],
  'timeout.com':           ['firstname.lastname', 'firstname'],
  'screendaily.com':       ['firstname.lastname'],
  'deadline.com':          ['firstname.lastname', 'firstname'],
  'diymag.com':            ['firstname.lastname', 'firstname'],
}

const ALL_PATTERNS = [
  'firstname.lastname',
  'flastname',
  'firstnamelastname',
  'firstname',
  'f.lastname',
  'lastname',
]

// In-memory cache so we don't hit Supabase on every contact
const patternCache = new Map()
let cacheLoadedAt  = null
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes

async function loadPatternsFromDB() {
  try {
    const { data, error } = await supabase
      .from('domain_patterns')
      .select('domain, patterns')
    if (error || !data) return
    patternCache.clear()
    data.forEach(row => {
      if (row.domain && row.patterns?.length) {
        patternCache.set(row.domain, row.patterns)
      }
    })
    cacheLoadedAt = Date.now()
    log(`📋 Loaded ${patternCache.size} domain patterns from DB`)
  } catch (err) {
    log(`⚠️  Could not load domain patterns from DB: ${err.message}`)
  }
}

async function getPatternsForDomain(domain) {
  // Refresh cache if stale or empty
  if (!cacheLoadedAt || Date.now() - cacheLoadedAt > CACHE_TTL_MS) {
    await loadPatternsFromDB()
  }
  return patternCache.get(domain) || FALLBACK_PATTERNS[domain] || ALL_PATTERNS
}

// ── Build email candidates from a name + domain ───────────────
export async function buildEmailCandidates(fullName, domain) {
  const parts = fullName.toLowerCase().trim().split(/\s+/)
  if (parts.length < 2) return []

  const first    = parts[0].replace(/[^a-z]/g, '')
  const last     = parts[parts.length - 1].replace(/[^a-z]/g, '')
  const fInitial = first[0] || ''

  if (!first || !last) return []

  const patterns   = await getPatternsForDomain(domain)
  const candidates = patterns.map(p => {
    switch (p) {
      case 'firstname.lastname':  return `${first}.${last}@${domain}`
      case 'flastname':           return `${fInitial}${last}@${domain}`
      case 'firstnamelastname':   return `${first}${last}@${domain}`
      case 'firstname':           return `${first}@${domain}`
      case 'f.lastname':          return `${fInitial}.${last}@${domain}`
      case 'lastname':            return `${last}@${domain}`
      default:                    return null
    }
  }).filter(Boolean)

  return [...new Set(candidates)]
}

// ── Verify email via MX lookup (Cloudflare DoH) ───────────────
async function verifyMX(email) {
  try {
    const domain = email.split('@')[1]
    const res    = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${domain}&type=MX`,
      { headers: { Accept: 'application/dns-json' }, timeout: 5000 }
    )
    const data = await res.json()
    return data.Status === 0 && data.Answer && data.Answer.length > 0
  } catch {
    return false
  }
}

// ── Hunter.io email finder ────────────────────────────────────
async function hunterFind(firstName, lastName, domain) {
  if (!HUNTER_API_KEY) return null
  try {
    const url  = `https://api.hunter.io/v2/email-finder?domain=${domain}&first_name=${encodeURIComponent(firstName)}&last_name=${encodeURIComponent(lastName)}&api_key=${HUNTER_API_KEY}`
    const res  = await fetch(url, { timeout: 8000 })
    const data = await res.json()
    if (data.data?.email && data.data.confidence > 50) {
      return { email: data.data.email, confidence: data.data.confidence }
    }
    return null
  } catch (err) {
    log(`⚠️  Hunter.io error for ${firstName} ${lastName}: ${err.message}`)
    return null
  }
}

// ── Main enrichment function ──────────────────────────────────
export async function enrichEmail(fullName, outletDomain) {
  if (!fullName || !outletDomain) {
    return { email: null, emailSource: null, emailStatus: 'no-email' }
  }

  const parts     = fullName.trim().split(/\s+/)
  const firstName = parts[0] || ''
  const lastName  = parts[parts.length - 1] || ''

  // Step 1: Pattern guessing + MX verify
  const candidates = await buildEmailCandidates(fullName, outletDomain)

  for (const candidate of candidates) {
    const valid = await verifyMX(candidate)
    if (valid) {
      log(`   ✉️  Pattern match: ${candidate}`)
      return { email: candidate, emailSource: 'pattern', emailStatus: 'guessed' }
    }
    await sleep(150)
  }

  // Step 2: Fall back to Hunter.io
  if (HUNTER_API_KEY && firstName && lastName) {
    await sleep(500)
    const result = await hunterFind(firstName, lastName, outletDomain)
    if (result) {
      log(`   ✉️  Hunter.io match: ${result.email} (${result.confidence}% confidence)`)
      return { email: result.email, emailSource: 'hunter', emailStatus: 'valid' }
    }
  }

  return { email: null, emailSource: null, emailStatus: 'no-email' }
}

// ── Extract domain from outlet URL ───────────────────────────
export function getDomain(url) {
  if (!url) return null
  try {
    return new URL(url).hostname.replace('www.', '')
  } catch {
    return null
  }
}
