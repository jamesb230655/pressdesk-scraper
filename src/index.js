import 'dotenv/config';
import cron from 'node-cron';
import { scrapeAllOutlets, scrapeOutlet } from './scraper.js';
import { runVerificationSweep } from './verify.js';
import { log } from './utils.js';

const RUN_NOW = process.argv.includes('--run-now');

log('🚀 Pressdesk Scraper Service starting...');

// ── Run immediately if --run-now flag passed ──────────────────
if (RUN_NOW) {
  log('--run-now flag detected, starting immediately');
  await scrapeAllOutlets();
  process.exit(0);
}

// ── Scraper: runs every 24 hours ──────────────────────────────
// Staggers across the day to avoid hammering outlets
cron.schedule('0 2 * * *', async () => {
  log('⏰ Daily scrape triggered');
  await scrapeAllOutlets();
});

// ── Verification sweep: runs on 1st of every month at 3am ─────
cron.schedule('0 3 1 * *', async () => {
  log('⏰ Monthly verification sweep triggered');
  await runVerificationSweep();
});

log('✅ Scheduler running. Scrape: daily at 2am | Verify: 1st of month at 3am');
