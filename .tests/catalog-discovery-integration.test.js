import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as identities from '../lib/catalogId.js';
import * as mappers from '../backend/services/providers/brainzmashMappers.js';
import * as ranking from '../backend/services/providers/brainzmashRanking.js';
import * as merge from '../backend/services/providers/catalogMerge.js';
const id='4d17e1e5-5fe8-461b-ab80-12364e430b67';
const villagran='d687e1b3-bd4b-425f-8f3c-0aa5e7ffe5be';
const canonical={id,name:'Airbag',aliases:[],links:[{target:'https://www.deezer.com/artist/42'}],disambiguation:'Argentinian rock band',score:100};
async function loadProvider({ deezerFails = false } = {}){
 const errors=[];const supplements=[];
 const module=new vm.SourceTextModule(fs.readFileSync(new URL('../backend/services/providers/brainzmashProvider.js',import.meta.url),'utf8'));
 await module.link(async specifier=>{
  let exports={};
  if(specifier.endsWith('catalogId.js'))exports=identities;
  else if(specifier.endsWith('brainzmashMappers.js'))exports=mappers;
  else if(specifier.endsWith('brainzmashRanking.js'))exports=ranking;
  else if(specifier.endsWith('catalogMerge.js'))exports=merge;
  else if(specifier.endsWith('musicbrainzCatalogProvider.js'))exports={musicbrainzCatalog:{clear(){},searchArtists:async()=>[canonical,{...canonical,id:villagran,name:'Villagrán Bolaños'}],artist:async target=>({...canonical,id:target,name:target===villagran?'Villagrán Bolaños':'Airbag'}),artistAlbums:async()=>[{id,title:'Libertad',type:'Album',firstReleaseDate:'2013'}]}};
  else if(specifier.endsWith('deezerCatalogProvider.js'))exports={deezerCatalog:{clear(){},artistAlbums:async artist=>{supplements.push(artist);if(deezerFails)throw Error("Deezer unavailable");return[];}}};
  else if(specifier.endsWith('axiosFetch.js'))exports={default:{get:async url=>{if(url.endsWith('/search/artist'))return{data:[{id:'0d29a7e9-23aa-42f8-9863-0efce8653858',name:'Airbag',disambiguation:'Norwegian band'}]};throw Object.assign(Error('BrainzMash missing artist'),{response:{status:404}});}}};
  else if(specifier.endsWith('simpleCache.js'))exports={default:()=>{const map=new Map();return{set:(key,value)=>map.set(key,value),get:key=>map.get(key),getWithStale:()=>null,delete:key=>map.delete(key),flushAll:()=>map.clear()};}};
  else if(specifier.endsWith('rateLimiter.js'))exports={default:()=>({schedule:fn=>fn(8000)})};
  else if(specifier.endsWith('sharedInflight.js'))exports={runSharedInflight:(_map,_key,fn)=>fn(new AbortController().signal)};
  else if(specifier.endsWith('metadataProviderBudget.js'))exports={getMetadataProviderBudget:()=>({}),reserveMetadataProviderRequest:()=>0,setMetadataProviderCooldown(){}};
  else if(specifier.endsWith('helpers/index.js'))exports={dbOps:{getSettings:()=>({integrations:{metadata:{enableNarrowFallbacks:true,supplementDeezer:true}}}),getArtistOverride:()=>null}};
  else if(specifier.endsWith('constants.js'))exports={APP_NAME:'Aurral',APP_VERSION:'test',DEFAULT_METADATA_BASE_URL:'https://brainzmash.test'};
  else if(specifier.endsWith('logger.js'))exports={logger:{warn:(_category,message)=>errors.push(message)},safeLogDiagnostic:err=>err.message};
  else if(specifier.endsWith('imageService.js'))exports={selectBestAlbumImage:()=>null};
  else if(specifier==='node:timers/promises')exports=await import(specifier);
  else throw Error(`Unexpected dependency: ${specifier}`);
  return new vm.SyntheticModule(Object.keys(exports),function(){for(const[key,value]of Object.entries(exports))this.setExport(key,value);});
 });await module.evaluate();return{provider:module.namespace,supplements,errors};
}
test('artist search supplements a successful BrainzMash result with missing Argentinian Airbag and Villagran',async()=>{
 const {provider}=await loadProvider();const result=await provider.searchArtists('Airbag');assert.ok(result.items.some(artist=>artist.id===id));assert.ok(result.items.some(artist=>artist.disambiguation==='Norwegian band'));
 assert.ok((await provider.searchArtists('Villagran')).items.some(artist=>artist.id===villagran));
});
test('missing BrainzMash artist no longer blocks canonical discography or verified Deezer lookup',async()=>{
 const {provider,supplements}=await loadProvider();
 const artist=await provider.getArtistByMbid(id);assert.equal(artist.links[0].target,'https://www.deezer.com/artist/42');
 const albums=await provider.listArtistAlbums(id,{hydrateLimit:0});assert.equal(albums[0].title,'Libertad');assert.equal(supplements.length,1);assert.equal(supplements[0].id,id);
});

test('Deezer failure keeps canonical albums and emits a diagnostic',async()=>{
 const {provider,errors}=await loadProvider({deezerFails:true});
 const albums=await provider.listArtistAlbums(id,{hydrateLimit:0});
 assert.equal(albums[0].title,'Libertad');assert.ok(errors.includes('Deezer artist catalogue supplement failed'));
});
