// ─────────────────────────────────────────────────────────────
// Cursed Realm — shared price-history chart renderer
// Used by index.html (card modal), collection.html (Vault card modal),
// avatar.html and artist.html. Dependency-free inline-SVG line chart pulled
// from the public price_history table via the Supabase REST API.
//
// Usage:  CRPriceChart.load(cardName, targetElOrId)
//   Charts EVERY printing of the card on one plot: the base card's Standard +
//   Foil, plus each promotional / special printing (stored in price_history as
//   "Card Name (Qualifier)"). Each printing/finish is its own line + legend
//   entry, so a promo's price shows up alongside the booster price.
//
//   targetElOrId — an element or an element id; it's filled with the chart
//   (or a graceful empty state). Stale results are ignored so rapid opens
//   don't flicker the wrong card.
//
// The .pc-* styles live in each page's stylesheet (already present).
// ─────────────────────────────────────────────────────────────
(function () {
  const SUPABASE_URL = 'https://nuizkjkcephopnbcmtlz.supabase.co';
  const SUPABASE_ANON = 'sb_publishable_9er9B3YGFuvNO8Y8W6yr2g_sR5tXvKH';

  // Distinct colours for promo printings (base uses gold/arcane below).
  const PROMO_PALETTE = ['#c4614a', '#5a8a6a', '#6bb0c4', '#c98fb0', '#a0c46a', '#b48ead', '#d8a657'];

  let token = 0; // guards against a newer chart load finishing after an older one

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  async function load(cardName, target) {
    const el = typeof target === 'string' ? document.getElementById(target) : target;
    if (!el) return;
    const mine = ++token;
    el.style.display = '';
    el.innerHTML = '<div class="pc-title">Price History</div><div class="pc-status">Loading…</div>';
    let rows = [];
    try {
      // Prefix match so we pull the base card AND its "Name (Qualifier)" promo
      // printings in one query; we filter precisely client-side below. Page
      // through results — PostgREST caps each response at 1000 rows, so once a
      // card accumulates more than that an unpaginated fetch would silently drop
      // its most recent history.
      const PAGE = 1000;
      const base = `${SUPABASE_URL}/rest/v1/price_history?card_name=like.${encodeURIComponent(cardName)}*&select=captured_at,finish,market,card_name&order=captured_at.asc,finish.asc`;
      for (let offset = 0; ; offset += PAGE) {
        const res = await fetch(`${base}&limit=${PAGE}&offset=${offset}`, { headers: { apikey: SUPABASE_ANON, Authorization: 'Bearer ' + SUPABASE_ANON } });
        if (!res.ok) break;
        const page = await res.json();
        rows.push(...page);
        if (page.length < PAGE) break;
      }
    } catch (e) { /* offline / table missing → empty state */ }
    if (mine !== token) return; // a newer load started; ignore this stale result

    // Keep only the exact base card and its promo printings ("Base (Qualifier)").
    // The prefix query can also catch unrelated cards that merely share a prefix
    // (e.g. "Fire" vs "Fireball") — this drops those.
    const kept = rows.filter(r => r.card_name === cardName || (typeof r.card_name === 'string' && r.card_name.startsWith(cardName + ' (')));
    const series = buildSeries(kept, cardName);

    if (!series.length) {
      el.innerHTML = '<div class="pc-title">Price History</div><div class="pc-status">No price history yet — check back as prices are recorded (several times a day).</div>';
      return;
    }
    el.innerHTML = '<div class="pc-title">Price History <span class="pc-sub">market, USD</span></div>' + renderSVG(series);
  }

  // Group rows into one series per (printing × finish). Base printing first
  // (Standard = gold, Foil = arcane), then each promo gets a palette colour
  // (its foil drawn dashed in the same colour so std/foil stay visually paired).
  function buildSeries(rows, baseName) {
    const byName = new Map();
    for (const r of rows) {
      if (r.market == null) continue;
      if (!byName.has(r.card_name)) byName.set(r.card_name, []);
      byName.get(r.card_name).push(r);
    }
    const names = [...byName.keys()].sort((a, b) => (a === baseName ? -1 : b === baseName ? 1 : a.localeCompare(b)));
    const series = [];
    let promoIdx = 0;
    for (const name of names) {
      const isBase = name === baseName;
      const qual = isBase ? '' : ((name.slice(baseName.length).match(/\(([^)]*)\)\s*$/) || [])[1] || name);
      const promoColor = isBase ? null : PROMO_PALETTE[promoIdx % PROMO_PALETTE.length];
      let addedForName = false;
      for (const fin of ['standard', 'foil']) {
        const pts = byName.get(name)
          .filter(r => r.finish === fin)
          .map(r => ({ t: Date.parse(r.captured_at), v: +r.market }))
          .filter(p => !isNaN(p.v) && !isNaN(p.t))
          .sort((a, b) => a.t - b.t);
        if (!pts.length) continue;
        addedForName = true;
        const label = isBase
          ? (fin === 'standard' ? 'Standard' : 'Foil')
          : (qual + (fin === 'foil' ? ' · Foil' : ''));
        const color = isBase ? (fin === 'standard' ? 'var(--gold)' : 'var(--arcane)') : promoColor;
        series.push({ label, color, dash: !isBase && fin === 'foil', points: pts });
      }
      if (!isBase && addedForName) promoIdx++;
    }
    return series;
  }

  function renderSVG(series) {
    const W = 360, H = 150, padL = 44, padR = 16, padT = 12, padB = 24;
    const allV = [], allT = [];
    series.forEach(s => s.points.forEach(p => { allV.push(p.v); allT.push(p.t); }));
    if (!allV.length) return '<div class="pc-status">No price history yet.</div>';
    let minV = Math.min(...allV), maxV = Math.max(...allV);
    if (minV === maxV) { minV = Math.max(0, minV * 0.9); maxV = maxV * 1.1 || 1; }
    const minT = Math.min(...allT), maxT = Math.max(...allT);
    const xOf = t => maxT === minT ? (padL + (W - padL - padR) / 2) : padL + (t - minT) / (maxT - minT) * (W - padL - padR);
    const yOf = v => padT + (1 - (v - minV) / (maxV - minV)) * (H - padT - padB);

    let paths = '', dots = '';
    for (const s of series) {
      const pts = s.points;
      if (pts.length === 1) {
        dots += `<circle cx="${xOf(pts[0].t).toFixed(1)}" cy="${yOf(pts[0].v).toFixed(1)}" r="3.5" fill="${s.color}"></circle>`;
      } else {
        const d = pts.map((p, i) => `${i ? 'L' : 'M'}${xOf(p.t).toFixed(1)},${yOf(p.v).toFixed(1)}`).join(' ');
        paths += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"${s.dash ? ' stroke-dasharray="4 3"' : ''}></path>`;
        const last = pts[pts.length - 1];
        dots += `<circle cx="${xOf(last.t).toFixed(1)}" cy="${yOf(last.v).toFixed(1)}" r="3" fill="${s.color}"></circle>`;
      }
    }
    const money = v => '$' + v.toFixed(2);
    const fmtDate = t => { const d = new Date(t); return (d.getMonth() + 1) + '/' + d.getDate(); };
    const grid = `<line x1="${padL}" y1="${yOf(maxV).toFixed(1)}" x2="${W - padR}" y2="${yOf(maxV).toFixed(1)}" class="pc-grid"></line>`
               + `<line x1="${padL}" y1="${yOf(minV).toFixed(1)}" x2="${W - padR}" y2="${yOf(minV).toFixed(1)}" class="pc-grid"></line>`;
    const yLab = `<text x="${padL - 6}" y="${(yOf(maxV) + 3).toFixed(1)}" class="pc-axis" text-anchor="end">${money(maxV)}</text>`
               + `<text x="${padL - 6}" y="${(yOf(minV) + 3).toFixed(1)}" class="pc-axis" text-anchor="end">${money(minV)}</text>`;
    const xLab = `<text x="${padL}" y="${H - 7}" class="pc-axis" text-anchor="start">${fmtDate(minT)}</text>`
               + `<text x="${W - padR}" y="${H - 7}" class="pc-axis" text-anchor="end">${fmtDate(maxT)}</text>`;
    const oneEach = allT.length === series.length; // every series has a single point
    const legend = `<div class="pc-legend">`
      + series.map(s => `<span class="pc-leg"><span class="pc-dot" style="background:${s.color}${s.dash ? ';outline:1px dashed ' + s.color + ';outline-offset:1px' : ''}"></span>${esc(s.label)} <b>${money(s.points[s.points.length - 1].v)}</b></span>`).join('')
      + (oneEach ? `<span class="pc-leg pc-note">one data point so far</span>` : '')
      + `</div>`;
    return `<svg viewBox="0 0 ${W} ${H}" class="pc-svg" role="img" aria-label="Price history line chart">${grid}${paths}${dots}${yLab}${xLab}</svg>${legend}<div class="pc-source">Source: <b>TCGplayer Market</b> · via JustTCG</div>`;
  }

  window.CRPriceChart = { load, renderSVG, buildSeries };
})();
