import { getLinkedDeezerArtistId } from "./brainzmashMappers.js";
import { musicbrainzId, parseDeezerId } from "../../../lib/catalogId.js";

export const catalogText = (value) => String(value || "").normalize("NFKD")
  .replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
const validId = (id) => /^[1-9]\d*$/.test(String(id || ""));

export function normalizeDeezerAlbum(raw) {
  if (!validId(raw?.id) || !validId(raw?.artist?.id) || !raw?.title) {
    throw new Error("Deezer album has no usable identity");
  }
  const id = `deezer:album:${raw.id}`;
  const artist = {
    id: `deezer:artist:${raw.artist.id}`, name: raw.artist.name || "",
    aliases: [], links: [{ type: "deezer", target: `https://www.deezer.com/artist/${raw.artist.id}` }],
  };
  const tracks = (raw.tracks?.data || []).map((track, index) => ({
    id: `deezer:track:${track.id}`, recordingId: null,
    title: track.title || "", trackNumber: Number(track.track_position) || index + 1,
    trackPosition: Number(track.track_position) || index + 1,
    mediumNumber: Number(track.disk_number) || 1,
    durationMs: Number(track.duration) > 0 ? Math.round(Number(track.duration) * 1000) : null,
    artistId: track.artist?.id ? `deezer:artist:${track.artist.id}` : artist.id,
    artistName: track.artist?.name || artist.name,
    preview_url: track.preview || null, previewProvider: "deezer", previewTrackId: String(track.id),
  })).filter((track) => validId(parseDeezerId(track.id, "track")) && track.title);
  if (Number(raw.nb_tracks) > 0 && tracks.length !== Number(raw.nb_tracks)) {
    throw new Error("Deezer returned an incomplete track list");
  }
  const image = raw.cover_big || raw.cover_medium || raw.cover || null;
  return {
    id, catalogProvider: "deezer", deezerAlbumId: String(raw.id), deezerArtistId: String(raw.artist.id),
    artistId: artist.id, artists: [artist], artistName: artist.name,
    title: raw.title, type: ({ album: "Album", ep: "EP", single: "Single" })[raw.record_type] || "Album",
    secondaryTypes: [], releaseStatuses: ["Official"],
    releaseDate: raw.release_date || null, firstReleaseDate: raw.release_date || null,
    images: image ? [{ kind: "Cover", url: image }] : [], coverUrl: image,
    coverImages: image ? [{ kind: "Cover", url: image }] : [],
    genres: (raw.genres?.data || []).map((genre) => genre.name).filter(Boolean),
    links: [{ type: "deezer", target: `https://www.deezer.com/album/${raw.id}` }],
    overview: "", rating: null, trackCount: tracks.length, upc: raw.upc || null,
    releases: [{ id, title: raw.title, status: "Official", releaseDate: raw.release_date || null,
      trackCount: tracks.length, tracks, media: [{ position: null, format: "Digital Media" }] }],
  };
}

// Do not fold deluxe, live or remastered editions into a standard album.
// Missing evidence keeps two releases visible instead of hiding one incorrectly.
const orderedTracks = (tracks) => [...tracks].sort((a, b) =>
  (Number(a.mediumNumber) || 1) - (Number(b.mediumNumber) || 1) ||
  (Number(a.trackPosition || a.trackNumber) || 0) - (Number(b.trackPosition || b.trackNumber) || 0));
const liveAlbum = (album) => /\b(?:live|en vivo)\b/i.test(album.title || "") || (album.secondaryTypes || []).includes("Live");
const trackTitle = (track, album) => catalogText(liveAlbum(album)
  ? String(track.title || "").replace(/\s*(?:\((?:en vivo|live)\)|\[(?:en vivo|live)\]|[-–—]\s*(?:en vivo|live))\s*$/i, "")
  : track.title);

export function sameCatalogRelease(left, right) {
  if (left.artistId !== right.artistId || catalogText(left.title) !== catalogText(right.title) ||
      (left.type || "Album") !== (right.type || "Album")) return false;
  const leftTracks = orderedTracks(left.tracks || []), rightTracks = orderedTracks(right.tracks || []);
  if (!leftTracks.length || leftTracks.length !== rightTracks.length) return false;
  // Digital reissue dates often differ from the original MusicBrainz date.
  // Exact ordered track evidence takes precedence; preserve both dates below.
  let subtitleVariants = 0;
  for (let index = 0; index < leftTracks.length; index++) {
    const track = leftTracks[index], other = rightTracks[index];
    const knownDurations = track.durationMs > 0 && other.durationMs > 0;
    const deltaMs = knownDurations ? Math.abs(track.durationMs - other.durationMs) : null;
    if (deltaMs !== null && deltaMs > 5000) return false;
    if (trackTitle(track, left) === trackTitle(other, right)) continue;
    // One omitted subtitle/year can be accepted in a well-corroborated album,
    // never across editions or when durations are missing/different.
    const protectedVersion = /\b(?:live|vivo|remix|mix|remaster\w*|radio|edit|demo|acoustic|acustic\w*|instrumental|version|bonus|mono|stereo)\b/i;
    const rawLeft = String(track.title || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
    const rawRight = String(other.title || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
    if (leftTracks.length < 5 || !knownDurations || deltaMs > 3000 ||
        protectedVersion.test(rawLeft) || protectedVersion.test(rawRight)) return false;
    const baseTitle = value => catalogText(value
      .replace(/\s*\([^()]+\)\s*$/, "")
      .replace(/\s+(?:19|20)\d{2}\s*$/, ""));
    const leftBase = baseTitle(rawLeft), rightBase = baseTitle(rawRight);
    if (!leftBase || leftBase !== rightBase || ++subtitleVariants > 1) return false;
  }
  return true;
}

export async function mergeCatalogAlbums(primary, supplemental, { loadPrimary, selectRelease }) {
  const result = primary.map((album) => ({ ...album, metadataSources: ["brainzmash"] }));
  const details = new Map();
  for (const extra of supplemental) {
    let duplicate = null;
    for (const candidate of result) {
      if (candidate.artistId !== extra.artistId || catalogText(candidate.title) !== catalogText(extra.title) ||
          (candidate.type || "Album") !== (extra.type || "Album")) continue;
      if (!details.has(candidate.id)) {
        try {
          const album = candidate.catalogProvider === "deezer" ? candidate : await loadPrimary(candidate.id);
          details.set(candidate.id, { ...album, artistId: candidate.artistId,
            tracks: selectRelease(album)?.tracks || [] });
        } catch { details.set(candidate.id, null); }
      }
      const hydrated = details.get(candidate.id);
      const supplementalRelease = { ...extra, tracks: extra.releases[0]?.tracks || [] };
      // The provider may select a CD with bonus tracks while Deezer carries
      // another official pressing in the same release group.
      const pressings = hydrated ? [hydrated, ...(hydrated.releases || [])
        .filter(release => String(release.status || "").toLowerCase() === "official")
        .map(release => ({ ...hydrated, tracks: release.tracks || [] }))] : [];
      if (pressings.some(pressing => sameCatalogRelease(pressing, supplementalRelease))) {
        duplicate = candidate;
        break;
      }
    }
    if (duplicate) {
      duplicate.deezerAlbumId ||= extra.deezerAlbumId;
      duplicate.providerReleaseDates = { ...(duplicate.providerReleaseDates || {}),
        musicbrainz: duplicate.firstReleaseDate || duplicate.releaseDate || null,
        deezer: extra.releaseDate || null };
      duplicate.coverUrl ||= extra.coverUrl;
      duplicate.coverImages = duplicate.coverImages?.length ? duplicate.coverImages : extra.coverImages;
      duplicate.metadataSources = [...new Set([...(duplicate.metadataSources || []), "deezer"])];
    } else {
      result.push({ ...extra, metadataSources: ["deezer"] });
    }
  }
  return result;
}

// All network access is injected so identity, pagination and merge policies can
// be tested without a database or a live metadata service.
export function createDeezerCatalog({ request }) {
  const cache = new Map();
  const inflight = new Map();
  const cached = async (key, load) => {
    const entry = cache.get(key);
    if (entry?.expires > Date.now()) return structuredClone(entry.value);
    if (inflight.has(key)) return structuredClone(await inflight.get(key));
    const promise = load();
    inflight.set(key, promise);
    try {
      const value = await promise;
      if (cache.size >= 2000) cache.delete(cache.keys().next().value);
      cache.set(key, { value, expires: Date.now() + 24 * 3600 * 1000 });
      return structuredClone(value);
    } finally { inflight.delete(key); }
  };
  const pages = async (path, params = {}) => {
    const rows = [], seen = new Set();
    let index = 0;
    for (let page = 0; page < 100; page++) {
      const data = await request(path, { ...params, limit: 100, index });
      if (data?.error || !Array.isArray(data?.data)) throw new Error("Deezer catalogue request failed");
      rows.push(...data.data);
      if (!data.next) return rows;
      const next = new URL(data.next);
      const nextIndex = Number(next.searchParams.get("index"));
      // Follow only pagination for this exact public API resource.
      if (next.hostname !== "api.deezer.com" || next.pathname !== path ||
          !Number.isSafeInteger(nextIndex) || nextIndex <= index || seen.has(nextIndex)) {
        throw new Error("Invalid Deezer pagination");
      }
      seen.add(nextIndex);
      index = nextIndex;
    }
    throw new Error("Deezer catalogue pagination exceeded its safety limit");
  };
  const album = (reference) => {
    const id = parseDeezerId(reference) || (validId(reference) ? String(reference) : null);
    if (!id) throw new Error("Invalid Deezer album ID");
    return cached(`album:${id}`, async () => {
      const raw = await request(`/album/${id}`);
      if (String(raw?.id) !== id) throw new Error("Deezer returned a different album");
      if (raw.tracks?.next) raw.tracks = { data: await pages(`/album/${id}/tracks`) };
      return normalizeDeezerAlbum(raw);
    });
  };
  const summaries = (id) => cached(`artist-albums:${id}`, () => pages(`/artist/${id}/albums`));
  const resolveArtist = async (artist, { overrideId = null, knownAlbums = [] } = {}) => {
    if (!musicbrainzId(artist?.id)) return null;
    const explicit = overrideId || getLinkedDeezerArtistId(artist.links);
    if (explicit) {
      if (!validId(explicit)) return null;
      const detail = await request(`/artist/${explicit}`);
      return String(detail?.id) === String(explicit) ? String(explicit) : null;
    }
    // Names alone cannot distinguish Airbag (Argentina/Norway/Spain).
    const evidence = new Set(knownAlbums.map((entry) => catalogText(entry.title)).filter(Boolean));
    if (evidence.size < 2) return null;
    return cached(`artist-match:${artist.id}:${artist.name}:${[...evidence].sort().join(",")}`, async () => {
      const result = await request("/search/artist", { q: artist.name, limit: 50 });
      if (result?.error) throw new Error("Deezer artist search failed");
      const names = new Set([artist.name, ...(artist.aliases || [])].map(catalogText));
      const candidates = (result?.data || []).filter((entry) => validId(entry.id) && names.has(catalogText(entry.name)));
      if (candidates.length > 5) return null;
      const matches = [];
      for (const candidate of candidates) {
        const titles = new Set((await summaries(candidate.id)).map((entry) => catalogText(entry.title)));
        if ([...evidence].filter((title) => titles.has(title)).length >= 2) matches.push(String(candidate.id));
      }
      return matches.length === 1 ? matches[0] : null;
    });
  };
  const artistAlbums = async (artist, options = {}) => {
    const id = await resolveArtist(artist, options);
    if (!id) return [];
    const rows = await summaries(id);
    const results = [];
    // A provider failure for one release must not discard other releases.
    for (let index = 0; index < rows.length; index += 4) {
      const batch = await Promise.allSettled(rows.slice(index, index + 4).filter((row) => validId(row.id)).map((row) => album(String(row.id))));
      for (const result of batch) {
        if (result.status !== "fulfilled" || result.value.deezerArtistId !== id) continue;
        results.push({ ...result.value, artistId: artist.id, artistName: artist.name,
          artists: [{ ...artist }], verifiedArtistId: artist.id });
      }
    }
    return results;
  };
  return { album, resolveArtist, artistAlbums,
    search: (query, limit = 25) => request("/search/album", { q: query, limit: Math.min(100, limit) }),
    clear: () => { cache.clear(); inflight.clear(); } };
}
