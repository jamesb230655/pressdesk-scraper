import 'dotenv/config';
import fetch from 'node-fetch';
import { supabase } from './supabase.js';
import { log, sleep } from './utils.js';

const API_KEY = process.env.MILLIONVERIFIER_API_KEY;
const BATCH_SIZE = 100; // verify 100 at a time
const RUN_NOW = process.argv.includes('--run-now');

// ── Verify a single email via Millionverifier ─────────────────
async function verifyEmail(email) {
  try {
    const res = await fetch(
      `https://api.millionverifier.com/api/v3/?api=${API_KEY}&email=${encodeURIComponent(email)}&timeout=10`,
      { timeout: 15000 }
    );
    const data = await res.json();

    // Millionverifier result codes:
    // "ok" = valid, "error" = invalid, "unknown" = can't determine, "disposable" = disposable
    const statusMap = {
      ok:          'valid',
      error:       'invalid',
      unknown:     'unknown',
      disposable:  'invalid',
      risky:       'risky',
    };

    return {
      status: statusMap[data.result] || 'unknown',
      score: data.quality_score || null,
    };
  } catch (err) {
    log(`⚠️  Verification error for ${email}: ${err.message}`);
    return { status: 'unknown', score: null };
  }
}

// ── Run the full monthly verification sweep ───────────────────
export async function runVerificationSweep() {
  if (!API_KEY) {
    log('❌ MILLIONVERIFIER_API_KEY not set — skipping verification sweep');
    return;
  }

  log('🔍 Starting monthly email verification sweep...');

  // Log run start
  const { data: runData } = await supabase
    .from('verification_runs')
    .insert({ status: 'running', provider: 'millionverifier' })
    .select('id')
    .single();

  const runId = runData?.id;

  // Fetch all approved contacts that have an email
  const { data: contacts, error } = await supabase
    .from('public_contacts')
    .select('id, email')
    .eq('status', 'approved')
    .not('email', 'is', null)
    .neq('email', '');

  if (error || !contacts?.length) {
    log('⚠️  No contacts with emails to verify', error);
    await supabase
      .from('verification_runs')
      .update({ status: 'failed', completed_at: new Date().toISOString(), error_message: 'No contacts found' })
      .eq('id', runId);
    return;
  }

  log(`Found ${contacts.length} contacts to verify`);

  let valid = 0, risky = 0, invalid = 0, unknown = 0;

  // Process in batches to avoid rate limits
  for (let i = 0; i < contacts.length; i += BATCH_SIZE) {
    const batch = contacts.slice(i, i + BATCH_SIZE);
    log(`Verifying batch ${Math.floor(i / BATCH_SIZE) + 1} of ${Math.ceil(contacts.length / BATCH_SIZE)}...`);

    for (const contact of batch) {
      const { status, score } = await verifyEmail(contact.email);

      // Update the contact record
      await supabase
        .from('public_contacts')
        .update({
          email_status: status,
          verification_score: score,
          last_verified_at: new Date().toISOString(),
          verified_this_month: true,
        })
        .eq('id', contact.id);

      if (status === 'valid') valid++;
      else if (status === 'risky') risky++;
      else if (status === 'invalid') invalid++;
      else unknown++;

      // Small delay between each request — respect rate limits
      await sleep(200);
    }

    // Bigger pause between batches
    if (i + BATCH_SIZE < contacts.length) {
      await sleep(2000);
    }
  }

  // Reset verified_this_month flag at end so next month starts fresh
  // (actually we leave it as-is and reset at start of next sweep)

  // Complete the run log
  await supabase
    .from('verification_runs')
    .update({
      completed_at: new Date().toISOString(),
      status: 'success',
      contacts_checked: contacts.length,
      valid_count: valid,
      risky_count: risky,
      invalid_count: invalid,
      // Rough cost estimate: ~£0.0003 per verification
      cost_estimate_gbp: parseFloat((contacts.length * 0.0003).toFixed(2)),
    })
    .eq('id', runId);

  log(`✅ Verification sweep complete: ${valid} valid | ${risky} risky | ${invalid} invalid | ${unknown} unknown`);
  log(`💷 Estimated cost: £${(contacts.length * 0.0003).toFixed(2)}`);
}

// Run directly if called with --run-now
if (RUN_NOW) {
  await runVerificationSweep();
  process.exit(0);
}
