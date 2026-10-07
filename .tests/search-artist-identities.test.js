import test from 'node:test';
import assert from 'node:assert/strict';
import { dedupeArtistsByName, buildUnifiedSuggestionSections } from '../frontend/src/utils/searchNavigation.js';
test('same-name bands retain distinct artist IDs',()=>{
 const artists=[{type:'artist',id:'argentina',name:'Airbag'},{type:'artist',id:'norway',name:'Airbag'},{type:'artist',id:'argentina',name:'Airbag'}];
 assert.deepEqual(dedupeArtistsByName(artists).map(a=>a.id),['argentina','norway']);
});
test('owned artists remain discoverable in the Artists section',()=>{
 const artist={type:'artist',id:'argentina',name:'Airbag'};
 const sections=buildUnifiedSuggestionSections({library:{artists:[artist]},catalog:{artists:[artist,{...artist,id:'norway'}]}});
 assert.deepEqual(sections.find(s=>s.key==='artists').items.map(a=>a.id),['argentina','norway']);
});
