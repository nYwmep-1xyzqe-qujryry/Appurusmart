# Mobile services API contract

This document describes the contract required by the Mobile Frontend. It does
not create or implement a Backend endpoint.

## Endpoint

`GET /services` with the existing Bearer Token. The response must always be
JSON, including errors. Do not redirect API requests to an HTML login page.

Suggested response:

```json
{
  "data": [
    {
      "id": 1,
      "service_key": "expert",
      "name_th": "Expert",
      "name_en": "Expert",
      "action_type": "internal_route",
      "route_key": "expert",
      "url": null,
      "icon_name": "document-text-outline",
      "icon_url": null,
      "icon_color": "#1A6B3C",
      "background_color": "#E8F5EE",
      "is_active": true,
      "sort_order": 10,
      "updated_at": "2026-09-21T10:00:00Z"
    }
  ]
}
```

Backend must return services in the desired display order. Mobile preserves
the order of the `data` array and does not sort again by `sort_order` or `id`.

When the service catalog is not ready, return HTTP `503 Service Unavailable`
with JSON instead of redirecting:

```json
{
  "code": "SERVICE_SETUP_REQUIRED",
  "message": "Service catalog is not ready."
}
```

The Mobile app shows the following user-facing messages for this response:

- TH: `ระบบบริการยังไม่พร้อม กรุณาลองใหม่ภายหลัง`
- EN: `Services are not ready yet. Please try again later.`

The retry action is user initiated; the app must not retry in an endless loop.

## Backend requirements

- `service_key` must be stable and unique; labels must not be used as keys.
- `id` must be a unique, stable positive JSON integer within JavaScript's safe
  integer range. When two services have the same `sort_order`, order them by
  ascending numeric `id` (2 before 10).
- `action_type` must be `internal_route` or `external_url`.
- `route_key: expert` opens Mobile route `Research`; `route_key: e_research` opens `EResearch`.
- The records with `service_key: expert` and `service_key: e_research` are
  Native Mobile services. They must use `action_type: internal_route`, the
  matching `route_key`, and `url: null`. Mobile must never open a WebView for
  these two keys, even if a stale or incorrect URL is present.
- `external_url` must provide a valid `http`/`https` URL. The Mobile app never
  sends its API token to that website. Mobile opens external services in the
  existing `InAppBrowser`/WebView screen instead of leaving the app.
- `icon_name` must be one of the icon names supported by the Mobile app, or
  provide an HTTPS `icon_url`. Invalid icons use the Mobile fallback icon.
- Colors must be six-digit hex values such as `#07865F` or `#E8F4EF`.
- `is_active` controls visibility. `sort_order` must be an integer.
- `name_th` and `name_en` should be supplied. The app falls back to the other
  language when one is missing.
- `updated_at` should change whenever the service, URL, icon, or colors change.
- When an image changes, provide a new versioned `icon_url`; Mobile uses the
  URL as received and does not append cache-busting query parameters.
- Error responses for `401`, `403`, and `5xx` must be JSON with a string-safe
  error code/message. `403` means the Mobile client must clear the service list
  and must not open a cached service.
- The API must return an empty `data` array when there are no active services;
  it must not return the old hardcoded list.
- Existing 13 services should be seeded once by Backend without overwriting
  later Admin changes or creating duplicates.
- Backend/Web Admin owns CRUD, activation, ordering, and the seed. Mobile only
  consumes the read contract.
- `503 SERVICE_SETUP_REQUIRED` is a temporary setup state. Mobile shows a
  retry action and does not retry in a loop. If cached data is shown, Mobile
  labels it as cached while the service catalog is not ready.

## Mobile rollout

Return the complete list as `{ "data": [...] }`, without pagination. Required
fields are `id`, `service_key`, at least one name, `action_type`, `is_active`
(JSON boolean), and `sort_order` (JSON integer). Optional fields must be null
when absent. API validation rejects malformed records instead of silently
replacing a valid cached list with an empty result.

Supported icon names: `document-text-outline`, `journal-outline`, `book-outline`,
`videocam-outline`, `people-outline`, `document-outline`, `school-outline`,
`bar-chart-outline`, `calendar-number-outline`, `map-outline`, `reader-outline`,
`star-outline`, `car-outline`. Images take priority; failed images fall back to
the icon. Other icon names render as `grid-outline`.

Backend handoff must include real authenticated success/empty/error responses,
confirmation of user visibility rules, and server cache invalidation after Admin
changes. Seed/update by service_key without overwriting Admin edits. Backend
owns Admin permissions and catalog CRUD; existing Expert/e-Research systems and
push notifications are outside this work.

Mobile unit checks and bundle exports do not verify live API integration,
account-switch timing, or physical-device layouts. Complete these checks before
releasing the API-only service menu.

Mobile refreshes the catalog when Home receives focus, when the app returns to
the foreground, and when the user pulls to refresh Home. Home waits for the
service, announcement, and work-stat requests to settle before ending the
refresh indicator, including when one request fails.

The Mobile integration is gated behind `EXPO_PUBLIC_SERVICES_API_ENABLED=true`.
The production Build/OTA environment must set this flag to `true`; setting it
only in a local `.env` file is not sufficient. The Mobile app does
not fall back to a hardcoded or mock catalog: a valid `200 {"data": []}`
response renders an empty menu, while API errors show the appropriate retry or
authentication state.
