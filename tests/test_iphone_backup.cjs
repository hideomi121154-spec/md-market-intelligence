'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..');
const engine=process.env.BROWSER_ENGINE==='webkit'?'webkit':'chromium';
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.webmanifest':'application/manifest+json'};
const server=http.createServer((req,res)=>{
 const pathname=new URL(req.url,'http://127.0.0.1').pathname;
 const file=path.resolve(root,decodeURIComponent(pathname==='/'?'index.html':pathname.replace(/^\/+/,'')));
 if(file!==root&&!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.stat(file,(err,stat)=>{
  if(err||!stat.isFile()){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');
  fs.createReadStream(file).pipe(res);
 });
});
async function main(){
 await new Promise(done=>server.listen(0,'127.0.0.1',done));
 const browser=await (engine==='webkit'?webkit:chromium).launch({headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true,acceptDownloads:true});
 const page=await context.newPage();const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('dialog',d=>d.accept());
 try{
  await page.goto('http://127.0.0.1:'+server.address().port+'/',{waitUntil:'domcontentloaded'});
  await page.locator('a[data-tab="import"]').click();
  await page.locator('#backup-text-generate').click();
  await page.waitForFunction(()=>document.querySelector('#backup-status').textContent.includes('0件'));
  assert.match(await page.locator('#backup-status').innerText(),/Safari版とホーム画面版/);
  const csv='date,make,model,price_jpy,channel,market_type,source_url\n'+
   '2026-10-30,日産,デイズ,500000,retail,retail_listing,https://www.carsensor.net/used/detail/fixture\n';
  await page.locator('#paste-data').fill(csv);
  await page.locator('#paste-import').click();
  await page.waitForFunction(()=>document.querySelector('#count-all').textContent==='1');
  await page.locator('#backup-text-generate').click();
  await page.waitForFunction(()=>document.querySelector('#backup-status').textContent.includes('1件'));
  const output=await page.locator('#backup-text').inputValue();
  assert.ok(output.startsWith('\uFEFFdate,make,model,grade,year'));
  assert.match(output,/"日産","デイズ"/);
  assert.match(output,/"500000"/);
  assert.match(await page.locator('#backup-status').innerText(),/まだ外部には保存されていません/);
  await page.evaluate(()=>{
   navigator.share=async args=>{window.__shared={name:args.files[0].name,body:await args.files[0].text()};};
   navigator.canShare=()=>true;
  });
  await page.locator('#backup-share').click();
  await page.waitForFunction(()=>!!window.__shared);
  const shared=await page.evaluate(()=>window.__shared);
  assert.equal(shared.body,output);
  assert.match(shared.name,/^MD_MARKET_backup_.*\.csv$/);
  await page.evaluate(()=>{navigator.canShare=()=>false;});
  await page.locator('#backup-share').click();
  assert.match(await page.locator('#backup-status').innerText(),/CSV全文を選択/);
  await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#count-all').textContent==='1');
  await page.locator('a[data-tab="import"]').click();
  await page.locator('#backup-text-generate').click();
  await page.waitForFunction(()=>document.querySelector('#backup-text').value.includes('デイズ'));
  assert.equal(await page.locator('#backup-text').inputValue(),output);
  assert.deepEqual(errors,[]);
  console.log('PASS '+engine+': CSV share, copy fallback, persisted IndexedDB');
 }finally{
  await browser.close();await new Promise(done=>server.close(done));
 }
}
main().catch(err=>{console.error(err);process.exitCode=1;});
