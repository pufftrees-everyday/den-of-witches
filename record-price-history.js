/**
 * Grimoire — Price History Recorder
 *
 * Reads the freshly-generated prices.json and appends a snapshot to the
 * Supabase `price_history` table (one row per card per finish per capture).
 * Runs in the GitHub Action right after fetch-prices.js, twice a day.
 *
 * Requires a Supabase SERVICE ROLE key (bypasses RLS for inserts) provided
 * via the SUPABASE_SERVICE_ROLE env var (a GitHub Actions secret). If the
 * key is missing, the script skips quietly so price fetching still works.
 *
 * Env:
 *   SUPABASE_SERVICE_ROLE  (required to actually write)
 *   SUPABASE_URL           (optional; defaults to the project URL below)
 */

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://nuizkjkcephopnbcmtlz.supabase.co';
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || '';
const PRICES_FILE = path.join(__dirname, 'prices.json');
const TABLE = 'price_history';
const BATCH = 500;

async function main() {
  if (!SERVICE_ROLE) {
    console.log('SUPABASE_SERVICE_ROLE not set — skipping price-history capture.');
    return; // graceful no-op until the secret is configured
  }
  if (!fs.existsSync(PRICES_FILE)) {
    console.log('prices.json not found — nothing to record.');
    return;
  }

  const data = JSON.parse(fs.readFileSync(PRICES_FILE, 'utf8'));
  const capturedAt = data.generated || new Date().toISOString();

  const rows = [];
  for (const [name, v] of Object.entries(data.prices || {})) {
    if (v && v.market != null) rows.push({ captured_at: capturedAt, card_name: name, finish: 'standard', market: v.market });
  }
  for (const [name, v] of Object.entries(data.foils || {})) {
    if (v && v.market != null) rows.push({ captured_at: capturedAt, card_name: name, finish: 'foil', market: v.market });
  }

  if (!rows.length) { console.log('No priced rows to record.'); return; }
  console.log(`Recording ${rows.length} price points at ${capturedAt} …`);

  const endpoint = `${SUPABASE_URL}/rest/v1/${TABLE}`;
  let inserted = 0, failed = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'apikey': SERVICE_ROLE,
        'Authorization': `Bearer ${SERVICE_ROLE}`,
        'Content-Type': 'application/json',
        // Ignore duplicates so re-running the same snapshot is harmless
        'Prefer': 'resolution=ignore-duplicates,return=minimal',
      },
      body: JSON.stringify(batch),
    });
    if (res.ok) {
      inserted += batch.length;
    } else {
      failed += batch.length;
      const txt = await res.text();
      console.error(`Batch ${i / BATCH} failed (${res.status}): ${txt.slice(0, 300)}`);
    }
  }

  console.log(`Done. Attempted ${rows.length} rows (sent ${inserted}, failed ${failed}).`);
  if (failed > 0) process.exit(1); // surface real failures in the Actions log
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
