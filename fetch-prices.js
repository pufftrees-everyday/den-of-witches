/**
 * Grimoire — Price Fetcher v2
 * Fetches ALL Sorcery TCG prices from JustTCG:
 *   - Standard cards
 *   - Foil cards
 *   - Sealed products (booster boxes, cases, etc.)
 *
 * Usage:
 *   node fetch-prices.js YOUR_API_KEY
 *   node fetch-prices.js YOUR_API_KEY --fresh   (start over, ignore existing file)
 *
 * Upload the generated prices.json to your GitHub repo.
 */

const fs = require('fs');
const path = require('path');

const API_KEY = process.argv[2];
if (!API_KEY) {
  console.error('Usage: node fetch-prices.js YOUR_JUSTTCG_API_KEY');
  process.exit(1);
}

const FRESH = process.argv.includes('--fresh');
const OUTPUT_FILE = path.join(__dirname, 'prices.json');
const BASE_URL = 'https://api.justtcg.com/v1';
const GAME = 'sorcery-contested-realm';
const PAGE_SIZE = 100; // Higher plans support 100 per request
const DELAY_MS = 1000; // 1 second between requests

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchWithKey(url) {
  const res = await fetch(url, {
    headers: { 'x-api-key': API_KEY, 'Content-Type': 'application/json' }
  });
  return res;
}

function saveProgress(data) {
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2));
}

async function fetchAllPrices() {
  // Load existing if resuming
  let existing = { cards: {}, foils: {}, sealed: {} };
  let startOffset = 0;

  if (!FRESH && fs.existsSync(OUTPUT_FILE)) {
    try {
      const old = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
      if (old.cards) {
        existing = { cards: old.cards || {}, foils: old.foils || {}, sealed: old.sealed || {} };
        const total = Object.keys(existing.cards).length + Object.keys(existing.foils).length + Object.keys(existing.sealed).length;
        startOffset = Math.floor(Object.keys(existing.cards).length / PAGE_SIZE) * PAGE_SIZE;
        console.log(`Resuming — already have ${total} entries, starting at offset ${startOffset}`);
      }
    } catch(e) { console.log('Starting fresh (could not read existing file)'); }
  } else {
    console.log('Starting fresh...');
  }

  const cards = existing.cards;   // name -> { market }
  const foils = existing.foils;   // name -> { market }
  const sealed = existing.sealed; // name -> { market }

  let offset = startOffset;
  let hasMore = true;
  let totalFetched = 0;
  let requestCount = 0;

  console.log(`\nFetching all Sorcery cards from JustTCG (${PAGE_SIZE}/request)...\n`);

  while (hasMore) {
    const url = `${BASE_URL}/cards?game=${GAME}&limit=${PAGE_SIZE}&offset=${offset}`;

    try {
      const res = await fetchWithKey(url);
      requestCount++;

      if (!res.ok) {
        const errText = await res.text();
        console.error(`\nAPI error ${res.status}: ${errText}`);

        if (res.status === 429) {
          // Save progress and exit
          const output = buildOutput(cards, foils, sealed);
          saveProgress(output);
          console.log(`\nRate limited! Progress saved (${Object.keys(cards).length} standard, ${Object.keys(foils).length} foil, ${Object.keys(sealed).length} sealed).`);
          console.log('Run the script again to resume.');
          process.exit(0);
        }
        break;
      }

      const json = await res.json();
      const data = json.data || [];
      hasMore = json.meta?.hasMore || false;
      offset += data.length;
      totalFetched += data.length;

      // Show first response for debugging
      if (requestCount === 1) {
        console.log('First card sample:', JSON.stringify(data[0]).slice(0, 300));
        console.log('');
      }

      for (const card of data) {
        const rawName = card.name;
        if (!rawName) continue;

        const variants = card.variants || [];
        const isSealedProduct = rawName.toLowerCase().includes('booster') ||
          rawName.toLowerCase().includes('box') ||
          rawName.toLowerCase().includes('case') ||
          rawName.toLowerCase().includes('pack') ||
          rawName.toLowerCase().includes('bundle') ||
          rawName.toLowerCase().includes('display');

        if (isSealedProduct) {
          const anyVariant = variants[0];
          if (anyVariant?.price != null) {
            sealed[rawName] = { market: anyVariant.price };
          }
          continue;
        }

        const isFoilName = rawName.toLowerCase().includes('foil');
        const cleanName = rawName.replace(/\s*\(Foil\)\s*$/i, '').replace(/\s*\([^)]*\)\s*$/, '').trim();

        if (isFoilName) {
          const foilVariant = variants.find(v => (v.printing || '').toLowerCase().includes('foil')) || variants[0];
          if (foilVariant?.price != null) {
            if (!foils[cleanName] || foilVariant.price < foils[cleanName].market) {
              foils[cleanName] = { market: foilVariant.price };
            }
          }
        } else {
          const stdVariant = variants.find(v => {
            const p = (v.printing || '').toLowerCase();
            return p === 'normal' || p === 'standard' || (!p.includes('foil') && !p.includes('holo'));
          }) || variants.find(v => !(v.printing || '').toLowerCase().includes('foil')) || variants[0];

          if (stdVariant?.price != null) {
            if (!cards[cleanName] || stdVariant.price < cards[cleanName].market) {
              cards[cleanName] = { market: stdVariant.price };
            }
          }
        }
      }

      process.stdout.write(`\r  Fetched ${totalFetched} entries | Standard: ${Object.keys(cards).length} | Foil: ${Object.keys(foils).length} | Sealed: ${Object.keys(sealed).length} | Requests: ${requestCount}`);

      if (hasMore) await sleep(DELAY_MS);

    } catch(e) {
      console.error('\nNetwork error:', e.message);
      break;
    }
  }

  console.log('\n\nFetch complete!');

  const output = buildOutput(cards, foils, sealed);
  saveProgress(output);

  console.log(`\n=== Summary ===`);
  console.log(`Standard cards: ${Object.keys(cards).length}`);
  console.log(`Foil cards:     ${Object.keys(foils).length}`);
  console.log(`Sealed products: ${Object.keys(sealed).length}`);
  console.log(`API requests:   ${requestCount}`);

  const allPrices = [...Object.values(cards), ...Object.values(foils)].map(v => v.market).filter(Boolean);
  if (allPrices.length) {
    allPrices.sort((a, b) => b - a);
    console.log(`Most expensive: $${allPrices[0].toFixed(2)}`);
    console.log(`Average price:  $${(allPrices.reduce((a, b) => a + b, 0) / allPrices.length).toFixed(2)}`);
  }

  console.log(`\nSaved to prices.json — upload to GitHub!`);
}

function buildOutput(cards, foils, sealed) {
  return {
    generated: new Date().toISOString(),
    source: 'JustTCG (justtcg.com)',
    game: 'Sorcery: Contested Realm',
    counts: {
      standard: Object.keys(cards).length,
      foil: Object.keys(foils).length,
      sealed: Object.keys(sealed).length,
    },
    prices: cards,
    foils,
    sealed
  };
}

fetchAllPrices().then(() => process.exit(0)).catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
