# Plan — Per-language subdomains (single codebase + single DB)

**Status**: ✅ IMPLEMENTED (2026-10-07) — `lib/siteConfig.ts` + `fetchLanguages` filter + clamping in
`_layout`/`user`/`useLanguage` + `bn.json` registered in both i18n systems. Verified with
`typecheck` + `lint` (0 errors), `expo export --platform web` and unit tests on the core logic
(apex/mobile hostname, `EXPO_PUBLIC_SITE` override). Remaining: deploy/domains to configure on Vercel.
**Date**: 2026-10-07
**Type**: design choice (business/marketing) — no DB migration

---

## 1. Goal

Create a per-language site via subdomain (e.g. `bn.quizpatenteitaliana.it`) **without** duplicating the
codebase, branches or database:

- **One branch**, one Vercel deploy, one Supabase.
- The subdomain sets the **language rules** in the `LanguagePicker`:
  **primary = `it` by default (locked in the dropdown, swappable via a button) + secondary =
  subdomain language by default, but optional** (the secondary can still be cleared to null and
  the choice persists).
- Accounts, progress and premium shared across all subdomains (same Supabase Auth).

### Alternative evaluated and rejected

Multi-DB/branch per language: Supabase Free = max 2 free projects (already taken by DEV+PROD) →
the 3rd DB would require Pro ($25/month + ~$10/month compute per project); migrations/edge
functions/backups/pipelines ×N; user accounts fragmented per language; every fix cherry-picked N times.
The schema is **already** multi-lingual per-row (`question_translations`, `category_translations`,
`manual_chunks.language`): duplicating the DB adds nothing.

## 2. Architectural decisions

| # | Decision | Reason |
|---|---|---|
| D1 | **Single codebase + single DB**, client-side filter by hostname | ~1-2 days of work vs weeks ×N; zero migrations |
| D2 | **primary ∈ site pair** (default `it`, swap button toggles with the secondary), secondary optional (site language as default/fallback) | Business choice: italian is the site language, the secondary is the subdomain "audience" — but stays optional: `null` is preserved, even on a dedicated site; the swap button lets the user use their mother tongue as the UI language where the primary dropdown is locked |
| D3 | **Runtime detection** (no per-language prerender) | Goal = branding/URL, not per-language SEO; a single static build serves all subdomains. If SEO is needed later: build matrix with `EXPO_PUBLIC_SITE` from the same branch (already anticipated by the env override) |
| D4 | **Shared accounts**, cross-site profile clamp **without DB write** | A profile with `lang_primary='es'` (set on the apex) visiting `bn.` shows it/bn for the session; the next explicit change from the picker saves normally |
| D5 | **Upstream filter in `fetchLanguages()`** | Through `store/languages.ts` (shared store) the filter automatically propagates to `LanguagePicker` and the default fallbacks — zero changes to the component |
| D6 | **Host→site mapping in code** (`lib/siteConfig.ts`), not in the DB | Few subdomains (`bn` and `es` registered at launch); a new site = 1 line + release. Future alternative: `languages.subdomain` column |
| D7 | **Apex `quizpatenteitaliana.it` = open case**, intended future: landing page + redirect to subdomains | No hostname match → `null` → full list (current behavior). Future decision is independent and non-blocking |

## 3. Code changes

### 3.1 `lib/siteConfig.ts` (new)

```ts
export type SiteConfig = {
  site: string;              // 'bn' | 'es' | ...
  languages: string[];       // ['it', 'bn'] | ['it', 'es']
  defaultPrimary: string;    // 'it' — always italian
  defaultSecondary: string;  // site default/fallback: 'bn' on bn.quizpatenteitaliana.it, 'es' on es.quizpatenteitaliana.it
  meta: { title: string; description: string };
};

export function getSiteConfig(): SiteConfig | null
export function clampSiteLanguages(primary?, secondary?): { primary, secondary }
```

Registered sites at launch: **`bn`** and **`es`** (both `SITES` + `SITE_BASES` in
`lib/siteConfig.ts`; `bn.json` and `es.json` both present in `i18n/locales`).

- Reads `window.location.hostname` **only** behind the guard
  `Platform.OS === 'web' && typeof window !== 'undefined'` → native/mobile unchanged (`null`).
- Priority: `process.env.EXPO_PUBLIC_SITE` (local tests + future per-language builds) → hostname.
- No match (`quizpatenteitaliana.it`, localhost, mobile) → `null` → full language list.

### 3.2 `queries/languages.ts` — upstream filter

In `fetchLanguages()`: if `getSiteConfig()` ≠ null, filter `data` by `site.languages`.
Cascading effect (via `store/languages.ts`):

- `LanguagePicker` in `app/(tabs)/user.tsx` → shows only it + site secondary;
  `excludeLanguage`/`allowNone` keep working. **No changes to `LanguagePicker.tsx`**.
- Default fallbacks in `app/_layout.tsx` and `app/(tabs)/user.tsx`.

### 3.3 `app/_layout.tsx`

- **Profile/languages effect**:
  - dedicated site → `clampSiteLanguages()`: primary kept within the site pair (default `it`);
    secondary stays **optional** (`null` preserved) — only an out-of-site value falls back to the
    site language; **no DB write** (D4);
  - no site → previous behavior unchanged (fallback on `languages.find(l => l.is_default)`,
    global default is **`es`**, seed `supabase/migrations/20260301000000_initial_schema.sql:645`).
- **Meta effect**: `document.title` and description from `siteConfig.meta`; runtime injection of
  self-referencing `<link rel="canonical">` and `hreflang` alternates (zero cost).

### 3.4 `app/(tabs)/user.tsx`

Same default/clamping logic for the profile screen: the local picker state syncs from the profile
(profile = source of truth, including a cleared/`null` secondary) so cross-site profiles show the
site's effective values and an explicit clear persists. On a dedicated site the primary picker is
locked to the current value (it excludes the other member of the site pair).

**Swap button** (`swap-horizontal` icon + `user.language.swap` label, rendered between the two
pickers only when a secondary is set): inverts primary ↔ secondary so the user can use their
mother tongue as the UI language even where the primary dropdown is locked. It changes the UI
language (`i18n.changeLanguage`) and persists **both** fields in a single DB update via
`updateUserLanguages(primary, secondary)` (`queries/user.ts`).

### 3.5 `hooks/useLanguage.ts`

`secondaryLanguage` is clamped through `clampSiteLanguages()` so quiz/exam/chat use the site's
effective secondary (site language for out-of-site values, `null` when the user cleared it).

### 3.6 Bengali content (prerequisite)

`bn` is active in the DB but **`i18n/locales/bn.json` was missing**:

1. translate the ~196 keys of `it.json` → `bn.json`;
2. register `bn` in **both** coexisting translation systems:
   `i18n/index.ts` (i18next) **and** `hooks/useTranslation.ts` (custom).

Until then, the UI on `bn.` falls back to `it` (i18next) / missing keys (custom hook).

## 4. Vercel deploy (console config, not code)

- **One project, one static deploy** (`expo export --platform web`, already working).
- Domains: `quizpatenteitaliana.it` (apex, A record) + `bn.quizpatenteitaliana.it` (CNAME) + `es.quizpatenteitaliana.it` (CNAME).
  **Hobby plan: 50 domains per project, subdomains free**. Wildcard alternative
  `*.quizpatenteitaliana.it` (requires Vercel nameservers or `_acme-challenge` delegation).
  Domain purchased 2026-10-08 (Register.it); `easy-patente.vercel.app` remains as the fallback
  hostname — no site match there → full language list.
- No `vercel.json` needed.
- ⚠️ **Business caveat**: Hobby = *non-commercial use only*. With Stripe planned
  (`doc/plans/STRIPE_MONETIZATION.md`), Pro (~$20/month) will be required at monetization time,
  not now.

## 5. Verification

1. `npm run typecheck` + `npm run lint`
2. `npm run web:export:prod` + `npx serve dist`
3. Subdomain test: `/etc/hosts` → `127.0.0.1 bn.quizpatenteitaliana.it`, or
   `EXPO_PUBLIC_SITE=bn` in env
4. Cases:
   - unknown/apex hostname → full list (unchanged)
   - `bn.` → only it+bn in the picker, default primary `it`, secondary clearable to `-` (optional, persists as `null`)
   - `es.` → only it+es in the picker, default primary `it`, spanish meta
   - profile with `lang_primary='es'` on `bn.` → it/bn UI, no DB write, picker change saves normally
   - profile with `lang_secondary=null` on `bn.` → secondary stays `-` (no auto-reselect)
   - swap button with secondary set → primary ↔ secondary inverted, UI language switches, both fields saved in DB; hidden when secondary is empty
   - mobile (`npm run android:dev`) → unchanged
5. RLS: **no migration** — the `profiles` check only validates `is_active`
   (`initial_schema.sql:590`), already satisfied by it and bn

## 6. Balance

| Item | Value |
|---|---|
| Modified files | 5 (`queries/languages.ts`, `app/_layout.tsx`, `app/(tabs)/user.tsx`, `hooks/useLanguage.ts`, `i18n/index.ts` + `hooks/useTranslation.ts`) |
| New files | 2 (`lib/siteConfig.ts`, `i18n/locales/bn.json`) |
| DB migrations | **0** |
| Branches | **1** |
| Estimated effort | ~1-2 days (excluding bn translation, 196 keys) |

## 7. Out of scope / future

- **Apex as landing page** (intended direction): host a landing on `quizpatenteitaliana.it` and
  redirect visitors to the language subdomains. When this happens:
  - `SITE_BASES.it` likely moves to `it.quizpatenteitaliana.it` (or stays on the apex) — one-line
    change in `lib/siteConfig.ts` + hreflang re-check;
  - the redirect can be a separate Vercel project on the apex, a route in this app, or Edge
    Middleware — independent of the language logic (which keys off hostname either way);
  - until then the apex serves the full language list (current behavior, D7).
- Per-language SEO: if prerendered HTML/meta is needed, build matrix from the same branch
  with `EXPO_PUBLIC_SITE` (override already anticipated by D3/3.1).
- Mapping in the DB (`languages.subdomain`) if subdomains multiply.
- Vercel Pro plan when monetization is activated.
