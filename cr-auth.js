// ─────────────────────────────────────────────────────────────
// Cursed Realm — shared auth + cloud sync module
// Loaded on index, collection, rulebook, and about pages.
// Exposes window.CR with auth + cloud helpers.
// ─────────────────────────────────────────────────────────────
(function () {
  const SUPABASE_URL = 'https://nuizkjkcephopnbcmtlz.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_9er9B3YGFuvNO8Y8W6yr2g_sR5tXvKH';

  let supa = null;
  try { if (window.supabase) supa = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY); }
  catch (e) { console.warn('Supabase init failed', e); }

  const CR = {
    supa,
    user: null,           // { id, email, username, avatar } when logged in
    authMode: 'login',
    onAuthChange: null,   // page sets this callback; fires after login/logout/refresh
  };

  // Build the <img> for a user avatar URL (or '' if none). Used in the auth bar/menus.
  CR.avatarImg = function (url, size) {
    size = size || 22;
    if (!url) return '';
    return `<img src="${String(url).replace(/"/g, '&quot;')}" alt="" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;border:1px solid var(--border-strong,rgba(155,135,212,0.35));flex-shrink:0;" onerror="this.style.display='none'">`;
  };

  // ── SESSION ──
  CR.refreshUser = async function () {
    if (!supa) { CR.user = null; return null; }
    const { data } = await supa.auth.getUser();
    if (data && data.user) {
      let username = null, avatar = null;
      try {
        // select * so a missing avatar/links column never breaks the username lookup
        const { data: prof } = await supa.from('profiles').select('*').eq('id', data.user.id).single();
        if (prof) { if (prof.username) username = prof.username; if (prof.avatar) avatar = prof.avatar; }
      } catch (e) {}
      // Fall back to the display_name from signup metadata, never the email
      if (!username) username = (data.user.user_metadata && data.user.user_metadata.display_name) || 'Account';
      CR.user = { id: data.user.id, email: data.user.email, username, avatar };
    } else {
      CR.user = null;
    }
    return CR.user;
  };

  // ── AUTH MODAL (injected once) ──
  function injectAuthModal() {
    if (document.getElementById('cr-auth-overlay')) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = `
    <div class="modal-overlay" id="cr-auth-overlay" style="display:none;position:fixed;inset:0;background:rgba(11,10,15,0.85);z-index:500;align-items:center;justify-content:center;backdrop-filter:blur(4px);padding:20px;">
      <div style="background:var(--dusk,#1a1826);border:1px solid var(--border-strong,rgba(155,135,212,0.35));border-radius:10px;padding:28px;width:100%;max-width:380px;position:relative;">
        <button onclick="CR.closeAuth()" style="position:absolute;top:14px;right:16px;background:none;border:none;color:var(--mist,#3a3658);font-size:1.3rem;cursor:pointer;">✕</button>
        <h2 id="cr-auth-title" style="font-family:'Cinzel Decorative',serif;color:var(--gold,#c8a96e);font-size:1.4rem;margin-bottom:6px;">Sign In</h2>
        <p id="cr-auth-desc" style="color:var(--mist,#3a3658);font-size:0.9rem;margin-bottom:18px;">Log in to sync your decks and collection.</p>
        <div id="cr-auth-msg" style="display:none;font-size:0.85rem;padding:10px;border-radius:4px;margin-bottom:14px;"></div>
        <div id="cr-auth-field-name" style="display:none;margin-bottom:14px;">
          <label style="display:block;font-family:'Cinzel',serif;font-size:0.62rem;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:var(--rune,#6b5fa0);margin-bottom:6px;">Display Name</label>
          <input type="text" id="cr-auth-name" placeholder="How you'll appear in the gallery" style="width:100%;background:#0b0a0f;border:1px solid var(--border-strong,rgba(155,135,212,0.35));color:var(--parchment,#e8e0cc);font-family:'Crimson Pro',serif;font-size:1rem;padding:9px 12px;border-radius:4px;outline:none;">
        </div>
        <div style="margin-bottom:14px;">
          <label style="display:block;font-family:'Cinzel',serif;font-size:0.62rem;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:var(--rune,#6b5fa0);margin-bottom:6px;">Email</label>
          <input type="email" id="cr-auth-email" placeholder="you@example.com" style="width:100%;background:#0b0a0f;border:1px solid var(--border-strong,rgba(155,135,212,0.35));color:var(--parchment,#e8e0cc);font-family:'Crimson Pro',serif;font-size:1rem;padding:9px 12px;border-radius:4px;outline:none;">
        </div>
        <div style="margin-bottom:16px;">
          <label style="display:block;font-family:'Cinzel',serif;font-size:0.62rem;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;color:var(--rune,#6b5fa0);margin-bottom:6px;">Password</label>
          <input type="password" id="cr-auth-password" placeholder="••••••••" style="width:100%;background:#0b0a0f;border:1px solid var(--border-strong,rgba(155,135,212,0.35));color:var(--parchment,#e8e0cc);font-family:'Crimson Pro',serif;font-size:1rem;padding:9px 12px;border-radius:4px;outline:none;">
        </div>
        <button id="cr-auth-submit" onclick="CR.submitAuth()" style="width:100%;padding:11px;font-family:'Cinzel',serif;font-size:0.72rem;font-weight:600;letter-spacing:0.1em;text-transform:uppercase;border-radius:4px;cursor:pointer;background:var(--rune,#6b5fa0);border:1px solid var(--arcane,#9b87d4);color:#fff;">Sign In</button>
        <div id="cr-auth-toggle" style="text-align:center;margin-top:14px;font-size:0.88rem;color:var(--mist,#3a3658);">
          New here? <a onclick="CR.setAuthMode('signup')" style="color:var(--arcane,#9b87d4);cursor:pointer;text-decoration:underline;">Create an account</a>
        </div>
      </div>
    </div>`;
    document.body.appendChild(wrap.firstElementChild);
  }

  CR.openAuth = function (mode) { injectAuthModal(); CR.setAuthMode(mode || 'login'); document.getElementById('cr-auth-overlay').style.display = 'flex'; };
  CR.closeAuth = function () { const o = document.getElementById('cr-auth-overlay'); if (o) o.style.display = 'none'; CR._hideMsg(); };

  CR.setAuthMode = function (mode) {
    injectAuthModal();
    CR.authMode = mode;
    const isSignup = mode === 'signup';
    document.getElementById('cr-auth-title').textContent = isSignup ? 'Create Account' : 'Sign In';
    document.getElementById('cr-auth-desc').textContent = isSignup
      ? "Pick a display name — it shows on decks you publish."
      : 'Log in to sync your decks and collection.';
    document.getElementById('cr-auth-field-name').style.display = isSignup ? 'block' : 'none';
    document.getElementById('cr-auth-submit').textContent = isSignup ? 'Create Account' : 'Sign In';
    document.getElementById('cr-auth-toggle').innerHTML = isSignup
      ? `Already have an account? <a onclick="CR.setAuthMode('login')" style="color:var(--arcane,#9b87d4);cursor:pointer;text-decoration:underline;">Sign in</a>`
      : `New here? <a onclick="CR.setAuthMode('signup')" style="color:var(--arcane,#9b87d4);cursor:pointer;text-decoration:underline;">Create an account</a>`;
    CR._hideMsg();
  };

  CR._showMsg = function (text, type) {
    const el = document.getElementById('cr-auth-msg');
    if (!el) return;
    el.textContent = text; el.style.display = 'block';
    if (type === 'error') { el.style.background = 'rgba(196,97,74,0.12)'; el.style.border = '1px solid var(--ember,#c4614a)'; el.style.color = 'var(--ember,#c4614a)'; }
    else { el.style.background = 'rgba(90,138,106,0.12)'; el.style.border = '1px solid var(--sage,#5a8a6a)'; el.style.color = 'var(--sage,#5a8a6a)'; }
  };
  CR._hideMsg = function () { const el = document.getElementById('cr-auth-msg'); if (el) el.style.display = 'none'; };

  CR.submitAuth = async function () {
    if (!supa) { CR._showMsg('Connection unavailable.', 'error'); return; }
    const email = document.getElementById('cr-auth-email').value.trim();
    const password = document.getElementById('cr-auth-password').value;
    if (!email || !password) { CR._showMsg('Email and password are required.', 'error'); return; }
    const btn = document.getElementById('cr-auth-submit');
    btn.disabled = true; btn.style.opacity = '0.6';
    try {
      if (CR.authMode === 'signup') {
        const displayName = document.getElementById('cr-auth-name').value.trim();
        if (!displayName) { CR._showMsg('Please choose a display name.', 'error'); btn.disabled = false; btn.style.opacity = '1'; return; }
        const { error } = await supa.auth.signUp({
          email, password,
          options: { data: { display_name: displayName }, emailRedirectTo: window.location.origin + '/archive.html' }
        });
        if (error) throw error;
        CR.closeAuth();
        CR.setAuthMode('login');
        CR.toast('Account created — check your email to confirm and step into the realm.');
      } else {
        const { error } = await supa.auth.signInWithPassword({ email, password });
        if (error) throw error;
        CR.closeAuth();
        await CR.refreshUser();
        if (CR.onAuthChange) CR.onAuthChange('login');
      }
    } catch (e) {
      CR._showMsg(e.message || 'Something went wrong.', 'error');
    } finally {
      btn.disabled = false; btn.style.opacity = '1';
    }
  };

  CR.logout = async function () {
    if (supa) await supa.auth.signOut();
    CR.user = null;
    if (CR.onAuthChange) CR.onAuthChange('logout');
  };

  // Render a standard auth bar into an element id
  CR.renderAuthBar = function (elId) {
    const bar = document.getElementById(elId);
    if (!bar) return;
    if (CR.user) {
      bar.innerHTML = `<button class="profile-trigger header-link" onclick="CR.toggleProfileMenu(event)" style="background:none;border:none;cursor:pointer;color:var(--gold);text-transform:none;letter-spacing:0.04em;font-family:inherit;font-size:inherit;display:inline-flex;align-items:center;gap:7px;">${CR.avatarImg(CR.user.avatar, 24)}${CR.user.username} <span style="font-size:0.6rem;">▾</span></button>`;
    } else {
      bar.innerHTML = `<a class="header-link" onclick="CR.openAuth('login')" style="cursor:pointer;">Sign In</a>`;
    }
    // Mirror into the mobile menu's auth slot if present
    CR.renderMobileAuth('mobile-auth');
  };

  // Inline auth block for the mobile menu (flat items, no dropdown)
  CR.renderMobileAuth = function (elId) {
    const el = document.getElementById(elId);
    if (!el) return;
    if (CR.user) {
      el.innerHTML = `
        <div class="mobile-auth-header" style="display:flex;align-items:center;gap:10px;">
          ${CR.avatarImg(CR.user.avatar, 34)}
          <div>
            <div class="mobile-auth-name">${CR.user.username}</div>
            <div class="mobile-auth-email">${CR.user.email || ''}</div>
          </div>
        </div>
        <a href="profile.html?u=${encodeURIComponent(CR.user.username)}" class="header-link mobile-auth-editprofile">Edit Profile</a>
        <button class="header-link mobile-auth-signout" onclick="CR.logout()">Sign Out</button>`;
    } else {
      el.innerHTML = `<a class="header-link mobile-auth-signin" onclick="CR.openAuth('login')">Sign In / Create Account</a>`;
    }
  };

  // ── PROFILE MENU ──
  CR.toggleProfileMenu = function (e) {
    if (e) e.stopPropagation();
    let menu = document.getElementById('cr-profile-menu');
    if (menu && menu.classList.contains('open')) { CR.closeProfileMenu(); return; }
    if (!menu) {
      menu = document.createElement('div');
      menu.id = 'cr-profile-menu';
      menu.className = 'cr-profile-menu';
      const pmAvatar = CR.user && CR.user.avatar ? CR.avatarImg(CR.user.avatar, 34) : '';
      menu.innerHTML = `
        <div class="cr-pm-header" style="display:flex;align-items:center;gap:10px;">
          ${pmAvatar}
          <div style="min-width:0;">
            <div class="cr-pm-name">${CR.user ? CR.user.username : 'Account'}</div>
            <div class="cr-pm-email">${CR.user ? (CR.user.email || '') : ''}</div>
          </div>
        </div>
        <a href="profile.html?u=${encodeURIComponent(CR.user ? CR.user.username : '')}" class="cr-pm-item">Edit Profile</a>
        <a href="collection.html" class="cr-pm-item">My Vault</a>
        <a href="decks.html" class="cr-pm-item">My Workshop</a>
        <div class="cr-pm-divider"></div>
        <button class="cr-pm-item cr-pm-signout" onclick="CR.logout()">Sign Out</button>`;
      document.body.appendChild(menu);
    }
    // Position under the trigger
    const trigger = e ? e.currentTarget : document.querySelector('.profile-trigger');
    if (trigger) {
      const r = trigger.getBoundingClientRect();
      menu.style.top = (r.bottom + 6) + 'px';
      menu.style.right = Math.max(8, window.innerWidth - r.right) + 'px';
    }
    menu.classList.add('open');
    setTimeout(() => document.addEventListener('click', CR._profileMenuOutside), 0);
  };
  CR.closeProfileMenu = function () {
    const menu = document.getElementById('cr-profile-menu');
    if (menu) menu.classList.remove('open');
    document.removeEventListener('click', CR._profileMenuOutside);
  };
  CR._profileMenuOutside = function (e) {
    const menu = document.getElementById('cr-profile-menu');
    if (menu && !menu.contains(e.target) && !e.target.closest('.profile-trigger')) CR.closeProfileMenu();
  };

  // ── CLOUD: COLLECTION ──
  CR.fetchCloudCollection = async function () {
    if (!supa || !CR.user) return null;
    try {
      const { data, error } = await supa.from('collections').select('data').eq('user_id', CR.user.id).single();
      if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no row yet
      return data ? data.data : {};
    } catch (e) { console.warn('fetchCloudCollection', e); return null; }
  };
  CR.saveCloudCollection = async function (collectionObj) {
    if (!supa || !CR.user) return false;
    try {
      const { error } = await supa.from('collections')
        .upsert({ user_id: CR.user.id, data: collectionObj, updated_at: new Date().toISOString() });
      if (error) throw error;
      return true;
    } catch (e) { console.warn('saveCloudCollection', e); return false; }
  };

  // ── CLOUD: DECKS ──
  // Returns the user's decks, matching what My Workshop (decks.html) shows —
  // i.e. all of the user's own decks, NOT just ones flagged is_saved.
  CR.fetchCloudDecks = async function () {
    if (!supa || !CR.user) return [];
    try {
      const { data, error } = await supa.from('decks')
        .select('id, short_code, name, deck_data, is_public, updated_at')
        .eq('owner_id', CR.user.id)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (e) { console.warn('fetchCloudDecks', e); return []; }
  };

  // ── DECK SHORT CODES ──
  // Canonical short-code generator: 5 chars, no ambiguous l/0/1/o.
  CR.genShortCode = function () {
    const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
    let s = '';
    for (let i = 0; i < 5; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  };

  // Insert a row into `decks` with a freshly generated unique short_code, retrying
  // up to 5 times on a 23505 unique-violation (code already taken). `row` is the
  // deck row WITHOUT short_code. Returns the successful short_code. Throws on any
  // non-collision error, or after 5 collisions in a row.
  CR.insertDeck = async function (row) {
    if (!supa) throw new Error('No Supabase connection');
    let lastErr = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = CR.genShortCode();
      const { error } = await supa.from('decks').insert(Object.assign({}, row, { short_code: code }));
      if (!error) return code;
      lastErr = error;
      if (error.code !== '23505') throw error; // not a code collision — a real error
    }
    throw lastErr || new Error('Could not generate a unique deck code');
  };

  // ── TOAST (self-contained, fixed-position, brand-styled) ──
  CR.toast = function (text, opts) {
    opts = opts || {};
    if (!document.getElementById('cr-toast-styles')) {
      const st = document.createElement('style');
      st.id = 'cr-toast-styles';
      st.textContent = `
        .cr-toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%) translateY(12px); z-index: 600; display: flex; align-items: center; gap: 11px; max-width: min(420px, 92vw); background: var(--dusk, #1a1826); border: 1px solid var(--gold, #c8a96e); border-radius: 10px; box-shadow: 0 10px 34px rgba(0,0,0,0.55), 0 0 22px rgba(200,169,110,0.18); padding: 13px 18px; opacity: 0; pointer-events: none; transition: opacity 0.28s ease, transform 0.28s ease; cursor: pointer; }
        .cr-toast.show { opacity: 1; transform: translateX(-50%) translateY(0); pointer-events: auto; }
        .cr-toast img { width: 22px; height: 22px; flex-shrink: 0; }
        .cr-toast span { font-family: 'Crimson Pro', serif; font-size: 0.97rem; line-height: 1.4; color: var(--parchment, #e8e0cc); }
        @media (prefers-reduced-motion: reduce) { .cr-toast { transition: opacity 0.28s ease; transform: translateX(-50%); } .cr-toast.show { transform: translateX(-50%); } }
      `;
      document.head.appendChild(st);
    }
    let t = document.getElementById('cr-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'cr-toast';
      t.className = 'cr-toast';
      t.innerHTML = '<img src="moon-glow.png" alt=""><span></span>';
      t.addEventListener('click', CR._hideToast);
      document.body.appendChild(t);
    }
    t.querySelector('span').textContent = text;
    void t.offsetWidth; // reflow so the transition runs
    t.classList.add('show');
    clearTimeout(CR._toastTimer);
    CR._toastTimer = setTimeout(CR._hideToast, opts.duration || 5500);
  };
  CR._hideToast = function () {
    const t = document.getElementById('cr-toast');
    if (t) t.classList.remove('show');
  };

  window.CR = CR;

  // Inject profile menu styles once
  if (!document.getElementById('cr-profile-menu-styles')) {
    const st = document.createElement('style');
    st.id = 'cr-profile-menu-styles';
    st.textContent = `
      .cr-profile-menu { position: fixed; z-index: 500; min-width: 200px; background: var(--dusk, #1a1826); border: 1px solid var(--border-strong, rgba(155,135,212,0.35)); border-radius: 8px; box-shadow: 0 10px 34px rgba(0,0,0,0.55); padding: 6px; opacity: 0; transform: translateY(-6px); pointer-events: none; transition: opacity 0.14s, transform 0.14s; }
      .cr-profile-menu.open { opacity: 1; transform: translateY(0); pointer-events: auto; }
      .cr-pm-header { padding: 8px 12px 10px; border-bottom: 1px solid var(--border, rgba(155,135,212,0.18)); margin-bottom: 5px; }
      .cr-pm-name { font-family: 'Cinzel', serif; color: var(--gold, #c8a96e); font-size: 0.95rem; font-weight: 700; }
      .cr-pm-email { font-size: 0.72rem; color: var(--mist, #3a3658); margin-top: 2px; word-break: break-all; }
      .cr-pm-item { display: block; width: 100%; text-align: left; background: none; border: none; cursor: pointer; font-family: 'Crimson Pro', serif; font-size: 0.95rem; color: var(--parchment, #e8e0cc); padding: 9px 12px; border-radius: 5px; text-decoration: none; transition: background 0.12s, color 0.12s; }
      .cr-pm-item:hover { background: rgba(155,135,212,0.12); color: var(--shimmer, #c9bfee); }
      .cr-pm-divider { height: 1px; background: var(--border, rgba(155,135,212,0.18)); margin: 5px 8px; }
      .cr-pm-signout { color: var(--ember, #c4614a); }
      .cr-pm-signout:hover { background: rgba(196,97,74,0.12); color: var(--ember, #c4614a); }
    `;
    document.head.appendChild(st);
  }
})();
