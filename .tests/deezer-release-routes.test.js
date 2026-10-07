import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as identities from '../lib/catalogId.js';
import * as uuid from '../lib/uuid.js';
import * as mappers from '../backend/services/providers/brainzmashMappers.js';
import { normalizeDeezerAlbum } from '../backend/services/providers/catalogMerge.js';

test('actual HTTP handlers open Deezer-only releases and return provider track IDs', async () => {
 const album = normalizeDeezerAlbum({ id: 10, title: 'Album', artist: { id: 42, name: 'Airbag' }, nb_tracks: 1, tracks: { data: [{ id: 100, title: 'Track', duration: 180 }] } });
 let enrichCalls = 0;
 const source = fs.readFileSync(new URL('../backend/routes/artists/handlers/releaseGroup.js', import.meta.url), 'utf8');
 const module = new vm.SourceTextModule(source);
 await module.link((specifier) => {
  let exports;
  if (specifier.endsWith('catalogId.js')) exports = identities;
  else if (specifier.endsWith('uuid.js')) exports = uuid;
  else if (specifier.endsWith('brainzmashMappers.js')) exports = mappers;
  else if (specifier.endsWith('brainzmashProvider.js')) exports = { getArtistByMbid: async () => null, getAlbumByMbid: async () => album, getAlbumTracksByAlbumMbid: async () => album.releases[0].tracks };
  else if (specifier.endsWith('helpers/index.js')) exports = { dbOps: { getArtistOverride: () => null } };
  else if (specifier.endsWith('cache.js')) exports = { cacheMiddleware: () => () => {} };
  else if (specifier.endsWith('releaseGroupCoverService.js')) exports = { fetchReleaseGroupCoverUrl: async () => ({}), resolveReleaseGroupCoversBatch: async () => ({}) };
  else if (specifier.endsWith('apiClients/index.js')) exports = { enrichTracksWithDeezerPreviews: async () => { enrichCalls++; return []; } };
  else exports = { logger: { error: () => {} } };
  return new vm.SyntheticModule(Object.keys(exports), function () { for (const [key,value] of Object.entries(exports)) this.setExport(key,value); });
 });
 await module.evaluate();
 const handlers = new Map();
 module.namespace.registerReleaseGroup({ get: (path,...callbacks) => handlers.set(path,callbacks.at(-1)), post: () => {} });
 const call = async (path,id) => {
  const response = { statusCode: 200, status(code) { this.statusCode=code;return this; }, json(data) { this.body=data;return this; } };
  await handlers.get(path)({ params: { mbid:id }, query: {} },response); return response;
 };
 const details = await call('/release-group/:mbid','deezer:album:10');
 assert.equal(details.statusCode,200); assert.equal(details.body.id,'deezer:album:10');
 const tracks = await call('/release-group/:mbid/tracks','deezer:album:10');
 assert.equal(tracks.body[0].id,'deezer:track:100'); assert.equal(tracks.body[0].mbid,null); assert.equal(enrichCalls,0);
 assert.equal((await call('/release-group/:mbid','invalid')).statusCode,400);
});
