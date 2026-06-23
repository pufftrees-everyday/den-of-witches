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
- **profiles**: id (→auth.users), username, bio, created_at, **avatar** (text — full image
  URL: an R2 card image, an uploaded-to-Storage URL, or a pasted link), **links** (jsonb —
  `{discord, twitter, youtube, twitch, website}`). See the profiles setup gotcha for the SQL.
- **collections**: user_id (pk), data (jsonb)
- **deck_likes**: id, deck_id, user_id, created_at (unique deck_id+user_id)
- **deck_comments**: id, deck_id (→decks, cascade), user_id (→auth.users), parent_id
  (→deck_comments, nullable for one-level replies), body (1–2000 chars), created_at.
  RLS: read on public decks (anyone), insert own on public decks (logged-in), delete own
  OR as deck owner. Shown on deck.html under the deck; owner's posts badged "Author".
- **VIEW public_decks_with_likes**: public decks + like counts
- **price_history**: captured_at (timestamptz), card_name, finish ('standard'|'foil'), market
  (numeric). One row per card/finish/capture; appended 4×/day by the price Action
  (`record-price-history.js`) for historical price/value charts. `captured_at` is stamped at run
  time (not prices.json's `generated`) so every run is a distinct point; the capture step runs
  `if: always()` so a push hiccup can't skip it, and inserts retry on transient errors. Public read; writes only via
  service role. See the price-history setup gotcha.

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

> **Change View (standardized site-wide):** every card list — index Explorer, collection Vault,
> deckbuilder (left explorer + right deck panel), deck.html — offers the same 4 views: **Text** (☰),
> **Detailed** (▤), **Card** (⊞), **Large** (⊡). **Text** is a clean compact row — mana cost · count ·
> name · threshold-pip symbols (element PNGs) — modeled on the deck viewer; it auto-flows into 3–4
> columns to fill width (Detailed stays 2). **Detailed** is the full columned row (set/rarity/type/
> price/flags). **Card/Large** are the image grid (Large = bigger cells). Implementation: each page has
> a dedicated `renderCardTextRow`/`renderDbCardTextRow`; the container gets `list-view` (Text+Detailed)
> + `text-view` (Text) + `large-view`. **Text-view quick −/+ steppers** exist where there's a quantity:
> the **Vault** (adjusts Have/Trade/Want for the active section, finish-aware; row also shows price) and
> the **deckbuilder explorer** (in-deck count via `quickAddToDeck` / `quickRemoveFromDeck`). The index
> Explorer is browse-only, so its Text view has **no** steppers. In the Vault's **Card Search**, the Text
> row adds a "Vault" label on the stepper plus a quick **♡ Want** toggle so cards go to either section
> from the text view; the **Card/Large** flag buttons (hover-revealed on desktop) are always shown on
> touch devices (`@media (hover: none)`), and flag/qty edits refresh the Detailed view in place too.

## Pages (all in repo root)
- **index.html** — Card Explorer homepage. 4 standardized card views (see Change View note above).
  Stone filters (Type/Set/Rarity/Element + Element-Lock), advanced filters (subtypes/keyword/cost/
  power), sorting (Random/A–Z/Mana), and the **"Invoke"** advanced-search query language (supports
  `a:`/`artist:` among the field filters). Clicking a card opens a modal with an "Illustrated by"
  artist link (→ artist.html). No deck-building here (builder is on deckbuilder.html).
- **collection.html** — "My Vault." Foil/Standard toggle + prices (only page with prices via prices.json).
  Sections (in order): Card Search, **Vault** (owned), **Trades**, **Wants**. 4 standardized card views;
  the **Text** view shows count + price and has quick −/+ steppers (see Change View note).
  Data: `collection[cardId] = {have,want,trade,haveFoil,wantFoil,tradeFoil}` (cloud + localStorage `grimoire_collection`).
  Vault = `have`; Trades = `trade`. **Vault and Trades are mutually exclusive** per card: flagging
  Trade moves the card (and its qty) out of the Vault into Trades; un-flagging returns it. `want` is
  independent. "Total Collection Value" = Vault value + Trades value (both finishes) + all binder values.
  **Export** is a dropdown (`doExport`) that exports the active section in 4 formats — Plain text
  (`2x Card`, foils suffixed `(Foil)`), With prices (branded "Exported from Cursed Realm" + TCGplayer/
  JustTCG scrape date + total value), Detailed (grouped by set & rarity), and CSV (spreadsheet
  columns). All include both standard and foil quantities; filenames are `cursed-realm-{section}-{date}`.
  **Binders:** the Vault and Trades tabs each have a "Create Binder" button — named, collapsible
  (collapsed by default), isolated card containers with std/foil quantities. Per-card add and bulk
  "add 1 of each / +1 foil each / Master Set / Foil Master Set" from a chosen set (Master Set = 1×
  Unique, 2× Elite, 3× Exceptional, 4× Ordinary), a rarity filter on the add-search, and per-binder
  value that rolls into the total. Stored under a reserved `__binders__` key inside the collection
  object (rides the same localStorage + cloud sync).
  **Import** (⬆ Import button by Export, `openCollectionImport`/`runCollectionImport`): upload a file
  or paste a list; matched cards land in a **new binder** (named from the filename or a typed name;
  Vault or Trade). Format-agnostic parser (`parseImportList`) reads Cursed Realm exports (plain text /
  CSV / detailed-grouped), curiosa.io decklists (`1Archimago`), and generic `2x Name` / `Name x2`
  lists; `(Foil)` suffix or a CSV Finish column = foil; section headers/metadata are skipped; names
  matched case/punctuation-insensitively against cards.json.
  **Owned Decks** — physical decks you own. Shown both under the Vault tab (below the Vault Binders
  section) and on a dedicated **Owned Decks** tab (`currentView==='decks'`, `sec-decks`). Each is a
  snapshot of a deck's cards (`a`+`t`+`s`) stored under a reserved `__owned_decks__` key (array of
  `{id,name,code,cards:{name:{std,foil}},added}`), parallel to binders; value rolls into Vault + Total
  Collection Value (`ownedDecksTotalValue`) and the value-over-time series. The section has an in-page
  **quick-add dropdown** of your Workshop decks (`ensureWorkshopDecks` via `CR.fetchCloudDecks`,
  `quickAddOwnedDeck`/`addOwnedDeckFromData`) plus per-deck add from the Workshop itself (decks.html).
  Rendered/removed by `renderOwnedDecks`/`removeOwnedDeck`, reusing binder card styling. The whole
  section is collapsible (`sectionCollapsed.ownedDecks`/`toggleOwnedDecksSection`), as is the Vault/
  Trade **Binders** section (`toggleBindersSection`). The Owned Decks *tab* hides the card browser via
  `body.in-decks-section`; the **Vault tab** is the default landing view and hides the card filters via
  `body.in-vault-tab`.
- **archive.html** — "The Archive" public deck gallery. Loads from the **public_decks_with_likes**
  view (has `like_count`, `views`); author usernames are fetched separately from **profiles** by
  `owner_id` (the view has no `author` column). Sort: Newest / Most Viewed / Most Liked. Each card
  shows 👁 views, ♥ likes (rendered on the card), 💬 comments (counted client-side from
  deck_comments), and a 📜 icon when the deck's Scroll (deck_data.d) is non-empty.
- **decks.html** — "My Workshop" (user's own decks). Each deck card has an "Add to Collection" (📥)
  button (`addDeckToCollection`) that snapshots the deck's cards into the user's collection under
  `__owned_decks__` (Owned Decks) — fetches the `collections` row directly via its own `supa`
  client, upserts, and mirrors to localStorage; re-adding the same deck (matched by `code`) refreshes it.
- **deckbuilder.html** — deck building interface. Two "Change View" toggles (left explorer + right
  deck panel), both with the standard 4 views; the explorer **Text** view has in-deck −/+ steppers
  (see Change View note). Spellbook **and** Collection have a **TYPE** toggle (top of the section)
  that groups cards by type into Minion/Magic/Artifact/Aura (+ an "Other" bucket); off = flat list.
  One shared preference across both sections and deck.html via localStorage `grimoire_spell_typegroup`
  (default off). The deck panel header also has a **Sort** toggle (A–Z / Mana) beside the Threshold
  toggle — `deckSortMode` via localStorage `grimoire_deck_sort` (default 'cost'), applied by
  `deckCardSort` in both grouped and flat sections. Collapsed TYPE sub-groups use `display:none
  !important` so they stay hidden in every deck view (list/details/large), not just Card view.
- **deck.html** — read-only deck view (?d=CODE). Stats panel, the standard 4 views, like button, share.
  **Threshold** toggle, a **Sort** toggle (A–Z / Mana, shares `grimoire_deck_sort` with deckbuilder),
  and a **Price** toggle — Price shows per-card line prices across
  the views + a "Deck Value" total (avatar+atlas+spellbook; loads prices.json, hidden if unavailable).
  Spellbook/Collection honor the shared **TYPE** grouping toggle, and those TYPE sub-groups are
  collapsible (caret per group; `collapsedTypeGroups`/`toggleTypeGroup`). Mirrors the deckbuilder
  deck-panel features so shared decks look the same.
  View counter (👁) next to the like button; increments once per browser session per deck
  via the `increment_deck_views` RPC — see gotcha below. Comments section under the deck
  (deck_comments table): logged-in users post + reply (one level); owner posts badged "Author".
  A **🎲 Test Deck** action links to testdeck.html?d=CODE.
- **testdeck.html** — playtest tabletop (?d=CODE), `noindex`. **WIP.** Loads the deck (own inline
  Supabase client; session restored from localStorage so owners can test private decks) + cards.json
  slug map. The **Playmat.jpg** mat is JS-sized (`fitPlaymat`) to show in full; cards are absolutely
  positioned by % via the `POS` config — Avatar on **spot 18** (bottom-centre of the 4×5 grid), the
  Spellbook/Atlas/Collection **stacks** in the right margin under the SORCERY logo (`SpellbookBack.png`
  / `AtlasBack.png` landscape / `SpellbookBack.png`) with remaining-count badges. **Draw** 1 from a pile
  via its `+ Spellbook` / `+ Atlas` button or by clicking the stack → card goes to the **Hand** (the
  always-wide single-row bottom bar; horizontal-scrolls, never stacks). **Drag a hand card up out of the
  bar to discard** it (pointer events). **Mulligan** = select ≤3 hand cards then Replace (returns them
  to the pile + redraws same type); **Draw Fresh Hand** reshuffles and redraws 3+3. State: `full` (full
  lists), `remain` (drawable piles), `hand`. Assets in repo root: **Playmat.jpg, AtlasBack.png,
  SpellbookBack.png** (exact casing — Pages is case-sensitive). `POS` x/y/w %s are eyeball estimates,
  easy to nudge. Future: per-card zoom, life/mana counters, board play, full rules.
- **avatar.html** — avatar detail (?a=Name). Uses real rulesText only (no copyrighted flavor).
  Shows an "Illustrated by" line linking to artist.html.
- **artist.html** — artist gallery (?a=ArtistName). Lists every card illustrated by that artist in a
  grid; clicking a card opens a self-contained detail modal (image, stats, rules, price chart via
  price-chart.js, artist link). Artist data comes from `card.sets[].variants[].artist` in cards.json
  (collected as a distinct list per card, since reprints can differ). Linked from the artist line in
  every card popup (index modal, collection Vault modal, avatar.html).
- **artists.html** — artist index. Lists all ~52 artists (one sample card art beside each name +
  card count), with a live name search; each tile links to artist.html. Linked from the **"Artists"**
  item in the More menu + mobile nav on every page that has them.
- **profile.html** — user profile (?u=username). Avatar, bio, social links, public decks, total
  likes. On your **own** profile (reached via "Edit Profile" in the account dropdown) you can edit
  everything: set an avatar (pick a card's art / upload an image to Storage / paste a URL via a
  modal), edit Discord/X/YouTube/Twitch/Website links, and edit the bio. Custom avatars also show
  next to your name in the account dropdown and beside author names on archive.html, deck.html
  (hero + comments). Requires the profiles avatar/links columns + the `avatars` Storage bucket.
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
  Bump `?v=N` (currently `?v=13`) in those four files when edited.
- **price-chart.js** — shared price-history chart renderer exposing `window.CRPriceChart`
  (`load(cardName, elOrId)` + `renderSVG(rows)`). Dependency-free inline-SVG line chart (standard +
  foil) read from the public `price_history` table via the Supabase REST API; shows a "Source:
  TCGplayer Market · via JustTCG" attribution under the graph. Loaded by **index.html** (card modal),
  **collection.html** (Vault card modal), and **avatar.html**. The `.pc-*` styles live in each page's
  own stylesheet. Bump `?v=N` (currently `?v=1`) in those three files when edited.

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
- **Card image resolution (sharpness policy):** R2 card PNGs come in two native sizes —
  **380×531** for Alpha/Beta/Promo/**Dragonlord** and **744×1039** for Gothic/Arthurian (the
  official API gives only the slug, no higher-res URL). To avoid blurry upscaling, **never render a
  card wider than ~380 CSS px**: the "Large" card-grid views are capped at `minmax(…, 380px)` +
  `justify-content:center` (index/collection/deckbuilder/deck), and single/hero images use
  `width:auto; max-width:…` so low-res cards show at native and hi-res downscale. Default grids,
  the deck-view hero (220px col), avatar.html art (360px col) and the deck tester (small renders)
  are already ≤380. The only true fix for *larger* sharp display of the low-res sets is re-uploading
  higher-res scans under the same slugs. (Retina note: 380px art is still DPR-upscaled on 2× screens —
  unavoidable without better sources.)
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
- **Profile avatars + links** need two columns on `profiles` and a public Storage bucket
  (profile.html degrades gracefully without them: editing just shows "could not save"). Run once
  in the SQL editor:
  ```sql
  alter table public.profiles add column if not exists avatar text;
  alter table public.profiles add column if not exists links jsonb not null default '{}'::jsonb;
  -- profiles already allow self-update via RLS; if not, ensure a policy like:
  -- create policy "update own profile" on public.profiles for update using (auth.uid() = id);
  ```
  Then create the avatar uploads bucket + policies (the "Choose a card" and "Image URL" avatar
  options work without this; only **Upload** needs it):
  ```sql
  insert into storage.buckets (id, name, public) values ('avatars','avatars', true)
    on conflict (id) do update set public = true;
  -- public read
  drop policy if exists "avatars public read" on storage.objects;
  create policy "avatars public read" on storage.objects for select using (bucket_id = 'avatars');
  -- users manage only their own folder: avatars/<auth.uid()>/...
  drop policy if exists "avatars owner write" on storage.objects;
  create policy "avatars owner write" on storage.objects for insert to authenticated
    with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
  drop policy if exists "avatars owner update" on storage.objects;
  create policy "avatars owner update" on storage.objects for update to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
  drop policy if exists "avatars owner delete" on storage.objects;
  create policy "avatars owner delete" on storage.objects for delete to authenticated
    using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
  ```

- **Price history capture** needs a `price_history` table + a Supabase **service-role** key stored
  as the GitHub Actions secret `SUPABASE_SERVICE_ROLE`. The Action's "Record price history" step
  (`record-price-history.js`) no-ops quietly until both exist, so price updates keep working. Run
  once in the SQL editor:
  ```sql
  create table if not exists public.price_history (
    captured_at timestamptz not null,
    card_name   text        not null,
    finish      text        not null check (finish in ('standard','foil')),
    market      numeric      not null,
    primary key (card_name, finish, captured_at)
  );
  create index if not exists price_history_time_idx on public.price_history (captured_at);
  alter table public.price_history enable row level security;
  drop policy if exists "price history public read" on public.price_history;
  create policy "price history public read" on public.price_history for select using (true);
  grant select on public.price_history to anon, authenticated;
  ```
  Then add the secret: GitHub repo → Settings → Secrets and variables → Actions → New repository
  secret → name `SUPABASE_SERVICE_ROLE`, value = the project's **service_role** key (Supabase →
  Project Settings → API). Capture begins on the next scheduled run (or trigger it manually from
  the Actions tab). ~2,200 points/run × 4 runs/day (every 6h); backfill from git history of prices.json is
  possible later if desired.

## Open / future ideas
- ✅ **Daily price-history capture — DONE.** `record-price-history.js` appends a snapshot to the
  `price_history` table on every price Action run (4×/day, every 6h). See the price-history gotcha for setup.
- ✅ **Card price-over-time chart — DONE.** index.html card modal **and** avatar.html show a
  dependency-free inline-SVG line chart (standard + foil) from `price_history`
  (`loadPriceChart`/`renderPriceChartSVG`, fetched via the public REST API); graceful empty state
  until rows accumulate. Now consolidated into the shared **price-chart.js** (`CRPriceChart`).
- ✅ **Collection/binder value over time — DONE.** collection.html Vault tab has a collapsible
  "📈 Value Over Time" panel: a total line (Vault + Trades + binders, both finishes) plus an overlay
  of each binder as its own line. It values your **current** holdings at each historical `price_history`
  point (we don't snapshot holdings, so this is the feasible series), fetched lazily on expand via the
  REST API in chunked `card_name=in.()` queries (`vhOpen`/`vhRender`/`vhSeriesFrom`). ↻ Refresh
  re-fetches; graceful empty state until rows accumulate.
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
