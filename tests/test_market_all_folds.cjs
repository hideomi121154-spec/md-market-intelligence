'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
const evidence=fs.readFileSync(path.join(root,'md-evidence.js'),'utf8');
const smoke=fs.readFileSync(path.join(root,'tests/browser-smoke.cjs'),'utf8');
const ids=[
 'demand-signals-panel','uss-aggregate','uss-warning-panel',
 'regional-jobs-panel','prefecture-jobs-panel',
 'registered-sales-panel','model-sales-panel',
 'registered-history-panel','kei-history-panel',
 'inventory-panel','observation-watch-panel','model-price-panel','md-evidence-panel',
 'rm-panel','rr-panel'
];
const idsAndControls={
 'demand-signals-panel':['demand-refresh','demand-period','demand-overlap'],
 'uss-aggregate':['uss-reload','uss-status','uss-data','uss-price'],
 'uss-warning-panel':['uss-warning-month','uss-warning-level','uss-warning-detail'],
 'registered-sales-panel':['registered-sales-reload','registered-sales-grid'],
 'model-sales-panel':['model-sales-reload','model-sales-grid'],
 'inventory-panel':['inventory-form','inventory-date','inventory-save','inventory-backup'],
 'observation-watch-panel':['observation-watch-filter','observation-watch-refresh','observation-watch-rows'],
 'model-price-panel':['model-price-form','model-price-amount','model-price-save','model-price-chart'],
 'md-evidence-panel':['md-evidence-series','md-evidence-verdict','md-evidence-refresh']
};
const overviewStart=html.indexOf('<section class="screen" id="overview">');
const overviewEnd=html.indexOf('<section class="screen" id="records">');
assert.ok(overviewStart>=0&&overviewEnd>overviewStart);
const overview=html.slice(overviewStart,overviewEnd);
for(const id of ids){
 const pattern=new RegExp('<details\\b[^>]*\\bid="'+id+'"[^>]*>','g');
 const matches=[...overview.matchAll(pattern)];
 assert.equal(matches.length,1,'exactly one collapsible section: '+id);
 const raw=matches[0][0];
 assert.ok(!/\\sopen(?:\\s|=|>)/.test(raw),'must default closed: '+id);
 const nearby=overview.slice(matches[0].index,matches[0].index+500);
 assert.ok(nearby.includes('<summary class="history-fold-summary">'),'tappable title: '+id);
 assert.ok(nearby.includes('<div class="history-fold-body">'),'content body: '+id);
 assert.ok(raw.includes('history-fold'),'reuse original fold CSS: '+id);
 for(const control of idsAndControls[id]||[])
   assert.ok(overview.includes('id="'+control+'"'),'lost functional control '+control);
}
assert.ok(overview.includes('id="uss-warning-panel" hidden'),'warning stays unshown until official data is ready');
assert.ok(overview.includes('<details class="inventory-backup-area">'),'inventory backup accordion preserved');
assert.ok(overview.includes('<details class="prefecture-jobs-import">'),'prefecture import accordion preserved');
assert.ok(overview.includes('id="md-evidence-jump"'),'dashboard jump button preserved');
assert.ok(evidence.includes('panel.open=true;panel.scrollIntoView'),'shortcut opens collapsed destination');
assert.ok(smoke.includes("await page.locator('#md-evidence-jump').click()"));
assert.ok(sw.includes('md-market-pwa-v4-4-0-20261102'),'versioned offline shell updated');
assert.ok(sw.includes("'./md-evidence.js?v=3.6.0'"));
assert.ok(html.includes('./md-evidence.js?v=3.6.0'));
console.log('PASS 15 closed market panels, 9 newly folded, original inputs/backups, source-only warning and MD shortcut');
