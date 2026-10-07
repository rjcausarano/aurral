import test from 'node:test';
import assert from 'node:assert/strict';
import { createMusicBrainzCatalog } from '../backend/services/providers/musicbrainzCatalog.js';
const id = '4d17e1e5-5fe8-461b-ab80-12364e430b67';
test('canonical artist search preserves ambiguous bands and verifies Deezer relationships', async () => {
 const calls=[];
 const catalog=createMusicBrainzCatalog({ request: async (path, params) => {
  calls.push([path,params]);
  if(path==='/artist') return {artists:[{id,name:'Airbag',disambiguation:'Argentinian rock band',country:'AR',score:100}]};
  return {id,name:'Airbag',relations:[{'target-type':'url',type:'streaming',url:{resource:'https://www.deezer.com/artist/42'}}]};
 }});
 const result=await catalog.searchArtists('Airbag');assert.equal(result[0].id,id);assert.equal(result[0].country,'AR');assert.match(result[0].disambiguation,/Argentinian/);
 const artist=await catalog.artist(id);assert.equal(artist.links[0].target,'https://www.deezer.com/artist/42');
 artist.name='Changed';assert.equal((await catalog.artist(id)).name,'Airbag');
 await catalog.searchArtists('Villagrán Bolaños');assert.equal(calls.at(-1)[1].query,'Villagran Bolanos');
});
test('artist album browse paginates past the embedded MusicBrainz limit',async()=>{
 const catalog=createMusicBrainzCatalog({request:async(path,params)=>({'release-group-count':101,'release-groups':Array.from({length:params.offset?1:100},(_,i)=>({id:`album-${params.offset+i}`,title:`Album ${params.offset+i}`,'primary-type':'Album'}))})});
 const albums=await catalog.artistAlbums(id);assert.equal(albums.length,101);assert.equal(albums[100].artistId,id);
});
test('canonical-only albums open with genuine recording identities and disc positions',async()=>{
 const catalog=createMusicBrainzCatalog({request:async(path)=>path.startsWith('/release-group/')?{id,title:'Album','primary-type':'Album','artist-credit':[{artist:{id,name:'Airbag'}}],releases:[{id:'release-1',status:'Official'}]}:{id:'release-1',title:'Album',status:'Official',media:[{position:2,format:'CD',tracks:[{id:'track-1',position:1,title:'Song',recording:{id:'recording-1',length:180000}}]}]}});
 const album=await catalog.album(id);assert.equal(album.releases[0].tracks[0].recordingId,'recording-1');assert.equal(album.releases[0].tracks[0].mediumNumber,2);
 await assert.rejects(catalog.artist('deezer:artist:42'),/Invalid/);
});
