import fetch from 'node-fetch'
import * as cheerio from 'cheerio'
import pLimit from 'p-limit'
import { supabase } from './supabase.js'
import { log, sleep } from './utils.js'
import { getExtractor } from './extractors/index.js'
import { enrichEmail, getDomain } from './services/emailEnrich.js'

const DELAY_MS      = parseInt(process.env.REQUEST_DELAY_MS || '2000')
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_SCRAPERS || '2')

// ── Fetch HTML ────────────────────────────────────────────────
async function fetchPage(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; PressdeskBot/1.0; +https://pressdesk.io/bot)',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'en-GB,en;q=0.9',
        },
        timeout: 15000,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return await res.text()
    } catch (err) {
      log(`⚠️  Fetch attempt ${i + 1} failed for ${url}: ${err.message}`)
      if (i < retries - 1) await sleep(3000 * (i + 1))
    }
  }
  throw new Error(`Failed to fetch ${url} after ${retries} attempts`)
}

// ── Enrich and save a batch of contacts ──────────────────────
async function enrichAndSave(rawContacts, outletDomain) {
  let added = 0

  for (const contact of rawContacts) {
    // Skip if no name
    if (!contact.full_name || contact.full_name.trim().length < 4) continue

    // Email enrichment
    const { email, emailSource, emailStatus } = await enrichEmail(contact.full_name, outletDomain)

    const record = {
      ...contact,
      email:            email || null,
      email_status:     emailStatus,
      last_scraped_at:  new Date().toISOString(),
      
    }

    // Only upsert if we have something meaningful
    const { error } = await supabase
      .from('public_contacts')
      .upsert(record, { onConflict: 'full_name,outlet,email', ignoreDuplicates: true })

    if (error) {
      log(`⚠️  Save error for ${contact.full_name}: ${error.message}`)
    } else {
      added++
      const emailLabel = email ? `✉️  ${email} (${emailSource})` : '⚫ no email'
      log(`   + ${contact.full_name} — ${emailLabel}`)
    }

    // Small delay between email lookups to avoid hammering APIs
    await sleep(300)
  }

  return added
}

// ── Scrape a single outlet ────────────────────────────────────
export async function scrapeOutlet(outlet) {
  const url       = outlet.masthead_url || outlet.url
  const extractor = getExtractor(outlet.extractor_key)

  if (!extractor) {
    log(`⚠️  No extractor for ${outlet.extractor_key}, skipping`)
    return
  }

  // Log run start
  const { data: runData } = await supabase
    .from('scraper_runs')
    .insert({ outlet_id: outlet.id, status: 'running' })
    .select('id')
    .single()
  const runId = runData?.id

  log(`🔍 Scraping ${outlet.name} → ${url}`)

  try {
    const html        = await fetchPage(url)
    const $           = cheerio.load(html)
    const rawContacts = extractor($, outlet)

    log(`   Found ${rawContacts.length} raw contacts at ${outlet.name}`)

    if (rawContacts.length === 0) {
      await supabase.from('scraper_outlets').update({ last_scraped_at: new Date().toISOString(), scrape_status: 'success', contacts_found: 0 }).eq('id', outlet.id)
      await supabase.from('scraper_runs').update({ completed_at: new Date().toISOString(), status: 'success', contacts_scraped: 0, contacts_added: 0 }).eq('id', runId)
      return
    }

    const domain = getDomain(outlet.url)
    const added  = await enrichAndSave(rawContacts, domain)

    await supabase.from('scraper_outlets').update({
      last_scraped_at: new Date().toISOString(),
      scrape_status:   'success',
      last_error:      null,
      contacts_found:  rawContacts.length,
    }).eq('id', outlet.id)

    await supabase.from('scraper_runs').update({
      completed_at:      new Date().toISOString(),
      status:            'success',
      contacts_scraped:  rawContacts.length,
      contacts_added:    added,
    }).eq('id', runId)

    log(`✅ ${outlet.name}: ${rawContacts.length} scraped, ${added} saved`)

  } catch (err) {
    log(`❌ Failed scraping ${outlet.name}: ${err.message}`)
    await supabase.from('scraper_outlets').update({ scrape_status: 'failed', last_error: err.message }).eq('id', outlet.id)
    await supabase.from('scraper_runs').update({ completed_at: new Date().toISOString(), status: 'failed', error_message: err.message }).eq('id', runId)
  }
}

// ── Scrape all active outlets ─────────────────────────────────
export async function scrapeAllOutlets() {
  log('🗞  Starting full scrape cycle...')

  const { data: outlets, error } = await supabase
    .from('scraper_outlets')
    .select('*')
    .eq('active', true)

  if (error || !outlets?.length) {
    log('❌ Could not load outlets', error)
    return
  }

  log(`Found ${outlets.length} active outlets`)

  const limit = pLimit(MAX_CONCURRENT)
  const tasks = outlets.map(outlet =>
    limit(async () => {
      await scrapeOutlet(outlet)
      await sleep(DELAY_MS)
    })
  )

  await Promise.all(tasks)
  log('🎉 Full scrape cycle complete')
}
