import fetch from 'node-fetch';
import * as cheerio from 'cheerio';
import pLimit from 'p-limit';
import { supabase } from './supabase.js';
import { log, sleep, cleanText } from './utils.js';
import { getExtractor } from './extractors/index.js';

const DELAY_MS = parseInt(process.env.REQUEST_DELAY_MS || '2000');
const MAX_CONCURRENT = parseInt(process.env.MAX_CONCURRENT_SCRAPERS || '2');

// ── Fetch HTML from a URL with retry logic ────────────────────
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
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      log(`⚠️  Fetch attempt ${i + 1} failed for ${url}: ${err.message}`);
      if (i < retries - 1) await sleep(3000 * (i + 1));
    }
  }
  throw new Error(`Failed to fetch ${url} after ${retries} attempts`);
}

// ── Upsert contacts into Supabase ─────────────────────────────
async function saveContacts(contacts, outletId) {
  if (!contacts.length) return { added: 0, updated: 0 };

  let added = 0;
  let updated = 0;

  for (const contact of contacts) {
    const { data, error } = await supabase
      .from('public_contacts')
      .upsert(
        {
          ...contact,
          last_scraped_at: new Date().toISOString(),
          status: 'pending', // always goes to review queue
        },
        {
          onConflict: 'full_name,outlet,email',
          ignoreDuplicates: false,
        }
      )
      .select('id');

    if (error) {
      log(`⚠️  Save error for ${contact.full_name}: ${error.message}`);
      continue;
    }

    // Supabase upsert: if created_at hasn't changed it was an update
    added++;
  }

  return { added, updated };
}

// ── Scrape a single outlet ────────────────────────────────────
export async function scrapeOutlet(outlet) {
  const url = outlet.masthead_url || outlet.url;
  const extractor = getExtractor(outlet.extractor_key);

  if (!extractor) {
    log(`⚠️  No extractor found for ${outlet.extractor_key}, skipping`);
    return;
  }

  // Log run start
  const { data: runData } = await supabase
    .from('scraper_runs')
    .insert({ outlet_id: outlet.id, status: 'running' })
    .select('id')
    .single();

  const runId = runData?.id;

  log(`🔍 Scraping ${outlet.name} → ${url}`);

  try {
    const html = await fetchPage(url);
    const $ = cheerio.load(html);
    const contacts = extractor($, outlet);

    log(`   Found ${contacts.length} contacts at ${outlet.name}`);

    const { added, updated } = await saveContacts(contacts, outlet.id);

    // Update outlet record
    await supabase
      .from('scraper_outlets')
      .update({
        last_scraped_at: new Date().toISOString(),
        scrape_status: 'success',
        last_error: null,
        contacts_found: contacts.length,
      })
      .eq('id', outlet.id);

    // Complete run log
    await supabase
      .from('scraper_runs')
      .update({
        completed_at: new Date().toISOString(),
        status: 'success',
        contacts_scraped: contacts.length,
        contacts_added: added,
        contacts_updated: updated,
      })
      .eq('id', runId);

    log(`✅ ${outlet.name}: +${added} added, ~${updated} updated`);

  } catch (err) {
    log(`❌ Failed scraping ${outlet.name}: ${err.message}`);

    await supabase
      .from('scraper_outlets')
      .update({ scrape_status: 'failed', last_error: err.message })
      .eq('id', outlet.id);

    await supabase
      .from('scraper_runs')
      .update({
        completed_at: new Date().toISOString(),
        status: 'failed',
        error_message: err.message,
      })
      .eq('id', runId);
  }
}

// ── Scrape all active outlets ─────────────────────────────────
export async function scrapeAllOutlets() {
  log('🗞  Starting full scrape cycle...');

  const { data: outlets, error } = await supabase
    .from('scraper_outlets')
    .select('*')
    .eq('active', true);

  if (error || !outlets?.length) {
    log('❌ Could not load outlets from Supabase', error);
    return;
  }

  log(`Found ${outlets.length} active outlets`);

  // Limit concurrency — be polite to servers
  const limit = pLimit(MAX_CONCURRENT);

  const tasks = outlets.map(outlet =>
    limit(async () => {
      await scrapeOutlet(outlet);
      await sleep(DELAY_MS); // pause between each scrape
    })
  );

  await Promise.all(tasks);

  log('🎉 Full scrape cycle complete');
}
