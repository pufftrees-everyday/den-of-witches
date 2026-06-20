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
- **VIEW public_decks_with_likes**: public decks + like counts

**deck_data jsonb shape:** `{ n:name, a:[[cardName,qty]...avatar], t:[...atlas/sites],
s:[...spellbook], c:[...collection/sideboard] }`

## Card data (cards.json)
From `api.sorcerytcg.com/api/cards`, hosted on the site as `cards.json`.
Fields: name, guardian{type,rarity,cost,attack,defence,life,thresholds{air/earth/fire/water},
rulesText}, elements, subTypes, sets:[{name, variants:[{slug,finish,product}]}].

**Slug logic (Beta-preferred):** pick set where name matches Beta, else Alpha, else first;
then variant where `finish==='Standard' && product==='Booster'`. Example real slug:
`bet-apprentice_wizard-b-s` = `{set:bet/alp/pro}-{name_underscored}-{b=Booster}-{s=Standard/f=Foil}`.

---

## Pages (all in repo root)
- **index.html** — Card Explorer homepage. 4 views (Text/Details/Card/Large), threshold toggle.
- **collection.html** — "My Vault." Foil/Standard toggle + prices (only page with prices via prices.json).
- **archive.html** — "The Archive" public deck gallery.
- **decks.html** — "My Workshop" (user's own decks).
- **deckbuilder.html** — deck building interface.
- **deck.html** — read-only deck view (?d=CODE). Stats panel, 4 views, like button, share.
- **avatar.html** — avatar detail (?a=Name). Uses real rulesText only (no copyrighted flavor).
- **profile.html** — user profile (?u=username). Bio, public decks, total likes.
- **tracker.html** — life tracker PWA (service worker tracker-sw.js, cache versioned).
- **videos.html**, **gallery.html** — supporting pages.
- **set-inspector.html** — diagnostic, unlinked (can be deleted).
- **cr-auth.js** — shared auth (window.CR). Bump `?v=N` when edited.

## Design system / palette
CSS vars: `--void:#0b0a0f --abyss:#111018 --dusk:#1a1826 --twilight:#252338
--mist:#3a3658 --rune:#6b5fa0 --arcane:#9b87d4 --shimmer:#c9bfee --parchment:#e8e0cc
--gold:#c8a96e --ember:#c4614a --sage:#5a8a6a`
Fonts: Cinzel, Cinzel Decorative, Crimson Pro.
Element colors: air #8cb4d2, earth #a08246, fire #c4614a, water #5a96b0.
Element images: `wind.png` (=Air), `earth.png`, `fire.png`, `water.png` (site root).
**Owner dislikes decorative diamond/star glyphs (✦ ⧫ ❖).**
Brand mark: glowing crescent **moon** — `moon-glow.png` (+ icon-192/512/1024,
favicon-32, apple-touch-icon all use this moon).

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

## Open / future ideas
- Swap permanent Discord invite when available.
- Like counts on archive gallery cards (authors link done, counts not).
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
