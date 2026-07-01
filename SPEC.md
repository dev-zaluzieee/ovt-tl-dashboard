# OVT Team-Leader Dashboard — Spec (v1 draft)

> Status: **draft for review**. Sibling of `ceniky-2`. Shares the `ceniky-2` Express backend.
> Date: 2026-06-26.

## 1. Purpose & users

A reporting/oversight portal for **team leaders (TL)** who oversee field sales reps (**OVT**).
Read-mostly in v1; will grow to support actions/workflows later.

- **Users:** `team_leader` and `admin` roles. ~2–10 people total.
- **Access model:** all logged-in users can see everything. The "team" filter is a
  *convenience filter*, not a security boundary.

## 2. Architecture

- **Frontend:** new Next.js 15 (App Router) + Tailwind app at `~/source/zaluzieee/ovt-tl-dashboard`,
  mirroring the `ceniky-2/frontend` staff-portal pattern (cookie `auth_token`, middleware-protected
  routes, Supabase JWT, `/app/api/*` proxy routes to the backend).
- **Backend:** **shared with `ceniky-2`** (`ceniky-2/backend`). We add a new route group
  (`/api/tl/*`) and reuse existing services/queries. No second backend.
- **New role:** add `team_leader` to `backend/src/utils/roles.ts` `STAFF_ROLES` and a guard so
  `/api/tl/*` admits `admin` + `team_leader`. (Existing office routes stay `admin`+`office`.)
- **Databases (all already wired in ceniky-2 backend):**
  - `CENIKY_DATABASE_URL` — shared with ceníky-3; holds `orders`, `forms`, `nezastizen_logs`,
    office ops tables. **This is where the queue data lives.**
  - Supabase — auth/users.
- **Branding/UX:** overall layout follows the ceníky-2 staff portal (brand green `#1E8449`).
  Order-detail **product rows** replicate ceníky-3's design (dark `zinc-800` row styling).
  Global loading uses the `LoadingScreen` (logo + animated progress bar) ported from
  `ceniky-admin-2/validation-products`.

## 3. Features

### (a) Settings — personal OVT favorites filter
- **Per-user private favorites** (confirmed): each portal user keeps their own set of OVTs.
  Not shared, not visible to others. Used as a page-level filter across the dashboard.
- **OVT source:** the "paired people" list already returned by the office-day service
  (`PairedPersonSummary`, keyed by Raynet person id).
- **New table** `tl_ovt_favorites (user_email text, raynet_person_id int, created_at)` —
  PK `(user_email, raynet_person_id)`. Stored in `CENIKY_DATABASE_URL` (same place as other ops tables).
- **New endpoints:** `GET/PUT /api/tl/favorites` (list / replace current user's set).
- Filter UI = a multi-select reusing `PersonFilterCombobox` semantics, defaulting to favorites.

### (b) Calendar + list-by-day view
- **Direct port** of ceníky-2 `prehled-dne`:
  `OfficeDayClient.tsx` + `OfficeDayCalendarGrid.tsx` + `PersonFilterCombobox.tsx`.
- **Reuses** backend `GET /api/admin/raynet/office-day-events?date=&person=` (or a thin `/api/tl/...`
  alias for role-gating). URL state `?date=&person=&view=calendar|list`.
- Adds the favorites filter from (a) on top of the person filter.

### (c) Raynet / ERP deep-links
- Reuse `frontend/lib/raynetUrls.ts` (`raynetEventDeepLink`, `raynetBusinessCaseDeepLink`,
  `raynetCompanyDeepLink`) and `frontend/lib/erpUrls.ts` (`erpOrderDeepLink`). Copy as-is.

### (d) Order detail view
- Data from existing `GET /api/admin/office-orders/:id` (order + linked forms + ADMF export state).
- **UI:** layout/order info from ceníky-2's `OrderDetailClient`. Product rows follow the ceníky-3
  **row layout/structure** (`AdmfFormClient.tsx`: produkt / ks / price-affecting fields / cena /
  sleva / cena po slevě bez+s DPH, with the surcharge-breakdown panel) **re-skinned to the light
  theme** (not ceníky-3's dark `zinc-800`).
- **Pricing history:** include the ADMF `PricingTrace*` panel from
  `frontend-admin/.../FormDetail.tsx` (timeline of automated calc + manual edits), served by
  `GET /api/admin/raynet-export-monitoring/forms/:id` (`form_json.productRows[].pricingTrace`).

### (e) Queue of unsolved orders  ← the important part
**Definition:** orders from the **last 14 days, with a 2-day grace** that are *not completed* in
ceníky-3. "Not completed" = exactly the two kinds below.

- **Date window (confirmed):** `[today − 16, today − 2]` (a 14-day-wide window shifted back 2 days;
  nothing appears for its first 2 days).
- **Reference date per row:** e.2 uses the Raynet event `scheduledFrom`. e.1 uses the **order date,
  with the Raynet event date as fallback** (my reading of "raynet as fallback, otherwise order" —
  confirm if you meant it the other way).
- **e.1 — marked "Nezastižen / přeložit":** order exists locally and has an **active**
  `nezastizen_logs` entry (active = no newer ADMF form created after the nezastižen action, per
  ceníky-3's existing `getNezastizenStatusForOrder`). Needs a **bulk** variant for the window.
- **e.2 — order never created in ceníky-3 (Raynet-only):** a Raynet event in the window
  (categories **`[220, 221, 222, 223, 336]`** — the exact set the ceníky-3 calendar uses,
  `ceniky-3 backend/src/queries/raynet.queries.ts:54` — excluding `CANCELLED`) whose `raynetEventId`
  has **no** matching `orders.source_raynet_event_id`. This is the existing `salesQueue`
  `order === null` case; we invert it into a dedicated query.
  - **Exclusions (hide):** Raynet-only events already tagged as lost/handled
    (`nedopadlo` / `ZKONTROLOVÁNO`, case-insensitive) are filtered out — they're resolved, not unsolved.
- **New endpoint:** `GET /api/tl/unsolved-queue?from=&to=&person=` returning a unified list with a
  `kind: 'nezastizen' | 'raynet_only'` discriminator, customer/owner, dates, Raynet/ERP links, and
  (for e.1) order id + pricing/export status.
- Rows deep-link to (d) when an order exists, else to Raynet (e.2).

## 4. New backend surface (summary)
- `roles.ts`: add `team_leader`; new `authenticateTeamLeader`-style guard for `/api/tl/*`.
- `routes/tl/*`: `favorites`, `unsolved-queue`, plus thin aliases to office-day/order-detail if we
  prefer not to widen the existing admin guards.
- `query/`: `tlFavorites.query.ts`; an inverse "Raynet events without orders" query; a bulk
  nezastižen-status query.
- SQL: `tl_ovt_favorites` table.

## 5. Reuse map (copy/import)
| Need | Source |
|---|---|
| Calendar + day list | `frontend/app/components/office-day/{OfficeDayClient,OfficeDayCalendarGrid,PersonFilterCombobox}.tsx` |
| Deep links | `frontend/lib/{raynetUrls,erpUrls}.ts` |
| Order detail data + UI | `frontend/app/components/orders/OrderDetailClient.tsx` |
| Product-row design | `ceniky-3/.../forms/admf/AdmfFormClient.tsx` (rows ~2216–2353) |
| Pricing history UI | `frontend-admin/app/raynet-exports/components/FormDetail.tsx` (`PricingTrace*`) |
| Loading screen | `ceniky-admin-2/validation-products/components/LoadingScreen.tsx` + `public/logo.svg` |

## 6. Resolved decisions
1. **e.2 categories:** `[220, 221, 222, 223, 336]` — mirror the ceníky-3 calendar set, exclude `CANCELLED`. ✅
2. **e.2 exclusions:** hide events already tagged `nedopadlo` / `ZKONTROLOVÁNO`. ✅
3. **e.1 reference date:** order date primary, Raynet event date fallback *(reading to confirm)*. ✅
4. **Favorites table:** `CENIKY_DATABASE_URL`. ✅
5. **Theme:** light throughout — port ceníky-3 row *structure*, re-skin to light. ✅

### Remaining nuance to flag
- Categories 221/222/223/336 (Montáž/Servis/Reklamace/…) don't always *need* an order, so e.2 may
  surface some events that are legitimately order-less. We mirror the ceníky-3 set per your call;
  we can add per-category tuning later if it's noisy.

## 7. Out of scope (v1)
- Write-back actions on the queue (reassign, resolve, comment) — planned for later.
- Per-rep performance analytics/metrics.
- Shared/named teams (we chose per-user favorites for v1).
