/* Paste import codec regression test (Node 22) */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const zlib=require('node:zlib');
const env={window:{},URL,console,DecompressionStream,Blob,Response,TextEncoder,atob};
vm.runInNewContext(fs.readFileSync(__dirname+'/storage.js','utf8'),env);
const store=env.window.MDStore;
const csv='date,make,model,price_jpy,channel,market_type,source_url\n2026-10-26,トヨタ,プリウス,1000000,auction,consumer_auction,https://example.com/1\n';
const gzip=zlib.gzipSync(Buffer.from(csv,'utf8'));
const code='MDGZ1:'+gzip.toString('base64url');
(async()=>{
  assert.equal(await store.decodeImportText(code),csv);
  assert.equal((await store.decodeImportText(csv)),csv.trim());
  assert.equal(store.readRecords(await store.decodeImportText(code)).records.length,1);
  await assert.rejects(store.decodeImportText('MDGZ1:invalid!'));
  console.log('PASS: iPhone CSV paste import decode, text fallback, invalid-code guard');
})().catch(e=>{console.error(e);process.exitCode=1});