# Cursed Realm — Project Context & Handoff

> **Read this first.** This file brings any new Claude session (chat or Claude Code)
> up to speed on the whole project so you don't have to re-explain everything.
> Keep it in the repo root and update it as the project evolves.

---

## What this is
**Cursed Realm** — a fan site for the trading card game **Sorcery: Contested Realm**.
Live at **cursedrealm.org**. Owner: **Pufftrees** (handle: pufftreees).

Pure static HTML/CSS/JS front end + **Supabase** backend. No build step, no framework.

## Hosting & infrastructure
- **Site hosting:** GitHub Pages (repo serves at root). Deploys ~1–2 min after a push.
- **Domain:** bought/managed at **Squarespace**, DNS points straight to GitHub Pages.
  ⚠️ The domain does **NOT** run through Cloudflare. (This matters — see OG Worker below.)
- **Card images:** Cloudflare **R2** bucket, public URL base:
  `https://pub-5999238092ad418ca60e7a9ad641cf57.r2.dev/{slug}.png`
- **Backend:** Supabase
  - URL: `https://nuizkjkcephopnbcmtlz.supabase.co`
  - Anon/publishable key (safe, protected by RLS): `sb_publishable_9er9B3YGFuvNO8Y8W6yr2g_sR5tXvKH`
  - supabase-js via `cdn.jsdelivr.net/npm/@supabase/supabase-js@2`
- **OG preview Worker:** Cloudflare Worker at
  `https://cursed-realm-og.pufftreees.workers.dev` (Workers PAID plan — needed for the
  image render CPU). Project lives locally at `C:\Users\addec\cursed-realm-og\cursed-realm-og`.
  Deploy with `npx wrangler deploy`. ⚠️ Avast/AVG antivirus flags PowerShell
  (`IDP.HELU.PSE79`, a false positive) — pause shields for 10 min to run wrangler.

## Workflow (current)
Owner edits files, manually uploads to GitHub, Pages redeploys. Worker is deployed
separately via wrangler CLI. **Recommended upgrade: use Claude Code** so edits + git
push happen directly, no manual upload.

---

## Data model (Supabase tables)
- **decks**: id (uuid), short_code (unique), name, deck_data (jsonb), owner_id,
  is_public, is_saved, views, created_at
- **profiles**: id (→auth.users), username, bio, created_at
- **collections**: user_id (pk), data (jsonb)
- **deck_likes**: id, deck_id, user_id, created_at (unique deck_id+user_id)
- **deck_comments**: id, deck_id (→decks, cascade), user_id (→auth.users), parent_id
  (→deck_comments, nullable for one-level replies), body (1–2000 chars), created_at.
  RLS: read on public decks (anyone), insert own on public decks (logged-in), delete own
  OR as deck owner. Shown on deck.html under the deck; owner's posts badged "Author".
- **VIEW public_decks_with_likes**: public decks + like counts

**deck_data jsonb shape:** `{ n:name, a:[[cardName,qty]...avatar], t:[...atlas/sites],
s:[...spellbook], c:[...collection/sideboard], d:"Scroll" }`
- `d` = the deck's **Scroll** (free-text description / strategy notes; omitted when empty).
  Edited in deckbuilder.html (📜 Scroll button turns the left explorer into a textarea);
  shown on deck.html (Scroll tab swaps deck content on desktop, sits inline below on mobile).

## Card data (cards.json)
From `api.sorcerytcg.com/api/cards`, hosted on the site as `cards.json`.
Fields: name, guardian{type,rarity,cost,attack,defence,life,thresholds{air/earth/fire/water},
rulesText}, elements, subTypes, sets:[{name, variants:[{slug,finish,product}]}].

**Slug logic (Beta-preferred):** pick set where name matches Beta, else Alpha, else first;
then variant where `finish==='Standard' && product==='Booster'`. Example real slug:
`bet-apprentice_wizard-b-s` = `{set:bet/alp/pro}-{name_underscored}-{b=Booster}-{s=Standard/f=Foil}`.

---

## Pages (all in repo root)
- **index.html** — Card Explorer homepage. 2 card views: **grid** (thumbnails) and **list**
  (text rows), toggled by the "Change View" button. Stone filters (Type/Set/Rarity/Element +
  Element-Lock), advanced filters (subtypes/keyword/cost/power), sorting (Random/A–Z/Mana), and
  the **"Invoke"** advanced-search query language. No deck-building here (builder is on deckbuilder.html).
- **collection.html** — "My Vault." Foil/Standard toggle + prices (only page with prices via prices.json).
  Sections (in order): Card Search, **Vault** (owned), **Trades**, **Wants**.
  Data: `collection[cardId] = {have,want,trade,haveFoil,wantFoil,tradeFoil}` (cloud + localStorage `grimoire_collection`).
  Vault = `have`; Trades = `trade`. **Vault and Trades are mutually exclusive** per card: flagging
  Trade moves the card (and its qty) out of the Vault into Trades; un-flagging returns it. `want` is
  independent. "Total Collection Value" = Vault value + Trades value (both finishes).
- **archive.html** — "The Archive" public deck gallery. Loads from the **public_decks_with_likes**
  view (has `like_count`, `views`); author usernames are fetched separately from **profiles** by
  `owner_id` (the view has no `author` column). Sort: Newest / Most Viewed / Most Liked. Each card
  shows 👁 views, ♥ likes (rendered on the card), 💬 comments (counted client-side from
  deck_comments), and a 📜 icon when the deck's Scroll (deck_data.d) is non-empty.
- **decks.html** — "My Workshop" (user's own decks).
- **deckbuilder.html** — deck building interface. Spellbook **and** Collection have a **TYPE**
  toggle (top of the section) that groups cards by type into Minion/Magic/Artifact/Aura (+ an
  "Other" bucket); off = flat list. One shared preference across both sections and deck.html via
  localStorage `grimoire_spell_typegroup` (default off).
- **deck.html** — read-only deck view (?d=CODE). Stats panel, 4 views, like button, share.
  View counter (👁) next to the like button; increments once per browser session per deck
  via the `increment_deck_views` RPC — see gotcha below. Comments section under the deck
  (deck_comments table): logged-in users post + reply (one level); owner posts badged "Author".
- **avatar.html** — avatar detail (?a=Name). Uses real rulesText only (no copyrighted flavor).
- **profile.html** — user profile (?u=username). Bio, public decks, total likes.
- **tracker.html** — life tracker PWA (service worker tracker-sw.js, cache versioned).
- **rulebook.html** — searchable Sorcery rulebook. Loads **rulebook-content.json**
  (`{title,released,pageCount, toc:[{group,items:[titleStr]}], sections:[{id,title,page,text}],
  glossary:[{id,term,definition,page}], quickReference:[{id,term,definition,page}]}`). Features: live
  search (sections + glossary, highlights matches), clickable TOC sidebar (collapsible on mobile),
  page-number jump (3–37), per-section page badges, \n→paragraphs. The site's "Rulebook" nav link
  (More menu + mobile nav on all pages) points here now, not the old Drive PDF.
- **videos.html** — "Community Channels" page (hardcoded YouTube channels). Linked in nav.
- **gallery.html** — redirect stub to archive.html (preserves query/hash, `noindex`); not a real page.
- **set-inspector.html** — diagnostic, unlinked (can be deleted).
- **cr-auth.js** — shared auth module exposing `window.CR`. Loaded by **index.html**,
  **collection.html**, **rulebook.html**, and **about.html**. deckbuilder/deck/archive/decks/profile
  each inline their own Supabase client + auth (duplicated logic); avatar/tracker/videos use no auth.
  Bump `?v=N` (currently `?v=11`) in those four files when edited.

## Design system / palette
CSS vars: `--void:#0b0a0f --abyss:#111018 --dusk:#1a1826 --twilight:#252338
--mist:#3a3658 --rune:#6b5fa0 --arcane:#9b87d4 --shimmer:#c9bfee --parchment:#e8e0cc
--gold:#c8a96e --ember:#c4614a --sage:#5a8a6a`
Fonts: Cinzel, Cinzel Decorative, Crimson Pro.
Element colors: air #8cb4d2, earth #a08246, fire #c4614a, water #5a96b0.
Element images: `wind.png` (=Air), `earth.png`, `fire.png`, `water.png` (site root).
**Owner dislikes decorative diamond/star glyphs (✦ ⧫ ❖).** These have been stripped from the
live pages (filter checkboxes are now plain boxes, loaders use a CSS ring spinner, tracker panel
corners have no star) — don't reintroduce them.
Brand mark: glowing crescent **moon** (moon artwork). The header logo uses `icon-192.png`; the
favicon/apple-touch use `favicon-32.png` / `apple-touch-icon.png`. `moon-glow.png` is the source
moon art (used by the OG Worker); it isn't referenced directly in the page markup.

## Deck OG link previews (the Worker)
GitHub Pages can't do per-deck OG tags. Solution: a Cloudflare Worker renders a
per-deck preview image (avatar art + deck name + owner + element symbols + moon).
**Because the domain isn't on Cloudflare**, the Worker can't intercept cursedrealm.org.
So the deck **"Copy Link" button shares a Worker URL**:
`https://cursed-realm-og.pufftreees.workers.dev/d/CODE` — crawlers get the preview,
humans get redirected to `cursedrealm.org/deck.html?d=CODE`. Rest of site stays on
cursedrealm.org. Worker source: `cursed-realm-og-worker.js`. Uses `workers-og` (Satori).
Satori constraints: flexbox HTML/CSS only, NO inline <svg> (use CSS or real images),
NO blur/glow. Element symbols + moon are loaded as real PNGs from the site.

## Important external bits
- **Discord invite:** currently a 30-day temp link — needs a permanent replacement.
- **Publisher:** Erik's Curiosa Limited (NZ).

---

## Known constraints / gotchas
- Discord caches link previews; new/unshared deck codes show fresh, old ones cache.
- PWA (tracker) caches via service worker — bump `tracker-sw.js` CACHE version on icon/asset changes.
- Browsers cache favicons hard — hard-refresh (Ctrl+Shift+R) to see icon changes.
- supabase anon key is safe to expose (RLS protects data).
- **Deck view counts** need a SECURITY DEFINER RPC in Supabase so anonymous viewers can bump the
  counter (direct UPDATE on `decks` is blocked by RLS). Run once in the SQL editor:
  ```sql
  create or replace function public.increment_deck_views(deck_code text)
  returns void language sql security definer set search_path = public as $$
    update public.decks set views = coalesce(views,0)+1
    where short_code = deck_code and is_public = true;
  $$;
  grant execute on function public.increment_deck_views(text) to anon, authenticated;
  ```
  Without it, counts still display but won't increment.
- **Deck comments** need the `deck_comments` table + RLS (deck.html degrades gracefully without it).
  Run once in the SQL editor:
  ```sql
  create table if not exists public.deck_comments (
    id uuid primary key default gen_random_uuid(),
    deck_id uuid not null references public.decks(id) on delete cascade,
    user_id uuid not null references auth.users(id) on delete cascade,
    parent_id uuid references public.deck_comments(id) on delete cascade,
    body text not null check (char_length(body) between 1 and 2000),
    created_at timestamptz not null default now()
  );
  create index if not exists deck_comments_deck_idx on public.deck_comments(deck_id, created_at);
  alter table public.deck_comments enable row level security;
  drop policy if exists "read comments on public decks" on public.deck_comments;
  create policy "read comments on public decks" on public.deck_comments for select
    using (exists (select 1 from public.decks d where d.id = deck_id and d.is_public = true));
  drop policy if exists "insert own comment on public deck" on public.deck_comments;
  create policy "insert own comment on public deck" on public.deck_comments for insert
    with check (auth.uid() = user_id and exists (select 1 from public.decks d where d.id = deck_id and d.is_public = true));
  drop policy if exists "delete own comment or as deck owner" on public.deck_comments;
  create policy "delete own comment or as deck owner" on public.deck_comments for delete
    using (auth.uid() = user_id or exists (select 1 from public.decks d where d.id = deck_id and d.owner_id = auth.uid()));
  grant select on public.deck_comments to anon;
  grant select, insert, delete on public.deck_comments to authenticated;
  ```

## Open / future ideas
- Swap permanent Discord invite when available.
- Port "Invoke" feature to deckbuilder/vault.
- Trade matching between collections.
- Rulebook flipbook (pending permission).
- Real Sorcery set symbols.
- Cinzel font inside the OG image (needs .ttf uploaded to R2 + fonts option).
- Re-add edge caching to the OG Worker render once design is final.

---

## How to continue with a new Claude session
1. Start a new chat or open **Claude Code** in the repo.
2. Paste this file (or in Claude Code, it can just read it).
3. Say what you want to build next. Claude will have full context.
