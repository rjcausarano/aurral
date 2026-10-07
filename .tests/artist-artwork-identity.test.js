import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
async function load(links=[]){
 let deezerCalls=0,overrideWrites=0;const cache=new Map([['other',{imageUrl:'wrong-airbag-image',images:[{image:'wrong-airbag-image'}]}]]);
 const module=new vm.SourceTextModule(fs.readFileSync(new URL('../backend/services/imageService.js',import.meta.url),'utf8'));
 await module.link(specifier=>{
  let exports;
  if(specifier.includes('helpers'))exports={dbOps:{getImage:id=>cache.get(id),setImage:(id,url,images)=>cache.set(id,{imageUrl:url,images}),deleteImage:id=>cache.delete(id),getArtistOverride:()=>null,setArtistOverride:()=>{overrideWrites++;},getDeezerMbidCache:()=>null,setDeezerMbidCache(){}}};
  else if(specifier.endsWith('imageProxyService.js'))exports={buildStableImageProxyUrl:url=>url};
  else if(specifier.endsWith('brainzmashProvider.js'))exports={getArtistByMbid:async()=>({id:'other',name:'The Airbags',images:[],links}),listArtistAlbums:async()=>[]};
  else if(specifier.endsWith('brainzmashMappers.js'))exports={getLinkedDeezerArtistId:items=>items[0]?.id||null};
  else exports={fetchDeezerArtistImageUrl:async()=>{deezerCalls++;return'correct-image';},fetchReleaseGroupCoverUrl:async()=>({}),LEGACY_COVER_HOST_PATTERN:/legacy-host/};
  return new vm.SyntheticModule(Object.keys(exports),function(){for(const[k,v]of Object.entries(exports))this.setExport(k,v);});
 });await module.evaluate();return{service:module.namespace,stats:()=>({deezerCalls,overrideWrites,cache})};
}
test('unverified same-name artwork is discarded without rewriting artist IDs',async()=>{
 const {service,stats}=await load();const image=await service.getArtistImage('other');assert.equal(image.url,null);assert.equal(stats().deezerCalls,0);assert.equal(stats().overrideWrites,0);
});
test('verified provider artwork replaces legacy cache and receives identity provenance',async()=>{
 const {service,stats}=await load([{id:'42'}]);const image=await service.getArtistImage('other');assert.equal(image.url,'correct-image');assert.equal(stats().deezerCalls,1);assert.equal(stats().cache.get('other').images[0].artistMbid,'other');assert.equal(stats().cache.get('other').images[0].identityVerified,true);
});
