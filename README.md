# Artimex restaurant portal

Production: https://r365-gb-order-seven.vercel.app/

Approved accounts are provisioned privately with temporary passwords and scoped restaurant access. See the VPS1 account setup below. The former Pacific-only pilot is retained only as a configuration-disabled fallback.

Flow: login → choose CSV → server-generated preview of up to 20 rows → explicit confirmation → SFTP upload to Artimex `/incoming` → manual or separately configured GB import. Preview does not write to FTP. A signed preview token binds the user, restaurant, filename and exact file bytes for 15 minutes. Sessions use a signed Secure HttpOnly SameSite cookie with an eight-hour lifetime. Changing files requires a new preview. UTF-8 CSV with a header and consistent columns is required; 2 MiB maximum. Original file bytes are preserved.

Required production secrets: ARTIMEX_SESSION_SECRET, ARTIMEX_SFTP_PASSWORD, ARTIMEX_SFTP_FINGERPRINT and PORTAL_STORE_TOKEN. See VPS1 database configuration below. No public registration or email workflow.

Shared server verified: VPS1 51.178.36.17 / mail.o7digitalgroup.com. FTP artimex-ftp at 5.39.3.225:21 and website SFTP share `/srv/artimex`; client `/incoming` corresponds to `/srv/artimex/incoming`. Older reports called this machine VPS2. VPS2 today is 92.222.23.247.

The site confirms receipt on Artimex, not import into GlobalBake. GB runs in a remote Windows environment; scheduling its importer and fetching files to that Windows environment are outside this repository. The Windows host must remain available; whether an interactive session is needed depends on GB. R365 API retrieval is not implemented.

`assets/restaurants.json` contains the restaurant directory. `npm ci`, `npm test`, `npm run build`, then `vercel --prod` against the existing linked project. Repeated confirmed submissions can create duplicate files; staff must verify orders before import.

## Languages

The portal defaults to US English and offers Spanish via the header selector. The choice persists in browser localStorage. API error/receipt messages follow the selected language. Restaurant names and original CSV cells are not translated.

## VPS1 database and accounts

Production accounts use temporary passwords, with a mandatory password change on first sign-in. Email verification and public email reset are removed. Accounts are approved in `lib/directory.mjs`; shared `egg-bellflower@gallogiro.com` has Bristol and Bellflower and both manager names are retained. The five super users have access to all locations and the dashboard. Fontana is included; Panorama remains in the original directory without a manager assignment.

Production configuration: `PORTAL_ACCOUNTS_ENABLED=true`, `PORTAL_STORE_URL=https://mail.o7digitalgroup.com/artimex-portal-store`, and secret `PORTAL_STORE_TOKEN`. Existing `ARTIMEX_SESSION_SECRET` and SFTP credentials remain required. No email service or external database provider is required.

Database: dedicated SQLite on VPS1 (`51.178.36.17`), `/srv/artimex-portal-db/portal.sqlite3`. `ops/store.py` provides a bearer-authenticated HTTPS storage bridge, with a Docker service named `artimex-portal-store` on the existing private Mailcow network; no database port is published. Nginx forwards only the dedicated `/artimex-portal-store` path. Source/config are in `/opt/artimex-portal`; the extra Nginx location is `site.artimex-portal.custom` in the existing custom include directory. Do not replace Mailcow core configuration.

Passwords are salted scrypt hashes. Temporary credentials expire after seven days and issue only a restricted ten-minute password-change cookie. Normal access requires a new personal password of 12–256 characters; an atomic compare-and-set prevents reusing the temporary credential. Password changes/reset provisioning invalidate prior sessions by account version. Sessions last eight hours and validate their account version against the database on every protected API request. Login attempts are limited per account and IP. There is no email-code step.

Provision new directory entries with `PORTAL_STORE_URL` and `PORTAL_STORE_TOKEN` in the environment, then `node scripts/provision-users.mjs`. Existing accounts are never overwritten. Generated temporary passwords are saved only in a private, ignored `.vercel/temporary-accounts-*.json` file for manual delivery. Never commit passwords or the store token. A shared mailbox account has a shared log identity; the portal cannot distinguish individual people using those credentials.

Daily SQLite online backups run via `/etc/cron.d/artimex-portal-backup`, retain 14 daily copies in `/srv/artimex-portal-db/backups`, and use `/opt/artimex-portal/backup.sh` (`ops/backup-portal.sh`). These are local VPS backups; no offsite copy is configured. After provisioning, take an immediate backup. For recovery, stop the store container, restore a backup using SQLite backup API into the database, remove stale WAL/SHM files only while stopped, preserve UID/GID 10001, and restart it. Always retain a copy of the current database before restoring.

Super users can view `/api/dashboard`: location uploads, CSV row counts, errors, latest upload, accounts and access events over the latest 10,000 events. Older events remain stored; uploads before activation are not backfilled. Receipt means SFTP deposit, not successful GlobalBake import. No downstream GlobalBake callback exists.

Product control: `ARTIMEX_PRODUCT_CATALOG` is a JSON array of official product identifiers. Recognized headers include SKU, Item, Item Number/Code/ID and Product Code/ID. Unknown or empty products, or a missing identifier column when a catalogue is configured, block preview with a visible alert and audit event. Without the official catalogue, preview explicitly warns that product existence was not checked.

Optional Hugging Face analysis requires `HF_TOKEN` (Inference Providers permission) and `HF_MODEL`. Only aggregate counts (rows, columns, empty cells, negative numeric values) are sent, never CSV values or account identifiers. Results are advisory and do not authorize imports. An unavailable model produces a visible warning. These credentials and the official product catalogue are not yet provisioned.

Verification: `npm test` includes integration tests against a real temporary SQLite storage service (Python 3 required), concurrent first-password changes, temporary credential replay, expired session versions, rate limits, audit storage and dashboard permissions. `npm run build` builds the static site.

Hugging Face API reference: https://huggingface.co/docs/inference-providers/tasks/chat-completion.

## Operations console and IT administration

Super administrators land on a dedicated console with six views: operations overview, GM reports, upload history, IT administration, access/audit log and alerts. The upload workflow is a separate view. Reports filter by dates (UTC) and restaurant, support search and CSV export, and distinguish server receipt from GlobalBake import. Per-location GM names are retained for shared accounts. Reports include all eleven directory locations; Panorama has no assigned GM. The UI supports English, Spanish and mobile screens.

`portal:profiles` in the VPS1 database stores editable user profiles and role/restaurant assignments. Before the first change, profiles are seeded from the approved directory. `/api/admin-users` allows super administrators to create accounts, edit roles/assignments and location-specific manager names, enable/disable accounts, and issue temporary password resets. The browser displays each generated password once for manual delivery. Credentials remain salted hashes in the database and are never included in audit events or user lists. Mutations and their audit records are committed atomically by `MULTICAS`; concurrent edits return a conflict. An administrator cannot disable/demote their own account or reset their own password through the admin screen. Updates to other accounts rotate their session version immediately.

`/api/upload-file?id=...` lets super administrators download an original retained CSV by its recorded upload receipt ID; arbitrary server paths are not accepted. New receipt events include original filename, byte size, row count and submitting account. `scripts/reconcile-uploads.mjs` can recover historical receipts from files already present on VPS1 without sending them again or claiming a known uploader/import status. It deduplicates by recorded filename. Two Pacific receipts (October 22 and 23, 2026 UTC) were recovered, totaling 81 CSV rows. Historical events retain `source=server_recovery` and an unknown original uploader. Reports cover the latest 10,000 audit events and visibly flag this limit when reached.

Validation includes real SQLite integration tests for admin account creation, permission changes, suspension, reset, session revocation, self-lockout protection, origin checks and audit records, plus report aggregation/date filtering. The console was also exercised in Chrome on desktop and mobile: every view, GM details, historical receipts, CSV export, user creation, role edit, suspension, password reset and language switching.

## Online user guide

`/guide.html` is the bilingual Artimex help center, linked from the portal header, the Control Center sidebar and the CSV upload form. It opens in a separate tab so the current upload/preview is preserved. The language follows the existing English/Spanish preference; switching languages retains the current chapter. The guide includes chapter navigation, accent-insensitive search, contextual links, troubleshooting, a glossary and a complete print/PDF layout with a contents page.

`/api/guide?lang=en|es` determines the profile from the authenticated server session and returns only the applicable chapters: 3 public access/help chapters when signed out, 8 chapters for General Managers, and 15 for super administrators. A client-supplied role cannot unlock administrator chapters. Administrator documentation is bundled server-side in `lib/guide-content.mjs`, outside public static assets. Print and search use only the chapters returned for that profile. Account and password changes are explained using the current UI; optional catalogue/Hugging Face checks and the absence of automatic GlobalBake import feedback are described accurately.

Update both language versions in `lib/guide-content.mjs` when workflows change and revise the review date/version in `api/guide.mjs` and the guide UI labels as appropriate. API integration tests check role filtering and bilingual chapter parity. Browser validation covers all three profiles, contextual new-tab links, English/Spanish, deep links, search, responsive layout and full-guide printing to PDF.
