# Nest: six-app control center

Implemented locally, not deployed. Canonical owner cockpit: https://bolo-india.app/nest.

## Experience
- Aggregate overview plus six individual app scopes. Sidebar scope persists across dashboard sections.
- Shared 7/30/90-day and custom UTC filters. Existing known tester/owner exclusions stay server-side.
- Account, activity, subscription, game, chat, purchase, gift and push metrics; all numeric source fields discoverable through search.
- Every metric opens its definition and app breakdown. Existing supported metrics load learner rows (200 maximum per app), plans, platform/build and full available record details. System counters expose source metadata; they do not invent per-learner records.
- Daily activity bars drill to that UTC day. Scope/date changes cannot reuse stale detail responses.
- Operations shows health, data availability, recent server errors, storage and critical dependency gaps. API health explicitly does not prove speech works.
- People & content exposes learner directory, journey map records, flagged content, wardrobe and live presence. Regional classic Nest pages remain accessible for existing inbox, reference and commands.
- Unavailable apps contribute no zero; every headline carries source coverage. Accounts are not unique humans across apps. Percentages and longest runs use maxima; unspecified metrics stay per-app. Regional currencies are never added together.

## Data connection and deployment
Each regional API has an explicit `nestRegion.ts` identity and a narrowly allowlisted GET-only relay. The hub uses fixed HTTPS domains, rejects redirects, times out in 12 seconds and never sends a learner cookie or Clerk token to another app.

Set a DIFFERENT randomly generated secret (at least 32 characters) as `NEST_RELAY_KEY` in each remote region's production server secrets. In the India production hub, set matching values:
- NEST_FLEET_SEA_KEY
- NEST_FLEET_EAST_KEY
- NEST_FLEET_AFRICA_KEY
- NEST_FLEET_EUROPE_KEY
- NEST_FLEET_LATAM_KEY

India reads its own database through the existing owner-authorized handlers. No India relay key is required for this topology. Only configure NEST_FLEET_INDIA_KEY in another hub if intentionally enabling federation from there, with a separate India relay key. Do not put any key in frontend env variables, HTML, URLs, screenshots, docs, or git. Relay headers are redacted by the logger. Deploy the five spokes first, configure India's keys, then deploy the hub and verify all six readings, a missing-key failure, and a real drill. No production keys have been generated/configured in this work.

Private routes are implemented without changing lib/api-spec/openapi.yaml or any learner API contract. No schema/production data changes. The relay excludes all writes, mailbox content, and pages. The existing mail-reply endpoint still requires the real owner's session.

## Alerts: unfinished integration retained explicitly
PagerDuty BOLO Nest service exists (PDNPFQ7), but background event ingestion, SMS/phone contact setup, an external uptime check, and recovery delivery have NOT been connected/verified. The UI says so. OpenAI prepaid balance has no verified supported feed here; the $20 threshold is NOT armed. Do not relabel any of these as healthy merely because keys are set. This dashboard is not a substitute for the independent monitoring worker.

## Verification
Six API typechecks; no suites during iteration per owner. Browser design preview uses clearly marked synthetic data outside all repositories; no demo data is shipped. Aggregated and individual views and learner drill-down manually inspected. Production federation remains to be verified after configuration/deployment. A database-free authorization guard test was added for the release suite but not run.

## Owner refinement, 2026-09-12
Added the existing Bolo mascot seated in a generated nest as the embedded logo; source/reference identity preserved. Restored subway-style journey map inline on Overview, grouped by app/language/journey/zone with occupied-line toggle and stop count details. Reads the existing map endpoint; lesson positions only, not new story/tracing occupancy. Added dedicated today/week range queries so sign-ups today, calendar week sign-ups (Monday UTC), active today and attempts today honor exclusions and drill to matching windows. Browser preview inspected, synthetic sample data remains outside repositories. No server TypeScript changes after prior six-app checks; no suites run.

## Account exclusion picker
Owner-requested searchable/paginated account picker added for each region. Selections persist in browser local storage, not production account records or a global settings table. Bounded excludeIds travels through the read-only relay and replaces the default reporting exclusion set. Empty explicit selection includes everybody; absence retains defaults; off toggle disables exclusions. Summary/live caches are keyed by selection to avoid stale totals. Accounts/auth owner allowlist unchanged. Private exclusion-accounts GET route is owner/relay protected, with bound SQL search and pagination; no public OpenAPI contract edit. Production rollout pending with the rest of Nest.

## Signed-out Nest access
Owner requested login instead of a 404 while signed out. Web Nest now waits for Clerk, redirects signed-out visitors to the existing sign-in route with a fixed same-origin /nest return path, then performs the owner gate. Query is disabled until signed in and cache key includes Clerk user ID. Signed-in non-owners retain not-found behavior; API authorization is unchanged. No email string is used as an access grant.
