# Spec: Denní triáž (Team Leader daily triage)

Status: návrh k odsouhlasení (2026-08-31). Author context: Karel + Claude.

## 1. Context / why

WhatsApp request (2 parts): (1) OVT může označit zakázku „nedopadlo" ještě před ADMF,
s rozlišením důvodu (nerealizovatelný vs ostatní) — **hotovo** (viz ceniky-3 nedopadlo
bez ADMF + `nedopadlo_logs`, důvod se nese v datech). (2) **Tato spec** — nová TL
workflow: v daném dni vidět seznam zakázek a umět je „roztřídit"/„ukončit" —
zejména neúspěšné (co neprošly tabletem, co jsou označené jako neúspěch). Team
leader triáž.

Dnes existuje **problematické zakázky** = *filtrovaný* problémový výřez (Rule A: chybí/
pozdní ADMF; Rule B: nedopadlo; eskalace), s TL-only „skrýt/potvrdit". Triáž je
*superset*: **celý den, každá zakázka dostane rozhodnutí**, s reálnými akcemi.

## 2. Decisions (locked)

- **Dispozice = close-focused:** `Nedopadlo (+důvod)`, `Poslat na retence`, `Ponechat/OK` (bez změny stavu, jen zkontrolováno). Ne celá office lane sada — zatím.
- **Rozsah = všechny zakázky dne**, vyřešené (success apod.) zobrazit ztlumeně/sbaleně jako „hotovo".
- **Sledování hotovosti dne = explicitní razítko „zkontrolováno TL"** per zakázka (i pro ponechané beze změny) → den lze dotáhnout na nula nezkontrolovaných. Oddělené od dispozice.
- **Nová view**, `problematické zakázky` zůstává beze změny.
- **Den = datum zaměření** (`orders.created_at`, jako `/vysledky` a outcome query). TL vybírá datum (default včera/dnes).
- **Team scoping = client-side TeamFilter** (fetch vše, filtruj v UI), stejně jako problematické. Bez server-side per-TL scopingu (TL = role `admin`).

## 3. Universe + per-order stav (reuse, neznovuvymýšlet)

Základ = `ceniky-2 query/ovtOrderOutcomes.query.ts::getOrderOutcomesByZamereniDate([from,to])`
— pro každou zakázku vytvořenou v okně vrací 4 nezávislé signály + pole zakázky.
Odvozená **dispozice** (mutually-exclusive, precedence jako v `ovtOutcomes.service.ts`):

| Signál (zdroj) | Zobrazená dispozice | Triáž? |
|---|---|---|
| `nucen_resit_tl` (confirmations / escalations) | Řeší TL / eskalováno | řešeno jinde |
| `to_retention` (`retention_logs` OVT_REQUEST) | Na retenci | hotovo |
| `neuzavreno` (ADMF `nedopadlo` **nebo** aktivní `nedopadlo_logs` MARK) | Nedopadlo (+důvod) | hotovo |
| `success` (ADMF `chci_objednat` + exportováno) | Prošlo | hotovo (ztlumit) |
| jinak | **Bez rozhodnutí** (vč. „neprošlo tabletem" = žádný ADMF) | **← primární cíl triáže** |

Enrichment (reuse z `problematicOrders.service.ts`): person resolution, order value,
B2B, ADMF export status (`none/not_exported/exported`), otevřené eskalace. **Vypustit**
z problematické: age≥2wd filtr a A2/A3 suppression — v triáži se z nich stávají jen
klasifikátory/štítky, ne filtry.

## 4. Reviewed / clearing model (nové)

Nová tabulka v **sdílené ceniky DB** (stejná jako `nedopadlo_logs`/`nezastizen_logs`):

```sql
CREATE TABLE tl_triage_reviews (
  id           serial PRIMARY KEY,
  order_id     integer NOT NULL,
  reviewed_by  text    NOT NULL,           -- TL email
  disposition  text    NOT NULL,           -- 'nedopadlo' | 'retence' | 'ponechat'
  reason       text,                        -- nedopadlo důvod (když disposition='nedopadlo')
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tl_triage_reviews_order_idx ON tl_triage_reviews(order_id, created_at DESC);
```

- „Zkontrolováno" = existuje `tl_triage_reviews` řádek pro order_id (nejnovější vyhrává).
- **Auto-hotovo bez razítka:** success / to_retention / nucen_resit_tl se počítají jako
  vyřízené i bez razítka (TL je nemusí proklikávat). Razítko je potřeba hlavně pro
  „Bez rozhodnutí" a „Nedopadlo bez důvodu-review".
- Progress dne = `zkontrolováno+auto-hotovo / celkem`.

## 5. Akce → zápisy (reuse existujících service)

| Akce | Sdílený zápis (reuse) | + Razítko |
|---|---|---|
| **Nedopadlo (+důvod)** | `OfficeOrderTriageService.transition({orderId, lane:'nedopadlo', reason})` → ERP `status='nedopadlo'` + `dopadlo_zamereni='ne'` + `proc_nedopadlo_zamereni=<slug>`, Raynet reason tag + ZKONTROLOVÁNO | `tl_triage_reviews(disposition='nedopadlo', reason)` |
| **Poslat na retence** | `createTlRetentionRequest(order_id, tl_user_id)` → `retention_logs` OVT_REQUEST (sdílená retenční fronta) | `tl_triage_reviews(disposition='retence')` |
| **Ponechat / OK** | *(žádný sdílený zápis)* | `tl_triage_reviews(disposition='ponechat', note?)` |

Poznámky:
- Tyto sdílené zápisy už dělají stávající TL batch handlery
  (`problematicOrderTlConfirmation.service.ts::confirmNedopadlo/confirmRetence`) — triáž
  je bude volat stejně, jen místo `problematic_order_tl_confirmations` (skrytí) zapíše
  `tl_triage_reviews` (razítko).
- **Reverzibilita:** „Zrušit razítko" smaže poslední `tl_triage_reviews` řádek. Pro
  nedopadlo lze navíc nabídnout „Znovu otevřít" = ceniky-3 reopen ekvivalent (restore
  stavu) — P2, ne nutné v prvním kole.

## 6. API surface (ceniky-2, `authenticateStaff`)

- `GET /api/admin/tl-triage?date=YYYY-MM-DD` (nebo `from`/`to`) → `{ date, rows[], counts }`.
  Řádek = universe + dispozice + enrichment + `review: {disposition, by, at, reason}|null`.
- `POST /api/admin/tl-triage/:orderId/disposition` `{ disposition, reason?, note? }`
  → provede sdílený zápis (dle dispozice) + upsert `tl_triage_reviews`. Vrátí nový stav řádku.
- `DELETE /api/admin/tl-triage/:orderId/review` → smaže razítko (undo).
- Next proxy routes na ovt-tl-dashboard: `app/api/tl-triage/...` (vzor `backendFetch`).

## 7. Frontend (ovt-tl-dashboard)

- Nová stránka `app/denni-triaz/page.tsx` + `DenniTriazClient.tsx` (vzor
  `ProblematicOrdersClient`). Odkaz v nav.
- Datepicker (default včera/dnes), `TeamFilter` (default tým TL), hledání, filtr dispozic.
- **Progress bar** „Zkontrolováno X / Y" + rychlý filtr „jen nevyřízené".
- Řádek: Zákazník (+B2B, #, datum) · OVT · Hodnota · Termín/kategorie · **Dispozice badge** ·
  **Akce**: `Nedopadlo ▾ (důvod)` `Na retenci` `Ponechat/OK` `Zrušit razítko` + deep-linky
  (Raynet/Karta/Hovory/Portál/ERP) jako v problematické.
- Vyřešené (success) sbalené/ztlumené; „Bez rozhodnutí" nahoře, zvýrazněné.

## 8. Non-goals (v1)

- Celá office lane sada (k dořešení OVT/látky, termíny čekáme, eskalace finance) — jen close-focused.
- Server-side per-TL scoping (zůstává client filter).
- Změna statistik úspěšnosti kvůli nerealizovatelnému — důvod se jen nese v datech (dnes už platí).
- Batch/hromadné akce přes víc zakázek — P2 (v1 per-řádek; lze doplnit vzorem existujícího wizardu).

## 9. Fáze

- **P0:** universe+dispozice endpoint, `tl_triage_reviews` tabulka, 3 akce (reuse transition/retence), nová view s progressem. Team filter + datepicker.
- **P1:** „Zrušit razítko" / reopen nedopadlo, hromadné akce (wizard vzor), lepší UX filtrů.
- **P2:** případné rozšíření na další lanes, server-side team scoping, sloučení s problematické.

## 10. Verifikace

- `tl_triage_reviews` migrace aplikována do sdílené ceniky DB.
- Den s mixem: success (ztlumeno, auto-hotovo), no-ADMF (Bez rozhodnutí → Nedopadlo přes akci → ERP `nedopadlo` + Raynet tag + razítko), retence (fronta + razítko), ponechat (jen razítko).
- Progress dojede na „vše zkontrolováno".
- Regrese: `problematické zakázky` beze změny; nedopadlo z triáže se objeví v problematické Rule B a v OVT scoreboard `neuzavreno` (union už hotový).
- Deploy pořadí: migrace → ceniky-2 → ovt-tl-dashboard.
