# e-Research Mobile data contract

This document describes the data contract required by the Mobile e-Research
screens. It does not create or implement a Backend endpoint.

## Search scope

Verification note: Mobile currently sends `scope=all` for both search screens
and does not filter response rows by researcher ownership. This is not proof
that the deployed projects API returns other users' accessible projects.
Capture the development `[LRD response]` and `[LRD error]` logs on the device
for projects and papers, including host, scope, status, total and page metadata.
Never include tokens or personal records. Compare all/mine across pages with
an authorized test account and a known public project owned by another account.

Page clamping must wait for a successful API response: clearing total while
switching query/page must not send the screen back to page one.
`npm test` includes a 1,207-row multi-owner parser fixture; it does not verify
server permissions or authenticated production data.
`node scripts/test-expert-counts.js` separately checks Expert mutation refresh,
out-of-order responses, account switching and Strict Mode lifecycle using mocks.

The Mobile search screens call the existing endpoints:

- `GET /info/lrd/projects`
- `GET /info/lrd/papers`

Search requests use `scope=all`. Backend must interpret this as every record
the authenticated account is allowed to see, including the account's own
records. It must not mean unrestricted public access.

Management screens continue to use `scope=mine`, so users can edit or delete
only records owned by the authenticated researcher. Search results remain
read-only unless the record is owned by the current account in a management
screen.

## Backend verification handoff

Backend must verify the deployed host used by the Mobile runtime and provide
authenticated, redacted evidence for these requests:

- `GET /info/lrd/projects?scope=all&page=1&per_page=20`
- `GET /info/lrd/projects?scope=mine&page=1&per_page=20`
- `GET /info/lrd/papers?scope=all&page=1&per_page=20`

For `scope=all`, the response must contain the current account's records plus
records owned by other accounts only when the project's actual visibility rule
allows access. It must not apply an owner-only filter before evaluating scope.
For `scope=mine`, it must return only records owned by the current account.
Edit and delete authorization must continue to check the original owner.

The evidence must include HTTP status, filtered `total`, page metadata, and
whether a known public record from another account is present. It must not
include tokens, names, researcher identifiers, or full response bodies. If the
Mobile runtime calls the Info host directly, changing a central proxy does not
change the Info deployment; the same controller and visibility rules must be
deployed on that host.

In development, Mobile logs a request ID, host/path, scope, page, page size,
whether a query exists, safe pagination metadata, cache source/age, and safe
422 validation fields. It never logs the query value or authorization data.

## Pagination response

Mobile sends `page`, `per_page`, and an optional `q` search term. The response
must preserve pagination metadata and return the total number of matching
records, not only the number of rows in the current page.

## Project and article ordering

Project and paper lists must use a stable oldest-first order before pagination,
using the immutable creation sequence (normally `created_at ASC`, with `id ASC`
as a tie-breaker). A newly created record must be appended after existing
records; updating an existing record must not change its position. Mobile orders
rows oldest-first within each returned page when a creation timestamp or
numeric ID is available, then calculates row numbers. Backend ordering must
happen before pagination; sorting one page at a time cannot produce correct
numbering across multiple pages.

```json
{
  "data": [
    { "id": 101, "projectname": "ตัวอย่างโครงการ" }
  ],
  "total": 1207,
  "current_page": 1,
  "per_page": 20,
  "last_page": 61
}
```

Nested Laravel-style data is also accepted when the metadata remains
available:

```json
{
  "data": {
    "data": [],
    "total": 1207,
    "current_page": 1,
    "per_page": 20,
    "last_page": 61
  }
}
```

An empty result must be returned as an array, such as `data: []`. A missing,
null, HTML, or otherwise malformed collection response must be an API error;
Mobile must not treat it as a successful empty database.

## Create/update visibility

After a successful create, update, or delete, the changed record must be
readable from the next authenticated list request using the same account and
scope rules. The response must use a consistent success/error status and must
not return success when the operation was skipped or rejected.

For articles, Backend must document the meanings and allowed values of
`public` and `status`. Mobile currently sends the existing values and needs
the API response to confirm whether the new article is included in
`scope=all`.

Backend should also confirm the ownership field used by the response, such as
`researcher_id`, so Mobile can enforce edit/delete controls consistently.
