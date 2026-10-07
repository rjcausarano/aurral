import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import * as identities from '../lib/catalogId.js';

test('real scanner metadata logic preserves provider identity across rescans', () => {
 const source = fs.readFileSync(new URL('../backend/services/libraryFileScanner.js',import.meta.url),'utf8');
 const code = source.slice(0, source.indexOf('async function* walkAudioFiles')).replace(/^import[\s\S]*?;\n/gm, '').replace(/^export /gm, '');
 const context = vm.createContext({ ...identities, path, buildIdentityKey: (kind,id) => `${kind}:${id}`, buildFallbackIdentityKey: (...parts) => parts.join(':'), readCommentIdentity: () => null, parseAurralIdentityComment: value => value ? JSON.parse(value) : null, isVariousArtistsCredit: () => false });
 vm.runInContext(code+'\nglobalThis.scanRecord = (metadata) => buildMetadataRecord(applyMetadataEnrichment(metadata), "/music/Airbag/Album/01 Track.flac", "/music");',context);
 const record = context.scanRecord({ common: { albumartist:'Airbag', album:'Album', title:'Track', grouping: JSON.stringify({ artistMbid:'4d17e1e5-5fe8-461b-ab80-12364e430b67', albumMbid:'deezer:album:10', trackMbid:'deezer:track:100' }) }, format:{duration:180} });
 assert.equal(record.albumKey,'deezer:album:10'); assert.equal(record.trackKey,'deezer:track:100');
 assert.equal(record.albumMbid,null); assert.equal(record.releaseGroupMbid,null); assert.equal(record.trackMbid,null);
 assert.equal(record.albumMetadata.catalogId,'deezer:album:10'); assert.equal(record.trackMetadata.catalogId,'deezer:track:100');
 assert.equal(record.artistMbid,'4d17e1e5-5fe8-461b-ab80-12364e430b67');
 assert.equal(record.trackMetadata.tags.musicbrainz_trackid,undefined);
});
