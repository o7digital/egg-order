import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const bytes=readFileSync(new URL('../legal/privacy/2026-10-25.1.json',import.meta.url));
export const privacyDocument=JSON.parse(bytes);
export const PRIVACY_VERSION=privacyDocument.version;
export const PRIVACY_HASH=createHash('sha256').update(bytes).digest('hex');
export function privacyFor(language='en') {
 const lang=language==='es'?'es':'en';
 return {version:PRIVACY_VERSION,hash:PRIVACY_HASH,effectiveDate:privacyDocument.effectiveDate,language:lang,archiveUrl:`/privacy/${PRIVACY_VERSION}.json`,sourceUrl:privacyDocument.source[lang],...privacyDocument[lang]};
}
