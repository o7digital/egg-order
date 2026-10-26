# Portal privacy notice implementation

Version: 2026-10-25.1. Published languages: English and Spanish.

The portal notice supplements the main Artimex website notice, using the privacy contact already published there. It describes this repository’s account administration, authentication, CSV storage/transfer, cross-location super-administrator access, security logging, optional aggregate-only HF analysis, and actual retention mechanisms. It intentionally does not copy the public website’s Google Analytics or Olivia-chat disclosures into this portal.

Primary references reviewed on October 25, 2026:

- Artimex privacy notice: https://www.artimexbakery.com/en/privacy-notice/
- Spanish notice: https://www.artimexbakery.com/es/aviso-de-privacidad/
- CPPA regulations effective January 1, 2026, especially sections 7003 and 7012: https://cppa.ca.gov/regulations/pdf/ccpa_statute_eff_20260101.pdf
- CCPA statute, including section 1798.192 (no waiver of statutory rights): https://cppa.ca.gov/pdf/20260101_ccpa_statute.pdf

This is a notice-of-receipt workflow, not advertising consent, a sale/sharing opt-in, a waiver of statutory rights or a legal determination that every CCPA provision applies to Artimex. The required acknowledgment is the portal’s activation procedure; the documentation does not represent that California law universally requires a checkbox. No scrolling, marketing preference or waiver is bundled with it.

The notice is available before sign-in, beside administrator account-intake fields, during temporary-password activation/reset, from the guide and in the footer. Activation rejects missing, unchecked, outdated or mismatched acknowledgments server-side. Successful password activation atomically stores credentials, latest acknowledgment, version-specific acknowledgment and the password-change event carrying the notice fingerprint. Acknowledgment records retain version, SHA-256 hash, language, first/latest server timestamps, account email, method and existing relevant security context. They contain no plaintext password. Additional privacy/login events supplement the atomic record. Password resets do not remove prior acknowledgment history.

Existing accounts are not silently marked as having acknowledged. Their status remains unrecorded until an actual temporary-password activation/reset records receipt. This change does not force existing signed-in users to consent again or replace their passwords.

Canonical text is committed under `legal/privacy/<version>.json`. `lib/privacy.mjs` selects the current version and hashes the exact canonical bytes. Build copies all canonical versions to `/privacy/<version>.json` and generates permanent language-specific snapshots at `/privacy/<version>.en.html` and `.es.html`. `/privacy.html` is the current bilingual page. Text is statically rendered and readable without JavaScript; the API provides current version/summary for activation. Never edit a published canonical version: add a new version and preserve all older files. Changing the published wording without changing its version causes old proof hashes to differ from the served archive.

## Organizational matters outside a checkbox

Artimex’s counsel/privacy owner should validate the final wording and business coverage against actual practices, including the legal operator, provider agreements and any service-provider restrictions, international processing arrangements, employer/restaurant roles, category-specific retention decisions, rights-request verification and response procedures, legal holds, and disclosures outside this application. The application does not implement those organizational duties merely by publishing a notice.

No new sale/advertising use, automatic data deletion, universal retention period or automatic fulfillment of privacy requests is asserted. The main privacy contact receives requests outside this application. Live account/file/audit records currently rely on operational retention decisions; 14 daily database backups and the dashboard’s 10,000-event display limit are not a live-record deletion schedule. No claim of certified or guaranteed California compliance is made.
