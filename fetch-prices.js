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

// Promotional / special printings are encoded by JustTCG (mirroring TCGplayer)
// as a parenthetical in the card name, e.g. "Lightning Bolt (Team Covenant Promo) (Foil)".
// They trade at very different prices than the booster printing, so we must NOT
// merge them into the base card price. This regex flags a parenthetical as a
// promo/special printing. It deliberately does NOT match the handful of real
// card names whose parenthetical is part of the name (Frog (Blue), Frog (Green),
// Frog (Red), Foot Soldier (English), Foot Soldier (Saracen)).
const PROMO_RE = /(promo|promotional|team\s*covenant|box\s*topper|topper|pre[\s-]*release|prerelease|buy[\s-]*a[\s-]*box|judge|kickstarter|convention|retailer|hobby|launch\s*party|demo|signed|playtest|alt(?:ernate)?[\s-]*art|borderless|extended[\s-]*art|full\s*art)/i;

// Split a raw JustTCG product name into a clean base name, whether it's foil,
// and a promo qualifier (empty for normal booster cards). Legitimate name
// parentheticals (e.g. "(Blue)", "(English)") are preserved in the clean name.
function classifyName(rawName) {
  let name = String(rawName || '');
  let foil = false;
  if (/\(\s*foil\s*\)/i.test(name)) { foil = true; name = name.replace(/\(\s*foil\s*\)/ig, ' '); }
  else if (/\bfoil\b/i.test(name)) { foil = true; name = name.replace(/\bfoil\b/ig, ' '); }
  const promoQuals = [];
  name = name.replace(/\(([^)]*)\)/g, (m, inner) => {
    if (PROMO_RE.test(inner)) { promoQuals.push(inner.trim()); return ' '; }
    return m; // keep real name parentheticals like (Blue) / (English)
  });
  const clean = name.replace(/\s{2,}/g, ' ').replace(/\s+\)/g, ')').replace(/\(\s+/g, '(').trim();
  return { clean, foil, promo: promoQuals.join(' ').replace(/\s{2,}/g, ' ').trim() };
}

// Pick the price for a (foil|standard) reading from a card object's variants,
// mirroring the original selection logic.
function pickVariantPrice(variants, foil) {
  let v;
  if (foil) {
    v = variants.find(x => (x.printing || '').toLowerCase().includes('foil')) || variants[0];
  } else {
    v = variants.find(x => {
      const p = (x.printing || '').toLowerCase();
      return p === 'normal' || p === 'standard' || (!p.includes('foil') && !p.includes('holo'));
    }) || variants.find(x => !(x.printing || '').toLowerCase().includes('foil')) || variants[0];
  }
  return v && v.price != null ? v.price : null;
}

// Map a JustTCG `set_name` to the canonical set name used in cards.json, so the
// Vault can look up a printing's price by the same set label it already has.
// Keyword-based (like PROMO_RE) and order-sensitive; unknown sets are returned
// verbatim so they show up in the run summary and we can extend this list.
function canonicalSet(setName) {
  const s = (setName || '').toLowerCase();
  if (/arthur/.test(s))  return 'Arthurian Legends';
  if (/beta/.test(s))    return 'Beta';
  if (/alpha/.test(s))   return 'Alpha';
  if (/gothic/.test(s))  return 'Gothic';
  if (/dragon/.test(s))  return 'Dragonlord';
  if (/promo/.test(s))   return 'Promotional';
  return (setName || '').trim();
}

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
  let existing = { cards: {}, foils: {}, sealed: {}, promos: {}, bySet: {} };
  let startOffset = 0;

  if (!FRESH && fs.existsSync(OUTPUT_FILE)) {
    try {
      const old = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'));
      if (old.cards) {
        existing = { cards: old.cards || {}, foils: old.foils || {}, sealed: old.sealed || {}, promos: old.promos || {}, bySet: old.bySet || {} };
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
  // promos: cleanName -> qualifier -> { standard?, foil? }
  // (e.g. promos["Lightning Bolt"]["Team Covenant Promo"] = { foil: 14.99 })
  const promos = existing.promos;
  // bySet: cleanName -> canonicalSetName -> { standard?, foil? } — per-printing
  // prices so the Vault can treat e.g. Alpha and Beta as separate, separately
  // priced holdings. (e.g. bySet["Apprentice Wizard"]["Alpha"] = { standard: 1.2 })
  const bySet = existing.bySet;
  const setNamesSeen = {}; // raw set_name -> { canonical, count } (for the run summary)

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
          const output = buildOutput(cards, foils, sealed, promos, bySet);
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

        const { clean: cleanName, foil, promo } = classifyName(rawName);
        const price = pickVariantPrice(variants, foil);
        if (price == null) continue;

        if (promo) {
          // Track promotional / special printings separately so their (often very
          // different) price never merges into the booster card price.
          const finish = foil ? 'foil' : 'standard';
          const slot = (promos[cleanName] = promos[cleanName] || {});
          const entry = (slot[promo] = slot[promo] || {});
          if (entry[finish] == null || price < entry[finish]) entry[finish] = price;
        } else {
          const finish = foil ? 'foil' : 'standard';
          // Top-level name-keyed maps (lowest across printings) — unchanged, so the
          // rest of the site keeps working exactly as before.
          if (foil) {
            if (!foils[cleanName] || price < foils[cleanName].market) foils[cleanName] = { market: price };
          } else {
            if (!cards[cleanName] || price < cards[cleanName].market) cards[cleanName] = { market: price };
          }
          // Per-set price (min within a set+finish), so Alpha/Beta/etc. stay distinct.
          const setName = canonicalSet(card.set_name);
          if (setName) {
            const seen = (setNamesSeen[card.set_name || ''] = setNamesSeen[card.set_name || ''] || { canonical: setName, count: 0 });
            seen.count++;
            const bs = (bySet[cleanName] = bySet[cleanName] || {});
            const ss = (bs[setName] = bs[setName] || {});
            if (ss[finish] == null || price < ss[finish]) ss[finish] = price;
          }
        }
      }

      process.stdout.write(`\r  Fetched ${totalFetched} entries | Standard: ${Object.keys(cards).length} | Foil: ${Object.keys(foils).length} | Sealed: ${Object.keys(sealed).length} | Promo: ${Object.keys(promos).length} | Requests: ${requestCount}`);

      if (hasMore) await sleep(DELAY_MS);

    } catch(e) {
      console.error('\nNetwork error:', e.message);
      break;
    }
  }

  console.log('\n\nFetch complete!');

  const output = buildOutput(cards, foils, sealed, promos, bySet);
  saveProgress(output);

  // Count promo price points + list the distinct qualifiers we detected, so the
  // run is self-validating (the parser is keyword-based; this shows what it caught).
  let promoPoints = 0; const promoQuals = {};
  for (const byQual of Object.values(promos)) {
    for (const [qual, fin] of Object.entries(byQual)) {
      promoQuals[qual] = (promoQuals[qual] || 0) + 1;
      promoPoints += Object.keys(fin).length;
    }
  }

  console.log(`\n=== Summary ===`);
  console.log(`Standard cards: ${Object.keys(cards).length}`);
  console.log(`Foil cards:     ${Object.keys(foils).length}`);
  console.log(`Sealed products: ${Object.keys(sealed).length}`);
  console.log(`Promo cards:    ${Object.keys(promos).length} (${promoPoints} price points)`);
  console.log(`Per-set cards:  ${Object.keys(bySet).length}`);

  // Distinct set names JustTCG returned and how each mapped to a cards.json set —
  // confirms the canonicalSet() mapping covers every set (anything that maps to
  // itself is unrecognized and needs a rule added).
  const setRows = Object.entries(setNamesSeen).sort((a, b) => b[1].count - a[1].count);
  if (setRows.length) {
    console.log(`Set names detected (raw → canonical · price points):`);
    setRows.forEach(([raw, info]) => {
      const flag = (info.canonical.toLowerCase() === (raw || '').toLowerCase().trim()
        && !['alpha','beta','gothic','dragonlord','promotional','arthurian legends'].includes(info.canonical.toLowerCase()))
        ? '  ⚠ UNRECOGNIZED' : '';
      console.log(`   - "${raw}" → "${info.canonical}": ${info.count}${flag}`);
    });
  }
  const qualList = Object.entries(promoQuals).sort((a, b) => b[1] - a[1]);
  if (qualList.length) {
    console.log(`Promo qualifiers detected:`);
    qualList.forEach(([q, n]) => console.log(`   - ${q}: ${n} card(s)`));
  } else {
    console.log(`Promo qualifiers detected: none (check the PROMO_RE patterns vs the data)`);
  }
  console.log(`API requests:   ${requestCount}`);

  const allPrices = [...Object.values(cards), ...Object.values(foils)].map(v => v.market).filter(Boolean);
  if (allPrices.length) {
    allPrices.sort((a, b) => b - a);
    console.log(`Most expensive: $${allPrices[0].toFixed(2)}`);
    console.log(`Average price:  $${(allPrices.reduce((a, b) => a + b, 0) / allPrices.length).toFixed(2)}`);
  }

  console.log(`\nSaved to prices.json — upload to GitHub!`);
}

function buildOutput(cards, foils, sealed, promos, bySet) {
  promos = promos || {};
  bySet = bySet || {};
  return {
    generated: new Date().toISOString(),
    source: 'JustTCG (justtcg.com)',
    game: 'Sorcery: Contested Realm',
    counts: {
      standard: Object.keys(cards).length,
      foil: Object.keys(foils).length,
      sealed: Object.keys(sealed).length,
      promo: Object.keys(promos).length,
      bySet: Object.keys(bySet).length,
    },
    prices: cards,
    foils,
    sealed,
    // Promotional / special printings, kept separate from the booster prices.
    // Shape: { "Card Name": { "Team Covenant Promo": { standard?, foil? }, ... } }
    promos,
    // Per-set prices so the Vault can price each printing (Alpha/Beta/etc.) on its
    // own. Shape: { "Card Name": { "Alpha": { standard?, foil? }, "Beta": {...} } }
    bySet,
  };
}

fetchAllPrices().then(() => process.exit(0)).catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
