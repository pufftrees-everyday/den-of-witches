// ─────────────────────────────────────────────────────────────
// Cursed Realm — shared Rulebook / Event Guide engine
// Powers rulebook.html and event-guide.html. Each page defines
// window.RB_CONFIG before loading this script; only the JSON source
// and a few labels differ. Glossary + Quick Reference are optional
// (the Event Guide JSON has neither, so those sections just don't render).
//
//   window.RB_CONFIG = {
//     json:          'rulebook-content.json',  // required — content source
//     fallbackTitle: 'Rulebook',               // subtitle/title when JSON has no title
//     releasedLabel: 'Released ',              // prefix before DATA.released ('' for none)
//     noun:          'rulebook',               // "Could not load the {noun}."
//     resultNoun:    'rules or terms'          // "No {resultNoun} match …"
//   };
// ─────────────────────────────────────────────────────────────
(function () {
  const CFG = window.RB_CONFIG || {};
  const FALLBACK_TITLE = CFG.fallbackTitle || 'Document';
  const RELEASED_LABEL = CFG.releasedLabel || '';
  const NOUN = CFG.noun || 'document';
  const RESULT_NOUN = CFG.resultNoun || 'results';

  let DATA = null;
  let titleToId = {};       // section title (lowercased) → section id
  let glossarySorted = [];  // glossary sorted by term (empty when the JSON has none)
  let MIN_PAGE = 1, MAX_PAGE = 999;

  const $ = id => document.getElementById(id);
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function escRegex(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function highlight(text, q){
    const e = esc(text);
    if (!q) return e;
    return e.replace(new RegExp('('+escRegex(q)+')','gi'), '<mark>$1</mark>');
  }
  // Turn bare URLs in the text into clickable links, while still escaping and
  // search-highlighting the surrounding text. Known TLDs only, so ordinary
  // prose (e.g. "etc.") is never mistaken for a link.
  const URL_RE = /((?:https?:\/\/|www\.)[^\s<)]+|(?:[a-z0-9-]+\.)+(?:com|io|org|net|gg)(?:\/[^\s<)]*)?)/gi;
  function linkify(line, q){
    let out = '', last = 0, m;
    URL_RE.lastIndex = 0;
    while ((m = URL_RE.exec(line))){
      out += highlight(line.slice(last, m.index), q);
      let raw = m[0], trail = '';
      const tm = raw.match(/[.,;:!?]+$/);          // keep trailing punctuation out of the link
      if (tm){ trail = raw.slice(-tm[0].length); raw = raw.slice(0, -tm[0].length); }
      const href = /^https?:\/\//i.test(raw) ? raw : 'https://' + raw;
      out += '<a class="rb-link" href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">' + highlight(raw, q) + '</a>' + highlight(trail, q);
      last = m.index + m[0].length;
    }
    out += highlight(line.slice(last), q);
    return out;
  }
  // Render \n-separated text into paragraphs, with optional highlight + auto-links
  function renderText(text, q){
    return (text || '').split('\n')
      .map(line => line.trim() ? '<p class="rb-para">'+linkify(line, q)+'</p>' : '')
      .join('');
  }

  function renderSection(s, q){
    return `<section class="rb-section" id="r-${esc(s.id)}" data-page="${s.page}" tabindex="-1" aria-label="${esc(s.title)}, page ${s.page}">
      <div class="rb-section-head">
        <h2 class="rb-section-title">${highlight(s.title, q)}</h2>
        <span class="rb-page-badge" title="Page ${s.page}">Page ${s.page}</span>
      </div>
      ${renderText(s.text, q)}
    </section>`;
  }
  // Terms get a distinct anchor prefix (r-g- glossary, r-q- quick ref) so they
  // never collide with section ids that share the same slug (e.g. "mana").
  function renderTerm(t, q, prefix){
    return `<div class="rb-term" id="${prefix}${esc(t.id)}" data-page="${t.page}" tabindex="-1">
      <div class="rb-term-head">
        <span class="rb-term-name">${highlight(t.term, q)}</span>
        <span class="rb-page-badge" title="Page ${t.page}">Page ${t.page}</span>
      </div>
      <div class="rb-term-def">${renderText(t.definition, q)}</div>
    </div>`;
  }
  function renderTermGroup(id, title, terms, q, prefix){
    return `<section class="rb-section rb-group" id="${id}" tabindex="-1">
      <div class="rb-section-head"><h2 class="rb-section-title">${esc(title)}</h2></div>
      <div class="rb-terms">${terms.map(t => renderTerm(t, q, prefix)).join('')}</div>
    </section>`;
  }

  function secMatches(s, q){ return (s.title + ' ' + s.text).toLowerCase().includes(q); }
  function termMatches(t, q){ return (t.term + ' ' + t.definition).toLowerCase().includes(q); }

  function renderContent(rawQuery){
    const q = (rawQuery || '').trim().toLowerCase();
    const container = $('rb-content');
    let html = '', total = 0;

    const sections = q ? DATA.sections.filter(s => secMatches(s, q)) : DATA.sections;
    sections.forEach(s => { html += renderSection(s, q); total++; });

    const gloss = q ? glossarySorted.filter(t => termMatches(t, q)) : glossarySorted;
    if (gloss.length){ html += renderTermGroup('r-glossary', 'Glossary', gloss, q, 'r-g-'); total += gloss.length; }

    const qref = q ? DATA.quickReference.filter(t => termMatches(t, q)) : DATA.quickReference;
    if (qref.length){ html += renderTermGroup('r-quick-reference', 'Quick Reference', qref, q, 'r-q-'); total += qref.length; }

    if (q && total === 0){
      html = `<div class="rb-noresults">No ${RESULT_NOUN} match “<b>${esc(rawQuery.trim())}</b>”.<br>Try a different word.</div>`;
    }
    container.innerHTML = html;

    const count = $('rb-count');
    count.textContent = q ? `${total} result${total===1?'':'s'} for “${rawQuery.trim()}”` : '';
  }

  // Groups start collapsed so the long sidebar isn't overwhelming; click a
  // heading (caret) to expand it. Mirrors the collapse pattern used site-wide.
  function tocGroup(title, linksHtml){
    return `<div class="rb-toc-group collapsed">
      <button class="rb-toc-title" type="button" aria-expanded="false" onclick="toggleTocGroup(this)" title="Show or hide this group">
        <span class="rb-toc-caret" aria-hidden="true">▾</span>${esc(title)}
      </button>
      <div class="rb-toc-body">${linksHtml}</div>
    </div>`;
  }
  function buildToc(){
    const nav = $('rb-toc');
    let html = '';
    DATA.toc.forEach(group => {
      let links = '';
      (group.items || []).forEach(item => {
        // Items may be a plain title string (resolved via titleToId) or an
        // explicit {label,id} pair — the latter lets the three Event Guides reuse
        // section names like "Intro" / "Your Role" without anchor collisions.
        let label, anchor;
        if (item && typeof item === 'object'){
          label = item.label || item.title || '';
          anchor = item.id ? 'r-' + item.id : '';
        } else {
          label = item;
          const id = titleToId[String(item).toLowerCase()];
          anchor = id ? 'r-' + id : '';
        }
        links += `<a class="rb-toc-link" href="#${anchor}" onclick="return tocGo(event,'${anchor}')">${esc(label)}</a>`;
      });
      html += tocGroup(group.group, links);
    });
    // Reference group for the glossary + quick reference (only when present)
    if (glossarySorted.length || (DATA.quickReference || []).length){
      html += tocGroup('Reference',
        `<a class="rb-toc-link" href="#r-glossary" onclick="return tocGo(event,'r-glossary')">Glossary</a>
         <a class="rb-toc-link" href="#r-quick-reference" onclick="return tocGo(event,'r-quick-reference')">Quick Reference</a>`);
    }
    nav.innerHTML = html;
  }
  function toggleTocGroup(btn){
    const g = btn.closest('.rb-toc-group');
    const collapsed = g.classList.toggle('collapsed');
    btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  }

  function clearSearchIfActive(){
    const input = $('rb-search');
    if (input.value){ input.value = ''; renderContent(''); }
  }
  function scrollToAnchor(anchor){
    if(!anchor) return false;
    const el = document.getElementById(anchor);
    if(!el) return false;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.focus({ preventScroll: true });
    return true;
  }
  function tocGo(e, anchor){
    if(e) e.preventDefault();
    clearSearchIfActive();
    // wait a tick so the (possibly re-rendered) target exists before scrolling
    requestAnimationFrame(() => scrollToAnchor(anchor));
    closeTocMobile();
    return false;
  }

  function jumpToPage(){
    const input = $('rb-page');
    let n = parseInt(input.value, 10);
    if (isNaN(n)) return;
    n = Math.max(MIN_PAGE, Math.min(MAX_PAGE, n));
    input.value = n;
    // First block (section, then glossary, then quick reference) on that page;
    // if the exact page has nothing, fall to the next page that does.
    // Each entry carries its own anchor (terms use the r-g-/r-q- prefixes).
    const ordered = [
      ...DATA.sections.map(x => ({ page: x.page, anchor: 'r-' + x.id })),
      ...glossarySorted.map(x => ({ page: x.page, anchor: 'r-g-' + x.id })),
      ...(DATA.quickReference || []).map(x => ({ page: x.page, anchor: 'r-q-' + x.id }))
    ];
    let target = ordered.find(x => x.page === n) || ordered.filter(x => x.page >= n).sort((a,b)=>a.page-b.page)[0];
    if (!target) return;
    clearSearchIfActive();
    requestAnimationFrame(() => scrollToAnchor(target.anchor));
  }

  function toggleToc(){
    const toc = $('rb-toc'), btn = $('rb-toc-toggle');
    const open = toc.classList.toggle('open');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  function closeTocMobile(){
    const toc = $('rb-toc'), btn = $('rb-toc-toggle');
    if (toc.classList.contains('open')) { toc.classList.remove('open'); btn.setAttribute('aria-expanded','false'); }
  }

  async function loadBook(){
    try {
      const res = await fetch(CFG.json);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      DATA = await res.json();
      DATA.sections = DATA.sections || [];
      DATA.glossary = DATA.glossary || [];
      DATA.quickReference = DATA.quickReference || [];
      DATA.toc = DATA.toc || [];

      titleToId = {};
      DATA.sections.forEach(s => { titleToId[String(s.title).toLowerCase()] = s.id; });
      glossarySorted = [...DATA.glossary].sort((a,b) => String(a.term).localeCompare(String(b.term)));

      // Page bounds from the data (input is clamped to these)
      const allPages = [...DATA.sections, ...DATA.glossary, ...DATA.quickReference]
        .map(x => x.page).filter(p => typeof p === 'number');
      if (allPages.length){ MIN_PAGE = Math.min(...allPages); MAX_PAGE = Math.max(...allPages); }
      const pageInput = $('rb-page');
      pageInput.min = MIN_PAGE; pageInput.max = MAX_PAGE;
      pageInput.placeholder = MIN_PAGE + '–' + MAX_PAGE;

      $('rb-subtitle').textContent =
        (DATA.title || FALLBACK_TITLE) + (DATA.released ? ' · ' + RELEASED_LABEL + DATA.released : '') + (DATA.pageCount ? ' · ' + DATA.pageCount + ' pages' : '');
      document.title = (DATA.title ? DATA.title.replace(/—.*$/, '').trim() : FALLBACK_TITLE) + ' — Cursed Realm';

      buildToc();
      renderContent('');

      // Wire controls
      $('rb-search').addEventListener('input', e => renderContent(e.target.value));
      $('rb-page').addEventListener('keydown', e => { if (e.key === 'Enter'){ e.preventDefault(); jumpToPage(); } });

      // Deep link: #r-<id> on load
      if (location.hash && location.hash.length > 1){
        requestAnimationFrame(() => scrollToAnchor(location.hash.slice(1)));
      }
    } catch (e) {
      console.warn(e);
      $('rb-content').innerHTML = '<div class="rb-status">Could not load the ' + NOUN + '.<br><small>' + esc(e.message || '') + '</small></div>';
      $('rb-subtitle').textContent = '';
    }
  }

  // Expose the handlers referenced by inline onclick= in the page markup
  window.toggleTocGroup = toggleTocGroup;
  window.tocGo = tocGo;
  window.jumpToPage = jumpToPage;
  window.toggleToc = toggleToc;

  loadBook();
})();
