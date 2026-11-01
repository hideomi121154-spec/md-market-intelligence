'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'offline-data.js'),'utf8');
async function testReader(){
  let networkCalls=0, cacheCalls=[];
  const cached={ok:true,json:async()=>({year:2025})};
  const context={
    module:{exports:{}},console,URL,
    navigator:{onLine:false},
    location:{href:'https://example.org/md-market-intelligence/',origin:'https://example.org'},
    caches:{match:async(url,opts)=>{cacheCalls.push({url,opts});return cached}},
    fetch:async()=>{networkCalls++;return {ok:true,status:200}}
  };
  context.globalThis=context;
  vm.runInNewContext(source,context);
  const api=context.module.exports;
  const loaded=await api.read('./data/kei_annual_history.json?cacheBust=111',{cache:'no-store'});
  assert.equal(loaded,cached);
  assert.equal(networkCalls,0,'Never attempt fetch() in airplane mode');
  assert.equal(cacheCalls.length,1);
  assert.equal(cacheCalls[0].url,'https://example.org/md-market-intelligence/data/kei_annual_history.json?cacheBust=111');
  assert.equal(cacheCalls[0].opts.ignoreSearch,true);
  cacheCalls=[];
  await assert.rejects(()=>api.read('https://other.org/track'),/外部URL/);
  assert.equal(networkCalls,0);
  context.caches.match=async()=>undefined;
  await assert.rejects(()=>api.read('./data/unknown.json'),/保存済みコピー/);
  assert.equal(networkCalls,0);
  context.navigator.onLine=true;
  await api.read('./data/model_sales.json?cb=23',{cache:'no-store'});
  assert.equal(networkCalls,1);
}
(async()=>{
 await testReader();
 const scripts=['uss.js','model-sales.js','registered-sales.js','demand-signals.js'];
 const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
 const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
 assert.ok(index.indexOf('offline-data.js?v=2.0.3')<index.indexOf('uss.js?v=2.0.3'),'offline helper must execute before statistics');
 assert.ok(index.includes('<b>v3.2.0</b>'));
 assert.ok(sw.includes('md-market-pwa-v4-2-0-20261101'));
 assert.ok(sw.includes("'./offline-data.js?v=2.0.3'"),'offline helper must be precached');
 for(const script of scripts){
  const code=fs.readFileSync(path.join(root,script),'utf8');
  assert.ok(code.includes('await MDOffline.read('),'cached read must be used for '+script);
  assert.ok(!code.includes('await fetch('),'network-only read remains in '+script);
  assert.ok(index.includes('./'+script+'?v=2.0.3'),'script version must be updated: '+script);
  assert.ok(sw.includes("'./"+script+"?v=2.0.3'"),'script cache version mismatch: '+script);
 }
 for(const script of ['kei-history.js','registered-history.js']){
  const source=fs.readFileSync(path.join(root,script),'utf8');
  assert.ok(source.includes('await MDOffline.read('));
  assert.ok(index.includes('./'+script+'?v=3.4.0'));
  assert.ok(sw.includes("'./"+script+"?v=3.4.0'"));
 }
 assert.ok(index.includes('history-trend.js?v=3.4.0') && sw.includes("'./history-trend.js?v=3.4.0'"));
 assert.ok(index.includes('history-fold.css?v=3.4.0') && sw.includes("'./history-fold.css?v=3.4.0'"));
 assert.ok(index.includes('md-evidence.js?v=3.6.0')&&sw.includes("'./md-evidence.js?v=3.6.0'"));
 assert.ok(index.includes('model-price-report.js?v=2.3.0')&&sw.includes("'./model-price-report.js?v=2.3.0'"));
 assert.ok(index.includes('personal-car.js?v=2.5.0')&&sw.includes("'./personal-car.js?v=2.5.0'"));
 // The backup hotfix and inventory must survive this patch.
 assert.ok(index.includes('id="backup-share"')&&index.includes('id="inventory-panel"'));
 console.log('PASS offline no-network reader, version agreement, backups and inventory feature preservation');
})().catch(e=>{console.error(e);process.exitCode=1});
