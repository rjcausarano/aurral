import createRateLimiter from "./rateLimiter.js";

// Share the canonical MusicBrainz API budget across all catalogue requests.
export const musicbrainzRateLimiter = createRateLimiter(1100, { maxQueue: 40 });
