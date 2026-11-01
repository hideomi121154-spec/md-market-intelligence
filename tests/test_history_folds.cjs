'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {toSeries,splitSegments,scaleMax}=require('../history-trend.js');
const reg=require('../registered-history.js');
const kei=require('../kei-history.js');
const registered=reg.validate(JSON.parse(fs.readFileSync(path.join(__dirname,'../data/registered_annual_history.json'),'utf8')));
const light=kei.validate(JSON.parse(fs.readFileSync(path.join(__dirname,'../data/kei_annual_history.json'),'utf8')));
const pri=toSeries(reg.findVehicle(registered,{make:'トヨタ',model:'プリウス'}));
assert.deepEqual(pri.map(p=>p.value),[49179,32675,99149,83485,63717]);
assert.deepEqual(pri.map(p=>p.year),[2021,2022,2023,2024,2025]);
assert.equal(splitSegments(pri).length,1);
assert.equal(splitSegments(pri)[0].length,5);
const unknown=toSeries(reg.findVehicle(registered,{make:'トヨタ',model:'ランドクルーザー'}));
assert.equal(unknown[0].value,null,'missing top50 is not a 0 sale');
assert.ok(scaleMax([pri,unknown])>99149);
const gap=toSeries([
{year:2021,row:{units:1000}},{year:2022,row:null},{year:2023,row:{units:3000}},
{year:2024,row:{units:4000}},{year:2025,row:null}
]);
assert.deepEqual(splitSegments(gap).map(s=>s.map(x=>x.year)),[[2021],[2023,2024]],'must not connect missing years');
const days=toSeries(kei.findVehicle(light,{make:'日産',model:'デイズ'}));
assert.equal(days.length,5);
assert.ok(days.some(x=>x.value!==null));
assert.throws(()=>toSeries(pri.slice(1)),/5年間/);
assert.throws(()=>toSeries([{year:2021},{year:2022},{year:2023},{year:2024},{year:2026}]),/対象年/);
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
const helper=fs.readFileSync(path.join(root,'history-trend.js'),'utf8');
for(const type of ['registered','kei']){
 assert.ok(html.includes('<details class="panel '+type+'-history-panel history-fold" id="'+type+'-history-panel">'),'must be native collapsible <details>');
 const start=html.indexOf('id="'+type+'-history-panel"');
 const finish=html.indexOf('</details>',start);
 const body=html.slice(start,finish);
 assert.ok(body.includes('class="history-fold-summary"'));
 assert.ok(body.includes('id="'+type+'-history-model"')&&body.includes('id="'+type+'-history-compare"'));
 assert.ok(body.includes('id="'+type+'-history-trend"')&&body.includes('id="'+type+'-history-chart"'));
 assert.ok(!html.slice(start-90,start+80).includes(' open'),'fold starts collapsed');
 for(const file of [type+'-history.js?v=3.4.0']){
  assert.ok(html.includes(file)&&sw.includes(file));
 }
 const source=fs.readFileSync(path.join(root,type+'-history.js'),'utf8');
 assert.ok(source.includes("MDSalesTrendView.render($('"+type+"-history-trend')"));
}
assert.ok(html.indexOf('history-trend.js?v=3.4.0')<html.indexOf('kei-history.js?v=3.4.0'));
assert.ok(html.indexOf('history-trend.js?v=3.4.0')<html.indexOf('registered-history.js?v=3.4.0'));
for(const asset of ['history-trend.js?v=3.4.0','history-fold.css?v=3.4.0']){
 assert.ok(html.includes(asset)&&sw.includes(asset));
}
assert.ok(!helper.includes('innerHTML'),'graph must not use unsafe HTML injection');
assert.ok(html.includes('2021〜2025年'));
console.log('PASS five-year source figures, true missing-year gaps, fold/unfold DOM wiring, PWA cache assets');
