// Pure helpers for announcement image loading. Kept free of react-native
// imports so they can be exercised directly by the test suite.

// True when a load callback still refers to the source the component is
// showing. A slow response for a previous card, or for a carousel loop clone,
// must not report its result against the current one.
export const isCurrentImageCallback = (activeUri, callbackUri) => (
  Boolean(activeUri) && activeUri === callbackUri
);

// A placeholder exists only to avoid an empty frame, so it must never cost a
// network request of its own. The `cache` source option maps to NSURLRequest's
// cache policy and is honoured on iOS only — Android's Fresco ignores it and
// would fetch the file — so the placeholder is limited to iOS, and a cache
// miss there (the entry was evicted) drops it rather than falling back to the
// network.
export const shouldShowCachedPlaceholder = ({
  placeholderUri,
  currentUri,
  platformOS,
  placeholderMissed = false,
}) => (
  Boolean(placeholderUri)
  && placeholderUri !== currentUri
  && platformOS === "ios"
  && !placeholderMissed
);
