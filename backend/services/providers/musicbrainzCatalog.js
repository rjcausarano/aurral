import { musicbrainzId } from '../../../lib/catalogId.js';

export const normalizeMusicBrainzArtist = (raw) => ({
  id: raw.id, name: raw.name || '', sortName: raw['sort-name'] || raw.name || '',
  type: raw.type || null, disambiguation: raw.disambiguation || '',
  country: raw.country || null, area: raw.area?.name || null,
  genres: (raw.genres || []).map(entry => entry.name).filter(Boolean),
  aliases: (raw.aliases || []).map(entry => entry.name).filter(Boolean),
  images: [], overview: '', rating: null,
  score: Number(raw.score) || 0,
  links: (raw.relations || []).filter(entry => entry['target-type'] === 'url' && entry.url?.resource)
    .map(entry => ({ type: entry.type, target: entry.url.resource })),
});

export function createMusicBrainzCatalog({ request }) {
  const cache = new Map(), inflight = new Map();
  const cached = async (path, params = {}, options = {}) => {
    const key = JSON.stringify([path, params]);
    if (cache.get(key)?.expires > Date.now()) return structuredClone(cache.get(key).value);
    if (inflight.has(key)) return structuredClone(await inflight.get(key));
    const promise = request(path, { ...params, fmt: 'json' }, options);
    inflight.set(key, promise);
    try {
      const value = await promise;
      if (cache.size >= 1000) cache.delete(cache.keys().next().value);
      cache.set(key, { value, expires: Date.now() + 3600000 });
      return structuredClone(value);
    } finally { inflight.delete(key); }
  };
  const artist = async (id, options) => {
    if (!musicbrainzId(id)) throw new Error('Invalid MusicBrainz artist ID');
    const raw = await cached(`/artist/${id}`, { inc: 'url-rels+aliases+genres' }, options);
    if (raw.id !== id) throw new Error('MusicBrainz returned a different artist');
    return normalizeMusicBrainzArtist(raw);
  };
  const artistAlbums = async (id, options) => {
    if (!musicbrainzId(id)) throw new Error('Invalid MusicBrainz artist ID');
    const albums = [];
    for (let offset = 0; offset < 10000; offset += 100) {
      const data = await cached('/release-group', { artist: id, limit: 100, offset }, options);
      if (!Array.isArray(data['release-groups'])) throw new Error('Invalid MusicBrainz album response');
      albums.push(...data['release-groups'].map(raw => ({
        id: raw.id, artistId: id, title: raw.title,
        type: raw['primary-type'] || 'Album', secondaryTypes: raw['secondary-types'] || [],
        firstReleaseDate: raw['first-release-date'] || null,
        releaseDate: raw['first-release-date'] || null, releaseStatuses: [],
        coverImages: [], rating: null,
      })));
      if (data['release-groups'].length < 100 || offset + 100 >= data['release-group-count']) return albums;
    }
    throw new Error('MusicBrainz album pagination exceeded its safety limit');
  };
  const album = async (id, options) => {
    if (!musicbrainzId(id)) throw new Error('Invalid MusicBrainz album ID');
    const group = await cached(`/release-group/${id}`, { inc: 'artist-credits+releases' }, options);
    if (group.id !== id) throw new Error('MusicBrainz returned a different album');
    const releases = (group.releases || []).filter(release => release.status === 'Official');
    const chosen = releases.find(release => release['release-group']?.id === id) || releases[0] || group.releases?.[0];
    if (!chosen?.id) throw new Error('MusicBrainz album has no release');
    const release = await cached(`/release/${chosen.id}`, { inc: 'recordings+artist-credits' }, options);
    const artists = (group['artist-credit'] || []).filter(credit => credit.artist?.id).map(credit => normalizeMusicBrainzArtist(credit.artist));
    const tracks = (release.media || []).flatMap(medium => (medium.tracks || []).map(track => ({
      id: track.id, recordingId: track.recording?.id || null, title: track.title || track.recording?.title || '',
      trackPosition: Number(track.position) || 0, trackNumber: Number(track.position) || 0,
      mediumNumber: Number(medium.position) || 1, durationMs: track.length || track.recording?.length || null,
      artistId: track['artist-credit']?.[0]?.artist?.id || artists[0]?.id,
      artistName: track['artist-credit']?.[0]?.name || artists[0]?.name,
    })));
    return { id, title: group.title, type: group['primary-type'] || 'Album', secondaryTypes: group['secondary-types'] || [],
      artistId: artists[0]?.id, artists, releaseDate: group['first-release-date'] || null,
      images: [], links: [], genres: [], overview: '', rating: null,
      releases: [{ id: release.id, title: release.title, status: release.status, releaseDate: release.date,
        trackCount: tracks.length, tracks, media: (release.media || []).map(medium => ({ position: medium.position, format: medium.format })) }] };
  };
  return { artist, artistAlbums, album,
    searchArtists: async (query, { limit = 100, signal } = {}) => {
      const data = await cached('/artist', { query: String(query).normalize('NFKD').replace(/[\u0300-\u036f]/g, ''), limit: Math.min(100, limit) }, { signal });
      return (data.artists || []).map(normalizeMusicBrainzArtist);
    },
    get: cached,
    clear: () => { cache.clear(); inflight.clear(); },
  };
}
