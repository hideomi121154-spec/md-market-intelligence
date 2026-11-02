'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
const css=fs.readFileSync(path.join(root,'history-fold.css'),'utf8');
const maturity=fs.readFileSync(path.join(root,'residual-maturity.js'),'utf8');
const panels=[
  {id:'regional-jobs-panel',className:'regional-jobs-panel',ids:['regional-jobs-basis','regional-jobs-reload','regional-jobs-rows','regional-jobs-rising','regional-jobs-falling']},
  {id:'prefecture-jobs-panel',className:'prefecture-jobs-panel',ids:['prefecture-jobs-pref','prefecture-jobs-month','prefecture-jobs-rows','prefecture-jobs-file','prefecture-jobs-reset']},
  {id:'rm-panel',className:'rm-panel',ids:['rm-class','rm-make','rm-model','rm-example','rm-results','rm-use-in-gap']},
  {id:'rr-panel',className:'rr-panel',ids:['rr-residual','rr-auction','rr-save','rr-history','rr-export','rr-import']}
];
for(const p of panels){
  const open='<details class="panel '+p.className+' history-fold" id="'+p.id+'"';
  const start=html.indexOf(open);
  assert.ok(start>=0,'must be a native details element: '+p.id);
  assert.equal(html.indexOf(open,start+1),-1,'duplicate panel '+p.id);
  const end=html.indexOf('</details>',start);
  assert.ok(end>start,'missing close tag '+p.id);
  const contents=html.slice(start,end);
  assert.ok(contents.includes('<summary class="history-fold-summary">'),'summary must be tappable '+p.id);
  assert.ok(contents.includes('class="history-fold-body"'),'body must use same styling as sales folds '+p.id);
  assert.ok(!html.slice(start,start+180).includes(' open'),'default must be collapsed '+p.id);
  for(const id of p.ids){
    assert.ok(contents.includes('id="'+id+'"'),'existing input or output lost: '+p.id+' / '+id);
  }
  assert.equal((html.match(new RegExp('id="'+p.id+'"','g'))||[]).length,1,'duplicate id '+p.id);
}
assert.ok(css.includes('.history-fold[open] > .history-fold-summary::after'),'existing open state styling reused');
assert.ok(css.includes('.history-fold > .history-fold-summary:focus-visible'),'keyboard accessibility preserved');
assert.ok(maturity.includes('to.open=true;to.scrollIntoView'),'cross-panel transfer must open destination');
assert.ok(html.includes('<details class="prefecture-jobs-import">'),'nested local import disclosure must remain');
for(const id of ['registered-history-panel','kei-history-panel']){
  assert.ok(html.includes('id="'+id+'"'),'sales history must remain');
}
for(const file of ['regional-jobs.js','prefecture-jobs.js','residual-gap.js','residual-maturity.js']){
  assert.ok(fs.existsSync(path.join(root,file)),'existing logic preserved: '+file);
}
assert.ok(sw.includes('md-market-pwa-v4-5-0-20261102'),'PWA shell must refresh after HTML update');
assert.ok(sw.includes("'./history-fold.css?v=3.4.0'"),'reuse existing offline folding style');
console.log('PASS: four independent default-closed panels, existing controls, keyboard style and residual transfer');
