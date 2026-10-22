# Artimex restaurant portal

Production: https://r365-gb-order-seven.vercel.app/

Pilot account: pacific@gallogiro.com, bound server-side to EGG Pacific. Credentials are provisioned privately; no mail is sent. The password is not stored in source or exposed to the browser. Other restaurant directory entries do not yet have accounts.

Flow: login → choose CSV → server-generated preview of up to 20 rows → explicit confirmation → SFTP upload to Artimex `/incoming` → manual or separately configured GB import. Preview does not write to FTP. A signed preview token binds the user, restaurant, filename and exact file bytes for 15 minutes. Sessions use a signed Secure HttpOnly SameSite cookie with an eight-hour lifetime. Changing files requires a new preview. UTF-8 CSV with a header and consistent columns is required; 2 MiB maximum. Original file bytes are preserved.

Required production secrets: ARTIMEX_PORTAL_USERS (JSON array of email, restaurant, scrypt salt/hash), ARTIMEX_SESSION_SECRET, ARTIMEX_SFTP_PASSWORD, ARTIMEX_SFTP_FINGERPRINT. The former shared upload code is no longer accepted. Provision accounts with scrypt N=16384,r=8,p=1,64 bytes. Remove/rotate a user to revoke access. No public registration or email workflow.

Shared server verified: VPS1 51.178.36.17 / mail.o7digitalgroup.com. FTP artimex-ftp at 5.39.3.225:21 and website SFTP share `/srv/artimex`; client `/incoming` corresponds to `/srv/artimex/incoming`. Older reports called this machine VPS2. VPS2 today is 92.222.23.247.

The site confirms receipt on Artimex, not import into GlobalBake. GB runs in a remote Windows environment; scheduling its importer and fetching files to that Windows environment are outside this repository. The Windows host must remain available; whether an interactive session is needed depends on GB. R365 API retrieval is not implemented.

`assets/restaurants.json` contains the ten restaurant names approved for the pilot. `npm ci`, `npm test`, `npm run build`, then `vercel --prod` against the existing linked project. Repeated confirmed submissions can create duplicate files; staff must verify orders before import.
