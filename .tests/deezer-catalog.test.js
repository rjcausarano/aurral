import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeezerCatalog, normalizeDeezerAlbum, sameCatalogRelease, mergeCatalogAlbums } from '../backend/services/providers/catalogMerge.js';
import { musicbrainzId, parseDeezerId, albumCatalogId, trackCatalogId } from '../lib/catalogId.js';
const mbid = '4d17e1e5-5fe8-461b-ab80-12364e430b67';
const artist = { id: mbid, name: 'Airbag', links: [] };
const raw = (id = 10, title = 'Blanco y negro') => ({ id, title, artist: { id: 42, name: 'Airbag' }, nb_tracks: 2, record_type: 'album', release_date: '2021-01-01', tracks: { data: [{ id: 100, title: 'One', duration: 180 }, { id: 101, title: 'Two', duration: 200 }] } });
const album = () => ({ ...normalizeDeezerAlbum(raw()), artistId: mbid });
test('provider identities never become MusicBrainz IDs', () => {
 const a = normalizeDeezerAlbum(raw());
 assert.equal(a.id, 'deezer:album:10'); assert.equal(parseDeezerId(a.id), '10');
 assert.equal(musicbrainzId(a.id), null); assert.equal(musicbrainzId(mbid), mbid);
 assert.equal(a.releases[0].tracks[0].recordingId, null);
 assert.equal(albumCatalogId({ metadata: { catalogId: a.id } }), a.id);
 assert.equal(trackCatalogId({ metadata: { catalogId: 'deezer:track:100' } }), 'deezer:track:100');
 assert.throws(() => normalizeDeezerAlbum({ ...raw(), nb_tracks: 3 }), /incomplete/);
});
test('names alone cannot match Airbag; two unique album titles can', async () => {
 let calls = 0;
 const catalog = createDeezerCatalog({ request: async (path) => {
  calls++; if (path === '/search/artist') return { data: [{ id: 42, name: 'Airbag' }, { id: 55, name: 'Airbag' }] };
  return { data: path.includes('/42/') ? [{ title: 'Blanco y negro' }, { title: 'Mentira la verdad' }] : [{ title: 'Identity' }] };
 } });
 assert.equal(await catalog.resolveArtist(artist), null); assert.equal(calls, 0);
 assert.equal(await catalog.resolveArtist(artist, { knownAlbums: [{ title: 'Blanco y negro' }, { title: 'Mentira la verdad' }] }), '42');
});
test('ambiguous album evidence is rejected and overrides validate returned identity', async () => {
 const catalog = createDeezerCatalog({ request: async (path) => path === '/search/artist' ? { data: [{ id: 42, name: 'Airbag' }, { id: 55, name: 'Airbag' }] } : path.startsWith('/artist/') && !path.endsWith('/albums') ? { id: 42 } : { data: [{ title: 'A' }, { title: 'B' }] } });
 assert.equal(await catalog.resolveArtist(artist, { knownAlbums: [{ title: 'A' }, { title: 'B' }] }), null);
 assert.equal(await catalog.resolveArtist(artist, { overrideId: 55 }), null);
 assert.equal(await catalog.resolveArtist(artist, { overrideId: 42 }), '42');
});
test('full album and track pagination, cached copies and owner checks', async () => {
 const catalog = createDeezerCatalog({ request: async (path, params) => {
  if (path === '/artist/42') return { id: 42 };
  if (path === '/artist/42/albums') return params.index ? { data: [{ id: 11 }] } : { data: [{ id: 10 }], next: 'https://api.deezer.com/artist/42/albums?index=100' };
  if (path === '/album/10/tracks') return params.index ? { data: [raw().tracks.data[1]] } : { data: [raw().tracks.data[0]], next: 'https://api.deezer.com/album/10/tracks?index=100' };
  if (path === '/album/10') return { ...raw(), tracks: { data: [], next: 'https://api.deezer.com/album/10/tracks?index=100' } };
  return { ...raw(11), artist: { id: 55, name: 'Airbag' } };
 } });
 const items = await catalog.artistAlbums(artist, { overrideId: 42 });
 assert.equal(items.length, 1); assert.equal(items[0].artistId, mbid); assert.equal(items[0].trackCount, 2);
 items[0].title = 'changed'; assert.equal((await catalog.album(10)).title, 'Blanco y negro');
});
test('foreign pagination and album identity mismatch are rejected', async () => {
 const bad = createDeezerCatalog({ request: async (path) => path === '/artist/42' ? { id: 42 } : { data: [], next: 'https://example.com/artist/42/albums?index=100' } });
 await assert.rejects(bad.artistAlbums(artist, { overrideId: 42 }), /pagination/);
 await assert.rejects(createDeezerCatalog({ request: async () => raw(11) }).album(10), /different album/);
});
test('deduplication uses artist, title, date, track order and duration', async () => {
 const a = album(); const details = { ...a, tracks: a.releases[0].tracks };
 assert.equal(sameCatalogRelease(details, { ...details }), true);
 for (const change of [{ artistId: 'other' }, { title: 'Blanco y negro (Deluxe)' }, { tracks: details.tracks.map((track,index) => ({...track,title:details.tracks[1-index].title})) }, { tracks: [{ ...details.tracks[0], durationMs: 210000 }, details.tracks[1]] }]) assert.equal(sameCatalogRelease(details, { ...details, ...change }), false);
 const merged = await mergeCatalogAlbums([{ id: mbid, artistId: mbid, title: a.title, type: 'Album' }], [a], { loadPrimary: async () => ({ ...a, id: mbid }), selectRelease: value => value.releases[0] });
 assert.equal(merged.length, 1); assert.equal(merged[0].id, mbid); assert.deepEqual(merged[0].metadataSources, ['brainzmash', 'deezer']);
 const failed = await mergeCatalogAlbums([{ id: mbid, artistId: mbid, title: a.title, type: 'Album' }], [a], { loadPrimary: async () => { throw Error('offline'); }, selectRelease: value => value.releases[0] });
 assert.equal(failed.length, 2);
});

test('digital reissue dates merge when artist, title and ordered tracks agree', async () => {
 const a = album(), original = { ...a, id: mbid, releaseDate: '2006-01-01' };
 const merged = await mergeCatalogAlbums([original], [{ ...a, releaseDate:'2024-01-01' }], { loadPrimary:async()=>original, selectRelease:value=>value.releases[0] });
 assert.equal(merged.length,1);assert.equal(merged[0].id,mbid);assert.equal(merged[0].providerReleaseDates.deezer,'2024-01-01');
});
test('a matching official pressing merges even when selected pressing has bonus tracks',async()=>{
 const a=album(), standard=a.releases[0], bonus={...standard,tracks:[...standard.tracks,{title:'Bonus',durationMs:100000}]};
 const original={...a,id:mbid,releases:[bonus,standard]};
 const merged=await mergeCatalogAlbums([original],[a],{loadPrimary:async()=>original,selectRelease:value=>value.releases[0]});
 assert.equal(merged.length,1);
});
test('live suffix formatting matches only within a live album',()=>{
 const a=album(), left={...a,title:'Airbag - En vivo Estadio Vélez',tracks:a.releases[0].tracks};
 assert.equal(sameCatalogRelease(left,{...left,tracks:left.tracks.map(track=>({...track,title:track.title+' (En Vivo)'}))}),true);
 assert.equal(sameCatalogRelease({...left,title:'Album'},{...left,title:'Album',tracks:left.tracks.map(track=>({...track,title:track.title+' (En Vivo)'}))}),false);
});

test('reported Airbag differences merge with corroborated ordered track lists', () => {
 const tracks = count => Array.from({length:count},(_,index)=>({title:`Song ${index+1}`,trackPosition:index+1,durationMs:180000}));
 const compare = (title,count,changes) => {
  const left={artistId:mbid,title,type:'Album',tracks:tracks(count)};
  for(const [index,name] of changes.names||[])left.tracks[index].title=name;
  const right={...left,tracks:left.tracks.map(track=>({...track}))};
  for(const[index,name]of changes.rightNames||[])right.tracks[index].title=name;
  for(const[index,delta]of changes.deltas||[])right.tracks[index].durationMs+=delta;
  return sameCatalogRelease(left,right);
 };
 assert.equal(compare('Blanco y Negro',11,{deltas:[[0,-4000]]}),true);
 assert.equal(compare('Libertad',15,{deltas:[[1,-3946],[7,-4080],[10,4480],[13,-3586]]}),true);
 assert.equal(compare('Vorágine',12,{names:[[1,'Donde vas (Viaje nocturno)']],rightNames:[[1,'Donde Vas']],deltas:[[1,-80]]}),true);
 assert.equal(compare('Mentira la verdad',11,{names:[[7,'Primavera']],rightNames:[[7,'Primavera 2001']],deltas:[[7,-2733],[8,-3066]]}),true);
});
test('subtitle tolerance rejects distinct versions, excessive changes and weak evidence', () => {
 const tracks=Array.from({length:11},(_,index)=>({title:`Song ${index+1}`,durationMs:180000,trackPosition:index+1}));
 const left={artistId:mbid,title:'Album',type:'Album',tracks};
 const changed = changes => ({...left,tracks:tracks.map((track,index)=>({...track,...changes[index]}))});
 for(const suffix of ['(Remix)','(Live)','(Radio Edit)','(Acoustic)','(Versión instrumental)'])assert.equal(sameCatalogRelease(left,changed({0:{title:'Song 1 '+suffix}})),false);
 assert.equal(sameCatalogRelease(left,changed({0:{title:'Song 1 2001'},1:{title:'Song 2 2001'}})),false);
 assert.equal(sameCatalogRelease(left,changed({0:{title:'Song 1 2001',durationMs:null}})),false);
 assert.equal(sameCatalogRelease(left,changed({0:{durationMs:185001}})),false);
 assert.equal(sameCatalogRelease(left,changed({0:{title:'Other song'}})),false);
});
