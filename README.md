# Artimex CSV intake

Production: https://r365-gb-order-seven.vercel.app/

Restaurants export a CSV from R365, enter their restaurant name and access code, and upload it. The server transfers the original bytes via pinned-key SFTP to `/incoming` on the Artimex server. Final filenames contain the restaurant, UTC timestamp, unique ID and original basename. Uploads use `.part` then rename to `.csv`. Artimex staff import the CSV into GlobalBake manually. API retrieval from R365 is not implemented; determine the correct report and validate an actual import first.

Required production secrets: `ARTIMEX_UPLOAD_CODE`, `ARTIMEX_SFTP_PASSWORD`, `ARTIMEX_SFTP_FINGERPRINT`. Credentials never go to the browser. The shared pilot access code must be supplied separately to restaurant staff. Each upload is independent; repeated submission can create another file, so staff must verify the order before importing into GB.

`npm ci`, `npm test`, `npm run build`. Deploy with `vercel --prod` against the existing linked project. The optional mapping demo contains sample data only.
