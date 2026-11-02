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
  // Consumer dashboard must be the initial screen while preserving the old market tab.
  await page.locator('#mycar').waitFor({state:'visible'});
  assert.match(await page.locator('#page-title').innerText(),/マイカー/);
  await page.locator('#mycar-make').fill('日産');
  await page.locator('#mycar-model').fill('デイズ');
  await page.locator('#mycar-grade').fill('X');
  await page.locator('#mycar-year').fill('2021');
  await page.locator('#mycar-mileage').fill('43000');
  await page.locator('#mycar-color').fill('白');
  await page.locator('#mycar-repair').selectOption('none');
  await page.locator('#mycar-save-car').click();
  assert.equal(await page.locator('#mycar-selector option').count(),1);
  assert.match(await page.locator('#mycar-summary').innerText(),/デイズ/);
  await page.locator('#mycar-type').selectOption('estimate');
  await page.locator('#mycar-price').fill('700000');
  await page.locator('#mycar-source').fill('ガリバーの無料相場');
  await page.locator('#mycar-source-url').fill('https://221616.com/satei/souba/');
  await page.locator('#mycar-date').fill('2026-10-31');
  await page.locator('#mycar-save-quote').click();
  assert.match(await page.locator('#mycar-estimate').innerText(),/700,000円/);
  await page.locator('#mycar-type').selectOption('offer');
  await page.locator('#mycar-price').fill('850000');
  await page.locator('#mycar-source').fill('地域の買取店');
  await page.locator('#mycar-source-url').fill('');
  await page.locator('#mycar-save-quote').click();
  assert.match(await page.locator('#mycar-offer').innerText(),/850,000円/);
  assert.match(await page.locator('#mycar-estimate').innerText(),/700,000円/);
  assert.equal(await page.locator('#mycar-quote-rows tr').count(),2);
  await page.locator('#mycar-export').click();
  const personalBackup=await page.locator('#mycar-backup').inputValue();
  assert.equal(JSON.parse(personalBackup).cars.length,1);
  assert.equal(JSON.parse(personalBackup).quotes.length,2);
  await page.locator('#mycar-backup').fill(personalBackup);
  await page.locator('#mycar-restore').click();
  assert.match(await page.locator('#mycar-status').innerText(),/車両0台、金額0件/);
  const broken=JSON.parse(personalBackup);
  broken.quotes[0].price=999999;
  await page.locator('#mycar-backup').fill(JSON.stringify(broken));
  await page.locator('#mycar-restore').click();
  assert.match(await page.locator('#mycar-status').innerText(),/上書きしません/);
  assert.equal(JSON.parse(await page.evaluate(()=>localStorage.getItem('md-market-consumer-price-v1'))).quotes[0].price,700000);
  await page.locator('a[data-tab="overview"]').click();
  const marketFolds=['demand-signals-panel','uss-aggregate','registered-sales-panel','model-sales-panel',
    'inventory-panel','observation-watch-panel','model-price-panel','md-evidence-panel',
    'regional-jobs-panel','prefecture-jobs-panel','rm-panel','rr-panel',
    'registered-history-panel','kei-history-panel'];
  for(const id of marketFolds){
    assert.equal(await page.locator('#'+id).evaluate(el=>el.open),false,'must start collapsed: '+id);
  }
  // World export monitor: native iPhone-sized selectors and no invented model demand.
  assert.equal(await page.locator('#export-model-panel').evaluate(el=>el.open),false);
  await page.locator('#export-model-panel > summary').click();
  await page.waitForFunction(()=>document.querySelector('#export-model-status').textContent.includes('未取得'));
  assert.ok(await page.locator('#export-model-country option').count()>=55);
  assert.ok(await page.locator('#export-model-make option').count()>=9);
  await page.locator('#export-model-country').selectOption('ニュージーランド');
  await page.locator('#export-model-make').selectOption('ホンダ');
  await page.locator('#export-model-model').selectOption('N-BOX');
  assert.match(await page.locator('#export-model-results').innerText(),/国内新車登録台数/);
  assert.match(await page.locator('#export-model-results').innerText(),/車種名まで一致した公式/);
  await page.locator('#export-model-country').selectOption('オーストラリア');
  assert.match(await page.locator('#export-model-results').innerText(),/未収録/);
  await page.locator('#export-model-country').selectOption('ロシア');
  await page.locator('#export-model-make').selectOption('トヨタ');
  await page.locator('#export-model-model').selectOption('ヤリス');
  assert.match(await page.locator('#export-model-results').innerText(),/186,585台/);
  await page.waitForFunction(()=>document.querySelector('#export-evidence-results')?.textContent.includes('国別全車種'));
  assert.equal(await page.locator('#export-evidence-mode option').count(),3);
  await page.locator('#export-evidence-mode').selectOption('recorded');
  assert.match(await page.locator('#export-evidence-results').innerText(),/本人記録はありません/);
  await page.locator('#export-evidence-mode').selectOption('all');
  assert.equal(await page.locator('#export-evidence-results .gm-compare-table tbody tr').count(),55);
  await page.locator('#export-evidence-mode').selectOption('top10');
  assert.equal(await page.locator('#export-evidence-results .gm-compare-table tbody tr').count(),10);
  assert.match(await page.locator('#export-evidence-results').innerText(),/掲載価格/);

  assert.match(await page.locator('#export-model-results').innerText(),/未取得/);
  
  // Verified 47-prefecture new-job-offer data must not be confused with paid job ads.
  await page.locator('#prefecture-jobs-panel > summary').click();
  await page.waitForFunction(()=>!document.querySelector('#prefecture-jobs-status').textContent.includes('確認しています'));
  assert.equal(await page.locator('#prefecture-jobs-data-source option').count(),2);
  const officialReady=await page.locator('#prefecture-jobs-month option').count()>0;
  if(officialReady){
    await page.locator('#prefecture-jobs-month').selectOption('2026-09');
    await page.locator('#prefecture-jobs-pref').selectOption('愛知県');
    await page.locator('#prefecture-jobs-basis').selectOption('yoy');
    assert.equal(await page.locator('#prefecture-jobs-rows > li').count(),47);
    assert.equal(await page.locator('#prefecture-jobs-trend svg').count(),1);
    assert.match(await page.locator('#prefecture-jobs-selected').innerText(),/愛知県/);
    assert.match(await page.locator('#prefecture-jobs-source').innerText(),/公式Excel検証済み/);
  }else{
    assert.match(await page.locator('#prefecture-jobs-status').innerText(),/未取得/);
  }

  await page.locator('#md-evidence-jump').click();
  assert.equal(await page.locator('#md-evidence-panel').evaluate(el=>el.open),true,
    'MD shortcut must open its destination');
  for(const id of ['model-price-panel','inventory-panel','observation-watch-panel']){
    await page.locator('#'+id+' > summary').click();
    assert.equal(await page.locator('#'+id).evaluate(el=>el.open),true,'tap opens '+id);
  }
  await page.locator('#inventory-summary').waitFor();
  // Local-only monthly publication transcriptions; all values are synthetic test fixtures.
  await page.locator('#model-price-month').fill('2026-08');
  await page.locator('#model-price-make').fill('日産');
  await page.locator('#model-price-model').fill('デイズ');
  await page.locator('#model-price-scope').fill('B4系');
  await page.locator('#model-price-amount').fill('145.3');
  await page.locator('#model-price-count').fill('1300');
  await page.locator('#model-price-checked').fill('2026-10-31');
  await page.locator('#model-price-save').click();
  await page.waitForFunction(()=>document.querySelector('#model-price-summary').textContent.includes('145.3万円'));
  await page.locator('#model-price-month').fill('2026-09');
  await page.locator('#model-price-amount').fill('151.0');
  await page.locator('#model-price-count').fill('1450');
  await page.locator('#model-price-save').click();
  await page.waitForFunction(()=>document.querySelector('#model-price-summary').textContent.includes('前月比較'));
  assert.equal(await page.locator('#model-price-rows tr').count(),2);
  assert.equal(await page.locator('#model-price-chart svg circle').count(),2);
  assert.equal(await page.locator('#model-volume-chart svg circle').count(),2);
  await page.locator('.model-price-backup summary').click();
  await page.locator('#model-price-export').click();
  const priceBackup=await page.locator('#model-price-backup').inputValue();
  assert.equal(JSON.parse(priceBackup).records.length,2);
  await page.locator('#model-price-backup').fill(priceBackup);
  await page.locator('#model-price-restore').click();
  assert.match(await page.locator('#model-price-status').innerText(),/0件を追加復元/);
  await page.locator('#model-price-backup').fill('not-json');
  await page.locator('#model-price-restore').click();
  assert.match(await page.locator('#model-price-status').innerText(),/復元できません/);
  await page.locator('#model-price-backup').fill(priceBackup);

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
  assert.match(await page.locator('#md-evidence-verdict').innerText(),/仕入れ判断は保留/);
  await page.waitForFunction(()=>document.querySelector('#md-evidence-supply').textContent.includes('比較保留'));
  assert.match(await page.locator('#md-evidence-supply').innerText(),/比較保留/);
  assert.match(await page.locator('#observation-watch-summary').innerText(),/確認・追加観測が必要/);
  assert.match(await page.locator('#observation-watch-rows').innerText(),/停止期間をまたぐ比較不可/);
  assert.match(await page.locator('#md-evidence-demand').innerText(),/収録順位なし/);
  assert.match(await page.locator('#md-evidence-price').innerText(),/0件/);
  await page.locator('#md-evidence-jump').click();
  await page.locator('#md-evidence-panel').waitFor();
  // Risk sensitivity is hypothetical and must not use imported unverified vehicle prices.
  await page.locator('a[data-tab="plan"]').click();
  await page.locator('#risk-rows tr').first().waitFor();
  assert.equal(await page.locator('#risk-rows tr').count(),3);
  assert.match(await page.locator('#risk-rows tr').first().innerText(),/30日/);
  assert.match(await page.locator('#risk-status').innerText(),/架空の条件/);
  const initial=await page.locator('#risk-rows tr').first().innerText();
  await page.locator('#risk-daily').fill('1300');
  const after=await page.locator('#risk-rows tr').first().innerText();
  assert.notEqual(initial,after,'additional daily cost must update sensitivity');
  await page.locator('#risk-markdown').fill('');
  assert.match(await page.locator('#risk-status').innerText(),/試算を表示できません/);
  await page.locator('#risk-markdown').fill('1.5');
  await page.locator('#risk-note-show').click();
  assert.match(await page.locator('#risk-summary').inputValue(),/実相場ではない/);
  await page.locator('#risk-reset').click();
  assert.equal(await page.locator('#risk-daily').inputValue(),'300');
  assert.equal(await page.locator('#risk-markdown').inputValue(),'1.5');



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
  await page.locator('a[data-tab="overview"]').click();
  for(const id of ['md-evidence-panel','inventory-panel','observation-watch-panel']){
    await page.locator('#'+id+' > summary').click();
  }
  assert.match(await page.locator('#md-evidence-verdict').innerText(),/仕入れ判断は保留/);
  assert.match(await page.locator('#md-evidence-price').innerText(),/0件/,'unverified imported listing must not count');
  const saved=await page.evaluate(()=>({
   inventory:JSON.parse(localStorage.getItem('md-market-inventory-snapshots-v1')||'[]'),
   dbName:'md_market_pwa_v1'
  }));
  assert.equal(saved.inventory.length,2,'inventory snapshots must persist separately');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('md-market-consumer-price-v1')).cars.length),1,'consumer profile saved separately after reload');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('md-market-consumer-price-v1')).quotes.length),2,'two kinds of prices remain after reload');
  assert.equal(await page.locator('#model-price-rows tr').count(),2,'public-model monthly records persist on reload');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('md-market-model-price-monthly-v1')).length),2);


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
  assert.match(await page.locator('#observation-watch-summary').innerText(),/2条件/);
  await page.locator('#observation-watch-filter').selectOption('review');
  assert.equal(await page.locator('#observation-watch-rows tr').count(),2);
  await page.locator('#observation-watch-filter').selectOption('all');
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
      const response=await caches.match('./inventory-observations.js?v=2.1.0');
      return {ok:!!response,body:response?await response.text():''};
    });
    assert.equal(cached.ok,true,'WebKit must store the application asset in CacheStorage');
    assert.match(cached.body,/md-market-inventory-snapshots-v1/);
    const personalCache=await page.evaluate(()=>caches.match('./personal-car.js?v=2.5.0').then(Boolean));
    assert.equal(personalCache,true,'iPhone offline shell must cache personal car UI');
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
