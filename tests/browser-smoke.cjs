'use strict';
/* E2E smoke test for a clean, temporary Chromium context; never touches user data. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium,webkit}=require('playwright');

const ROOT=path.resolve(__dirname,'..');
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8',
 '.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8',
 '.webmanifest':'application/manifest+json; charset=utf-8',
 '.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
const server=http.createServer((req,res)=>{
 let pathname;
 try{pathname=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname)}
 catch{res.writeHead(400).end();return}
 const rel=pathname==='/'?'index.html':pathname.replace(/^\/+/,'');
 const file=path.resolve(ROOT,rel);
 if(file!==ROOT&&!file.startsWith(ROOT+path.sep)){res.writeHead(403).end();return;}
 fs.stat(file,(err,stat)=>{
  if(err||!stat.isFile()){res.writeHead(404).end('not found');return}
  res.setHeader('Content-Type',MIME[path.extname(file)]||'application/octet-stream');
  fs.createReadStream(file).pipe(res);
 });
});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function run(){
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const origin='http://127.0.0.1:'+server.address().port;
 const engine=process.env.BROWSER_ENGINE==='webkit'?'webkit':'chromium';
 const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true});
 const context=await browser.newContext({
  viewport:{width:390,height:844},deviceScaleFactor:3,
  hasTouch:true,isMobile:true,acceptDownloads:true,serviceWorkers:'allow'
 });
 const page=await context.newPage();
 const pageErrors=[];
 page.on('pageerror',e=>pageErrors.push(e.message));
 const src='https://www.carsensor.net/used/search?model=days';
 try{
  await page.goto(origin+'/',{waitUntil:'domcontentloaded'});
  await page.locator('#inventory-summary').waitFor();
  await page.locator('#inventory-date').fill('2026-10-01');
  await page.locator('#inventory-make').fill('日産');
  await page.locator('#inventory-model').fill('デイズ');
  await page.locator('#inventory-region').fill('全国');
  await page.locator('#inventory-color').fill('赤');
  await page.locator('#inventory-conditions').fill('2020〜2023年・5万km以下');
  await page.locator('#inventory-count').fill('1200');
  await page.locator('#inventory-url').fill(src);
  await page.locator('#inventory-save').click();
  await page.waitForFunction(()=>document.querySelector('#inventory-summary').textContent.includes('1,200台'));
  await page.locator('#inventory-date').fill('2026-10-30');
  await page.locator('#inventory-count').fill('1450');
  await page.locator('#inventory-save').click();
  await page.waitForFunction(()=>document.querySelector('#inventory-summary').textContent.includes('+20.8%'));
  assert.match(await page.locator('#inventory-summary').innerText(),/\+250台/);

  // The legacy private vehicle store and new inventory count must survive reload.
  page.on('dialog',dialog=>dialog.accept());
  await page.locator('a[data-tab="import"]').click();
  await page.locator('#paste-data').fill(
   'date,make,model,price_jpy,channel,market_type,source_url\n'+
   '2026-10-30,日産,デイズ,500000,retail,retail_listing,https://www.carsensor.net/used/detail/fixture\n');
  await page.locator('#paste-import').click();
  await page.waitForFunction(()=>document.querySelector('#count-all').textContent==='1');
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#count-all').textContent==='1');
  const saved=await page.evaluate(()=>({
   inventory:JSON.parse(localStorage.getItem('md-market-inventory-snapshots-v1')||'[]'),
   dbName:'md_market_pwa_v1'
  }));
  assert.equal(saved.inventory.length,2,'inventory snapshots must persist separately');

  await page.locator('a[data-tab="overview"]').click();
  assert.match(await page.locator('#inventory-summary').innerText(),/\+20.8%/);
  // Backup and restore are additive and must never overwrite existing records.
  await page.locator('.inventory-backup-area summary').click();
  await page.locator('#inventory-export').click();
  const backup=await page.locator('#inventory-backup').inputValue();
  assert.equal(JSON.parse(backup).records.length,2);
  const conflict=JSON.parse(backup);
  conflict.records[1].count=999;
  await page.locator('#inventory-backup').fill(JSON.stringify(conflict));
  await page.locator('#inventory-restore').click();
  assert.match(await page.locator('#inventory-status').innerText(),/上書きしません/);
  assert.equal((await page.evaluate(()=>JSON.parse(localStorage.getItem('md-market-inventory-snapshots-v1'))))[1].count,1450);
  await page.locator('#inventory-backup').fill(backup);
  await page.locator('#inventory-restore').click();
  assert.match(await page.locator('#inventory-status').innerText(),/0件を追加復元/);

  // Reload does not preserve unsaved form inputs; enter required criteria again.
  // Same car in another region must be an independent time series.
  await page.locator('#inventory-date').fill('2026-10-30');
  await page.locator('#inventory-make').fill('日産');
  await page.locator('#inventory-model').fill('デイズ');
  await page.locator('#inventory-region').fill('愛知県');
  await page.locator('#inventory-color').fill('赤');
  await page.locator('#inventory-conditions').fill('2020〜2023年・5万km以下');
  await page.locator('#inventory-url').fill(src);
  await page.locator('#inventory-count').fill('990');
  await page.locator('#inventory-save').click();
  assert.match(await page.locator('#inventory-status').innerText(),/保存しました/);
  assert.match(await page.locator('#inventory-summary').innerText(),/比較用の2件目/);
  assert.equal(await page.locator('#inventory-series option').count(),2);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('md-market-inventory-snapshots-v1')).length),3);

  // Offline navigation: only test after service worker controls this page.
  await page.evaluate(()=>navigator.serviceWorker.ready);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>!!navigator.serviceWorker?.controller,{timeout:15000});
  await context.setOffline(true);
  if(engine==='webkit'){
    // Playwright/Linux WebKit's simulated offline mode gives "internal error"
    // on navigation and "Load failed" on fetch. Verify that the SW persisted
    // the asset in CacheStorage; offline delivery requires a real iOS check.
    const cached=await page.evaluate(async()=>{
      const response=await caches.match('./inventory-observations.js?v=2.0');
      return {ok:!!response,body:response?await response.text():''};
    });
    assert.equal(cached.ok,true,'WebKit must store the application asset in CacheStorage');
    assert.match(cached.body,/md-market-inventory-snapshots-v1/);
  }else{
    await page.reload({waitUntil:'domcontentloaded',timeout:15000});
    await page.waitForFunction(()=>document.querySelector('#count-all').textContent==='1');
    assert.equal(await page.locator('#inventory-series option').count(),2);
  }
  await context.setOffline(false);
  assert.deepEqual(pageErrors,[],'page should have no uncaught JavaScript errors');
  console.log('PASS ['+engine+']: mobile form, 2-date trend, IndexedDB persistence, backup, region scope, SW offline '+(engine==='webkit'?'cached asset presence (offline delivery not tested)':'reload'));
 } finally {
  await context.setOffline(false).catch(()=>{});
  await browser.close();
  await new Promise(resolve=>server.close(resolve));
 }
}
run().catch(e=>{console.error(e);process.exitCode=1;});
