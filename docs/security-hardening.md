# URU Smart Security Hardening

This note records the contracts used by the mobile client and the boundaries
that still require backend or device verification. It is intentionally based on
the current source; it does not invent a new authentication protocol.

## SSO contract currently implemented

- The WebView starts at `${API_BASE_URL without /api}/auth/redirect`.
- Navigation may use the URU backend, URU university hosts, and the configured
  Microsoft identity-provider hosts. These are navigation hosts, not all
  credential sources.
- Credentials are accepted only from the exact URU backend hostname, HTTPS in
  production, and `/auth/redirect` or `/auth/callback` paths.
- The existing message contract is a JSON object containing `token`. URL token
  parameters remain supported for compatibility on the entry or callback path;
  the callback timeout starts only on `/auth/callback`. URL query values,
  fragments, and userinfo are redacted from development logs.
- Development may use HTTP for a LAN backend. Production WebView navigation
  and Android cleartext traffic require HTTPS.

The backend should move the callback to a one-time authorization code bound to a
server-side state value, and add PKCE when the server contract supports it.
That migration is deliberately not made in this client-only change.

## Notification reconciliation

The authenticated `/notifications` inbox remains the ownership source. A
missing announcement in an array response is not treated as deletion, even if
the list includes a `total` or `complete` field that is not documented by the
backend. The preferred backend behavior is to remove or mark deleted
announcement notifications in the authenticated inbox itself.

## PDF export

The web-only profile PDF path parses backend HTML with the browser DOM parser,
keeps the print/table/image allowlist, and removes executable elements,
event-handler attributes, unsafe URL schemes, refresh metadata, and dangerous
CSS constructs. Native PDF generation is unchanged.

The web-only path uses DOMPurify with an explicit print HTML allowlist. A small
CSS URL policy preserves safe fonts and images while rejecting executable
schemes. Native PDF generation is unchanged.

## Verification boundary

The dependency install completed and reported 33 advisories (4 moderate, 28
high, 1 critical); no automatic audit fix was run. Backend authorization still
needs an authorized cross-account test; client-side ownership checks are not
proof of server authorization.
