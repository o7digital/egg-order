# Artimex CSV intake

Production: https://r365-gb-order-seven.vercel.app/

Restaurants export a CSV from R365, enter their restaurant name and access code, and upload it. The server transfers the original bytes via pinned-key SFTP to `/incoming` on the Artimex server. Final filenames contain the restaurant, UTC timestamp, unique ID and original basename. Uploads use `.part` then rename to `.csv`. Artimex staff import the CSV into GlobalBake manually. API retrieval from R365 is not implemented; determine the correct report and validate an actual import first.

Required production secrets: `ARTIMEX_UPLOAD_CODE`, `ARTIMEX_SFTP_PASSWORD`, `ARTIMEX_SFTP_FINGERPRINT`. Credentials never go to the browser. The shared pilot access code must be supplied separately to restaurant staff. Each upload is independent; repeated submission can create another file, so staff must verify the order before importing into GB.

`npm ci`, `npm test`, `npm run build`. Deploy with `vercel --prod` against the existing linked project. The optional mapping demo contains sample data only.

## Restaurant directory

`assets/restaurants.json` is the shared source for the portal select, directory and server validation. Ten names originate from the existing R365 order mockup; the complete list and R365/GB location identifiers still need client confirmation. Other project seed lists disagree, so no extra names or identifiers have been invented.

## Shared server

Verified on VPS2: both the `artimex-ftp` service (5.39.3.225, port 21) and the SFTP accounts use `/srv/artimex` as their client root. Website uploads go to `/incoming`, physically `/srv/artimex/incoming`. Compare the host and folder saved in GlobalBake to confirm that it reads this same folder; GB application settings are not accessible from this repository. Website transfer uses SFTP to mail.o7digitalgroup.com / 51.178.36.17, port 22.
