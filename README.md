# Artimex restaurant portal

Production: https://r365-gb-order-seven.vercel.app/

Pilot account: pacific@gallogiro.com, bound server-side to EGG Pacific. Credentials are provisioned privately; no mail is sent. The password is not stored in source or exposed to the browser. Other restaurant directory entries do not yet have accounts.

Flow: login → choose CSV → server-generated preview of up to 20 rows → explicit confirmation → SFTP upload to Artimex `/incoming` → manual or separately configured GB import. Preview does not write to FTP. A signed preview token binds the user, restaurant, filename and exact file bytes for 15 minutes. Sessions use a signed Secure HttpOnly SameSite cookie with an eight-hour lifetime. Changing files requires a new preview. UTF-8 CSV with a header and consistent columns is required; 2 MiB maximum. Original file bytes are preserved.

Required production secrets: ARTIMEX_PORTAL_USERS (JSON array of email, restaurant, scrypt salt/hash), ARTIMEX_SESSION_SECRET, ARTIMEX_SFTP_PASSWORD, ARTIMEX_SFTP_FINGERPRINT. The former shared upload code is no longer accepted. Provision accounts with scrypt N=16384,r=8,p=1,64 bytes. Remove/rotate a user to revoke access. No public registration or email workflow.

Shared server verified: VPS1 51.178.36.17 / mail.o7digitalgroup.com. FTP artimex-ftp at 5.39.3.225:21 and website SFTP share `/srv/artimex`; client `/incoming` corresponds to `/srv/artimex/incoming`. Older reports called this machine VPS2. VPS2 today is 92.222.23.247.

The site confirms receipt on Artimex, not import into GlobalBake. GB runs in a remote Windows environment; scheduling its importer and fetching files to that Windows environment are outside this repository. The Windows host must remain available; whether an interactive session is needed depends on GB. R365 API retrieval is not implemented.

`assets/restaurants.json` contains the ten restaurant names approved for the pilot. `npm ci`, `npm test`, `npm run build`, then `vercel --prod` against the existing linked project. Repeated confirmed submissions can create duplicate files; staff must verify orders before import.

## Languages

The portal defaults to US English and offers Spanish via the header selector. The choice persists in browser localStorage. API error/receipt messages follow the selected language. Restaurant names and original CSV cells are not translated.

## Multi-location accounts and administration

The new account system is implemented but gated by `PORTAL_ACCOUNTS_ENABLED=true` until the following production settings are provisioned:

- `PORTAL_REDIS_URL`, `PORTAL_REDIS_TOKEN`: persistent Upstash-compatible Redis REST storage for password hashes, one-use verification challenges, rate limits and audit events. Use an owned durable database, not temporary storage.
- `RESEND_API_KEY`, `PORTAL_EMAIL_FROM`: email delivery credentials and a verified sender.
- Existing `ARTIMEX_SESSION_SECRET` and SFTP credentials remain required.

Configure these first, test activation and actual email delivery, then enable `PORTAL_ACCOUNTS_ENABLED` and redeploy. Until enabled, the existing Pacific pilot still works; new-account activation reports a configuration blocker. No account activation messages have been sent. Account activation/reset proves email ownership and sets a password of at least 12 characters. Subsequent login requires the password followed by a six-digit email code (10-minute lifetime, five guesses, single use). This creates portal accounts, not email mailboxes. Password reset does not revoke already-issued eight-hour sessions.

`lib/directory.mjs` defines the five requested super users and approved manager assignments. Shared `egg-bellflower@gallogiro.com` has Bristol and Bellflower; both manager/location assignments are retained. Canoga Park is deduplicated. Fontana has been added; Panorama remains in the original restaurant directory without an assigned manager. A shared email account has a shared access-log identity; it cannot distinguish the individual using that mailbox.

Super users can upload for every directory location and view `/api/dashboard`; managers can upload only for assigned locations. The dashboard shows uploads, CSV row counts, errors, latest upload, accounts and access/upload events over the latest 10,000 events (clearly labelled). Events remain stored beyond the displayed window. Older uploads before activation are not backfilled. Upload receipt means SFTP deposit only, not successful GlobalBake import.

Optional product control: `ARTIMEX_PRODUCT_CATALOG` is a JSON array of official product identifiers. Recognized identifier headers include SKU, Item, Item Number/Code/ID and Product Code/ID. Unknown or empty products, or a missing identifier column when catalogue validation is enabled, block preview with a visible alert and audit event. Without a catalogue the preview explicitly warns that product existence was not checked.

Optional Hugging Face integration: set `HF_TOKEN` (Inference Providers permission) and `HF_MODEL` to a compatible chat-completion model. The integration sends only aggregate counts (rows, columns, empty cells, negative numeric values); it sends no CSV values or account identifiers. Results are advisory, visible in preview, and never authorize an import. An unavailable model produces a visible warning. Credentials, model and official product catalogue are not currently provisioned. No downstream GlobalBake error callback exists in this repository.

API references: https://resend.com/docs/api-reference/emails/send-email, https://upstash.com/docs/redis/features/restapi, https://huggingface.co/docs/inference-providers/tasks/chat-completion.
