// ─────────────────────────────────────────────────────────────
// Cursed Realm — shared price-history chart renderer
// Used by index.html (card modal), collection.html (Vault card modal),
// and avatar.html. Dependency-free inline-SVG line chart (standard + foil)
// pulled from the public price_history table via the Supabase REST API.
//
// Usage:  CRPriceChart.load(cardName, targetElOrId)
//   targetElOrId — an element or an element id; it's filled with the chart
//   (or a graceful empty state). Stale results are ignored so rapid opens
//   don't flicker the wrong card.
//
// The .pc-* styles live in each page's stylesheet (already present).
// ─────────────────────────────────────────────────────────────
(function () {
  const SUPABASE_URL = 'https://nuizkjkcephopnbcmtlz.supabase.co';
  const SUPABASE_ANON = 'sb_publishable_9er9B3YGFuvNO8Y8W6yr2g_sR5tXvKH';

  let token = 0; // guards against a newer chart load finishing after an older one

  async function load(cardName, target) {
    const el = typeof target === 'string' ? document.getElementById(target) : target;
    if (!el) return;
    const mine = ++token;
    el.style.display = '';
    el.innerHTML = '<div class="pc-title">Price History</div><div class="pc-status">Loading…</div>';
    let rows = [];
    try {
      // Page through results — PostgREST caps each response at 1000 rows, so
      // once a card accumulates more than that (≈months of daily capture) an
      // unpaginated fetch would silently drop its most recent history.
      const PAGE = 1000;
      const base = `${SUPABASE_URL}/rest/v1/price_history?card_name=eq.${encodeURIComponent(cardName)}&select=captured_at,finish,market&order=captured_at.asc,finish.asc`;
      for (let offset = 0; ; offset += PAGE) {
        const res = await fetch(`${base}&limit=${PAGE}&offset=${offset}`, { headers: { apikey: SUPABASE_ANON, Authorization: 'Bearer ' + SUPABASE_ANON } });
        if (!res.ok) break;
        const page = await res.json();
        rows.push(...page);
        if (page.length < PAGE) break;
      }
    } catch (e) { /* offline / table missing → empty state */ }
    if (mine !== token) return; // a newer load started; ignore this stale result
    if (!rows.length) {
      el.innerHTML = '<div class="pc-title">Price History</div><div class="pc-status">No price history yet — check back as daily prices are recorded.</div>';
      return;
    }
    el.innerHTML = '<div class="pc-title">Price History <span class="pc-sub">market, USD</span></div>' + renderSVG(rows);
  }

  function renderSVG(rows) {
    const W = 360, H = 150, padL = 44, padR = 16, padT = 12, padB = 24;
    const series = { standard: [], foil: [] };
    rows.forEach(r => { if (series[r.finish] && r.market != null) series[r.finish].push({ t: Date.parse(r.captured_at), v: +r.market }); });
    const all = [...series.standard, ...series.foil].map(p => p.v).filter(v => !isNaN(v));
    const times = [...series.standard, ...series.foil].map(p => p.t).filter(t => !isNaN(t));
    if (!all.length) return '<div class="pc-status">No price history yet.</div>';
    let minV = Math.min(...all), maxV = Math.max(...all);
    if (minV === maxV) { minV = Math.max(0, minV * 0.9); maxV = maxV * 1.1 || 1; }
    let minT = Math.min(...times), maxT = Math.max(...times);
    const xOf = t => maxT === minT ? (padL + (W - padL - padR) / 2) : padL + (t - minT) / (maxT - minT) * (W - padL - padR);
    const yOf = v => padT + (1 - (v - minV) / (maxV - minV)) * (H - padT - padB);
    const colors = { standard: 'var(--gold)', foil: 'var(--arcane)' };
    let paths = '', dots = '';
    for (const f of ['standard', 'foil']) {
      const pts = series[f].sort((a, b) => a.t - b.t);
      if (!pts.length) continue;
      if (pts.length === 1) {
        dots += `<circle cx="${xOf(pts[0].t).toFixed(1)}" cy="${yOf(pts[0].v).toFixed(1)}" r="3.5" fill="${colors[f]}"></circle>`;
      } else {
        const d = pts.map((p, i) => `${i ? 'L' : 'M'}${xOf(p.t).toFixed(1)},${yOf(p.v).toFixed(1)}`).join(' ');
        paths += `<path d="${d}" fill="none" stroke="${colors[f]}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"></path>`;
        const last = pts[pts.length - 1];
        dots += `<circle cx="${xOf(last.t).toFixed(1)}" cy="${yOf(last.v).toFixed(1)}" r="3" fill="${colors[f]}"></circle>`;
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
    const latest = f => { const p = series[f]; return p.length ? money(p[p.length - 1].v) : ''; };
    const legend = `<div class="pc-legend">`
      + `<span class="pc-leg"><span class="pc-dot" style="background:var(--gold)"></span>Standard <b>${latest('standard')}</b></span>`
      + (series.foil.length ? `<span class="pc-leg"><span class="pc-dot" style="background:var(--arcane)"></span>Foil <b>${latest('foil')}</b></span>` : '')
      + (times.length === 1 ? `<span class="pc-leg pc-note">one data point so far</span>` : '')
      + `</div>`;
    return `<svg viewBox="0 0 ${W} ${H}" class="pc-svg" role="img" aria-label="Price history line chart">${grid}${paths}${dots}${yLab}${xLab}</svg>${legend}<div class="pc-source">Source: <b>TCGplayer Market</b> · via JustTCG</div>`;
  }

  window.CRPriceChart = { load, renderSVG };
})();
