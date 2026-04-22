import 'dotenv/config';
import cron from 'node-cron';
import http from 'http';
import { scrapeAllOutlets } from './scraper.js';
import { runVerificationSweep } from './verify.js';
import { log } from './utils.js';

const RUN_NOW = process.argv.includes('--run-now');
const PORT    = process.env.PORT || 8080

log('🚀 Pressdesk Scraper Service starting...');

// ── Run immediately if --run-now flag passed ──────────────────
if (RUN_NOW) {
  log('--run-now flag detected, starting immediately');
  await scrapeAllOutlets();
  process.exit(0);
}

// ── HTTP server for manual triggers ──────────────────────────
let scraperRunning = false;

const server = http.createServer(async (req, res) => {
  // CORS headers so the admin UI can call this
  res.setHeader('Access-Control-Allow-Origin', 'https://pressdesk.io');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204); res.end(); return;
  }

  // Health check
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', scraperRunning }));
    return;
  }

  // Trigger scraper
  if (req.method === 'POST' && req.url === '/trigger') {
    // Simple auth check — matches TRIGGER_SECRET env var
    const auth = req.headers['authorization'] || '';
    if (process.env.TRIGGER_SECRET && auth !== `Bearer ${process.env.TRIGGER_SECRET}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorised' }));
      return;
    }

    if (scraperRunning) {
      res.writeHead(409, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Scraper already running' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Scraper triggered' }));

    // Run in background so response returns immediately
    scraperRunning = true;
    log('🔘 Manual trigger via HTTP');
    scrapeAllOutlets()
      .then(() => { log('✅ Manual scrape complete'); })
      .catch(err => { log('❌ Manual scrape error: ' + err.message); })
      .finally(() => { scraperRunning = false; });
    return;
  }

  // Trigger verification
  if (req.method === 'POST' && req.url === '/verify') {
    const auth = req.headers['authorization'] || '';
    if (process.env.TRIGGER_SECRET && auth !== `Bearer ${process.env.TRIGGER_SECRET}`) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorised' }));
      return;
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ message: 'Verification triggered' }));

    scraperRunning = true;
    log('🔘 Manual verification via HTTP');
    runVerificationSweep()
      .then(() => { log('✅ Manual verification complete'); })
      .catch(err => { log('❌ Manual verification error: ' + err.message); })
      .finally(() => { scraperRunning = false; });
    return;
  }

  res.writeHead(404); res.end();
});

server.listen(PORT, () => {
  log(`🌐 HTTP server listening on port ${PORT}`);
});

// ── Scraper: runs every 24 hours ──────────────────────────────
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
