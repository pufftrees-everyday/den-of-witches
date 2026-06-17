// ─────────────────────────────────────────────────────────────
// Cursed Realm — shared auth + cloud sync module
// Loaded on collection, deckbuilder, and gallery pages.
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
    user: null,           // { id, email, username } when logged in
    authMode: 'login',
    onAuthChange: null,   // page sets this callback; fires after login/logout/refresh
  };

  // ── SESSION ──
  CR.refreshUser = async function () {
    if (!supa) { CR.user = null; return null; }
    const { data } = await supa.auth.getUser();
    if (data && data.user) {
      let username = null;
      try {
        const { data: prof } = await supa.from('profiles').select('username').eq('id', data.user.id).single();
        if (prof && prof.username) username = prof.username;
      } catch (e) {}
      // Fall back to the display_name from signup metadata, never the email
      if (!username) username = (data.user.user_metadata && data.user.user_metadata.display_name) || 'Account';
      CR.user = { id: data.user.id, email: data.user.email, username };
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
          options: { data: { display_name: displayName }, emailRedirectTo: window.location.origin + '/gallery.html' }
        });
        if (error) throw error;
        CR._showMsg('Account created! Check your email to confirm, then sign in.', 'success');
        setTimeout(() => CR.setAuthMode('login'), 400);
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
      bar.innerHTML = `<span class="header-link" style="color:var(--gold);text-transform:none;letter-spacing:0.04em;">${CR.user.username}</span>
        <a class="header-link" onclick="CR.logout()" style="cursor:pointer;">Sign Out</a>`;
    } else {
      bar.innerHTML = `<a class="header-link" onclick="CR.openAuth('login')" style="cursor:pointer;">Sign In</a>`;
    }
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
  CR.fetchCloudDecks = async function () {
    if (!supa || !CR.user) return [];
    try {
      const { data, error } = await supa.from('decks')
        .select('id, short_code, name, deck_data, is_public, updated_at')
        .eq('owner_id', CR.user.id).eq('is_saved', true)
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (e) { console.warn('fetchCloudDecks', e); return []; }
  };

  window.CR = CR;
})();
