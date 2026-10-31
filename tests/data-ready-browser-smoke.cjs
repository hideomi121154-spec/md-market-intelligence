'use strict';
// Mobile Chromium/WebKit smoke: isolated MD MARKET lab; NEVER write to real user storage.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {chromium,webkit}=require('playwright');
const root=path.resolve(__dirname,'..');
const mime={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8',
  '.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8'};
const server=http.createServer((req,res)=>{
  let p;
  try{p=decodeURIComponent(new URL(req.url,'http://127.0.0.1').pathname)}
  catch{res.writeHead(400).end();return}
  const local=path.resolve(root,(p.endsWith('/')?p+'index.html':p).replace(/^\/+/,''));
  if(!local.startsWith(root+path.sep)){res.writeHead(403).end();return}
  fs.stat(local,(error,st)=>{
    if(error || !st.isFile()){res.writeHead(404).end();return}
    res.setHeader('Content-Type',mime[path.extname(local)]||'application/octet-stream');
    fs.createReadStream(local).pipe(res);
  });
});
async function main(){
  const report=fs.readFileSync(process.env.REPORT_PATH,'utf8');
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const engine=process.env.BROWSER_ENGINE==='webkit'?webkit:chromium;
  const browser=await engine.launch({headless:true});
  const ctx=await browser.newContext({
    viewport:{width:390,height:844},
    hasTouch:true,isMobile:true,acceptDownloads:true,serviceWorkers:'block'
  });
  const page=await ctx.newPage();
  const failures=[];
  page.on('pageerror',e=>failures.push(e.message));
  try{
    const port=server.address().port;
    await page.goto('http://127.0.0.1:'+port+'/lab/data-ready/',{waitUntil:'load'});
    await page.waitForFunction(()=>document.querySelector('#importStatus')?.textContent.includes('デモ用'));
    assert.match(await page.locator('#banner').innerText(),/架空/);
    await page.locator('#analyze').click();
    assert.match(await page.locator('#priceResult').innerText(),/8件/);
    assert.match(await page.locator('#priceResult').innerText(),/1,365,000円/);
    await page.locator('#grade').fill('S');
    await page.locator('#analyze').click();
    assert.match(await page.locator('#priceResult').innerText(),/価格は表示しません/);
    await page.locator('#grade').fill('X');
    await page.locator('#calcCap').click();
    assert.match(await page.locator('#capResult').innerText(),/955,000円/);
    await page.locator('#checkDemand').click();
    assert.match(await page.locator('#demandResult').innerText(),/問合せ合計: 12件/);
    // Load a report produced by the Python trainer, with synthetic data.
    await page.locator('#mlReportFile').setInputFiles({
      name:'data-ready-retail-report.json',mimeType:'application/json',
      buffer:Buffer.from(report)
    });
    await page.waitForFunction(()=>document.querySelector('#mlReportResult').textContent.includes('回帰モデルMAE'));
    assert.match(await page.locator('#mlReportResult').innerText(),/架空データ/);
    assert.ok(await page.locator('#mlPredictDate').inputValue());
    await page.locator('#mlPredictButton').click();
    assert.match(await page.locator('#mlPredictionResult').innerText(),/架空データ・実相場ではありません/);
    assert.match(await page.locator('#mlPredictionResult').innerText(),/実験モデルの算出値/);
    // Old model -> abstention, no price.
    await page.locator('#mlPredictDate').fill('2027-10-31');
    await page.locator('#mlPredictButton').click();
    assert.match(await page.locator('#mlPredictionResult').innerText(),/判断保留/);
    assert.doesNotMatch(await page.locator('#mlPredictionResult').innerText(),/実験モデルの算出値/);
    // Reject synthetic-data import in a user-authorized channel and retain demo.
    const demo=JSON.parse(fs.readFileSync(path.join(root,'lab/data-ready/sample-data.json')));
    await page.locator('#fileInput').setInputFiles({
      name:'sample-data.json',mimeType:'application/json',
      buffer:Buffer.from(JSON.stringify(demo))
    });
    assert.match(await page.locator('#importStatus').innerText(),/取込中止/);
    assert.match(await page.locator('#banner').innerText(),/デモモード/);
    const storage=await page.evaluate(()=>localStorage.length);
    assert.equal(storage,0,'lab must not write to localStorage');
    assert.deepEqual(failures,[]);
    console.log('Data-ready E2E smoke passed',process.env.BROWSER_ENGINE||'chromium');
  } finally {
    await ctx.close();await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
}
main().catch(err=>{console.error(err);process.exitCode=1;server.close()});
