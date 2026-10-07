import { UUID_REGEX } from "./uuid.js";

export const parseDeezerId = (value, kind = "album") =>
  String(value || "").match(new RegExp(`^deezer:${kind}:([1-9]\\d*)$`))?.[1] || null;
export const isDeezerAlbumId = (value) => Boolean(parseDeezerId(value));
export const isCatalogAlbumId = (value) => UUID_REGEX.test(String(value || "")) || isDeezerAlbumId(value);
export const musicbrainzId = (value) => UUID_REGEX.test(String(value || "")) ? String(value) : null;
export const albumCatalogId = (album) => album?.releaseGroupMbid || album?.mbid ||
  album?.metadata?.catalogId || album?.foreignAlbumId || null;
export const trackCatalogId = (track) => track?.mbid || track?.metadata?.catalogId || null;
