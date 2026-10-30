'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const ROOT=path.join(__dirname,'..');
const storageJS=fs.readFileSync(path.join(ROOT,'storage.js'),'utf8');
const workerJS=fs.readFileSync(path.join(ROOT,'sw.js'),'utf8');
const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8');
const read=p=>fs.readFileSync(path.join(ROOT,p),'utf8');
function bootStorage(open){
  const timer={callback:null,delay:null,cancelled:false};
  const sandbox={
    window:{},
    indexedDB:{open},
    setTimeout(callback,delay){timer.callback=callback;timer.delay=delay;return 7},
    clearTimeout(id){assert.equal(id,7);timer.cancelled=true},
  };
  vm.runInNewContext(storageJS,sandbox,{filename:'storage.js'});
  return {MDStore:sandbox.window.MDStore,timer};
}
async function storageChecks(){
  {
    const req={};
    const h=bootStorage((name,version)=>{assert.equal(name,'md_market_pwa_v1');assert.equal(version,2);return req;});
    const task=h.MDStore.openDb();
    assert.equal(h.timer.delay,15000);
    const names=new Set(['records']),created=[];
    req.result={objectStoreNames:{contains:n=>names.has(n)},createObjectStore:(n)=>{created.push(n);names.add(n)}};
    req.onupgradeneeded();
    assert.deepEqual(created,['audits'],'upgrade must preserve existing records store');
    let closed=0;
    req.result={close(){closed++;}};
    req.onsuccess();
    await task;
    assert.equal(h.timer.cancelled,true);
    assert.equal(closed,0,'successful opening must return a live DB to caller');
  }
  {
    const req={};const h=bootStorage(()=>req),task=h.MDStore.openDb();
    req.onblocked();h.timer.callback();
    await assert.rejects(task,/別のタブまたはホーム画面アプリ/);
    let closed=0;req.result={close(){closed++;}};
    req.onsuccess();
    assert.equal(closed,1,'late success closes leaked DB connection');
  }
  {
    const req={};const h=bootStorage(()=>req),task=h.MDStore.openDb();
    h.timer.callback();await assert.rejects(task,/読み込みが長引いています/);
  }
  {
    const req={};const h=bootStorage(()=>req),task=h.MDStore.openDb();
    req.error=new Error('QuotaExceededError');req.onerror();
    await assert.rejects(task,/QuotaExceededError/);
  }
  {
    const h=bootStorage(()=>{throw new Error('SecurityError')});
    await assert.rejects(h.MDStore.openDb(),/SecurityError/);
  }
}
function workerHarness(){
  const handlers={},offline=Error('offline'),fail={kind:'asset-failure'},homepage={kind:'offline-home'};
  const calls=[];
  const sandbox={
    self:{
      location:{origin:'https://example.test'},
      registration:{scope:'https://example.test/md-market-intelligence/'},
      skipWaiting(){},clients:{claim(){}},
      addEventListener(name,callback){handlers[name]=callback}
    },
    URL,
    Response:{error:()=>fail},
    caches:{
      match:async value=>{calls.push(value);return value==='./index.html'?homepage:undefined;},
      open:async()=>({addAll:async()=>{},put:async()=>{}}),
      keys:async()=>[]
    },
    fetch:async()=>{throw offline;},
  };
  vm.runInNewContext(workerJS,sandbox,{filename:'sw.js'});
  async function request(mode,path){
    let result;
    const event={
      request:{method:'GET',url:'https://example.test/md-market-intelligence/'+path,mode},
      respondWith(p){result=p}
    };
    handlers.fetch(event);
    assert.ok(result,'service worker should respond to same-origin GET');
    return result;
  }
  return {request,fail,homepage,calls};
}
async function workerChecks(){
  const w=workerHarness();
  assert.equal(await w.request('cors','inventory-observations.js?v=2.0'),w.fail,'asset requests must not receive HTML on network failure');
  assert.equal(await w.request('navigate','index.html'),w.homepage,'navigation may use cached app shell');
}
function linkageChecks(){
  const sw=read('sw.js');
  for(const asset of [
    './storage.js?v=2.0.1','./app.js?v=2.0.1',
    './inventory-observations.js?v=2.0','./inventory-observations.css?v=2.0'
  ]){
    assert.ok(html.includes(asset),'HTML missing '+asset);
    assert.ok(sw.includes(asset),'SW missing '+asset);
  }
  assert.ok(sw.includes("event.request.mode==='navigate'"));
  assert.ok(!html.includes('src="./storage.js?v=1.6"'));
  assert.ok(!html.includes('src="./app.js?v=1.6"'));
  for(const id of ['inventory-panel','inventory-form','inventory-save','inventory-series','inventory-count','inventory-backup'])
    assert.ok(html.includes('id="'+id+'"'),'UI id missing '+id);
}
(async()=>{await storageChecks();await workerChecks();linkageChecks();console.log('PASS: IndexedDB blocked/stalled/rejected/late-success + SW offline & versioned PWA asset checks');})().catch(e=>{console.error(e);process.exitCode=1});
