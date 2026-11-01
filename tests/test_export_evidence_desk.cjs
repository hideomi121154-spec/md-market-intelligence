'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),data=p=>JSON.parse(fs.readFileSync(path.join(root,'data',p),'utf8'));
require('../overseas-market.js');
const crossover=require('../crossborder-signal.js');
require('../estat-exports.js');
require('../russia-yaris.js');
const M=require('../global-export-model.js');
const P=require('../model-price-report.js');
const E=require('../export-evidence-desk.js');
const catalog=data('export-model-catalog.json'),snap=data('overseas-export-snapshot.json'),official=data('estat_used_vehicle_exports.json');
const compare=(make,model,raw='')=>E.compareCountries(catalog,snap,official,raw,make,model);
const base=compare('トヨタ','ヤリス');
assert.equal(base.rows.length,55);
assert.equal(base.macroCountries,10);
assert.equal(base.typeCountries,16,'only countries with type top-five coverage count; other aggregate-only countries are not counted');
assert.equal(base.modelCountries,0);
assert.equal(base.officialCountries,0);
assert.equal(base.officialIsConfigured,false);
assert.equal(base.rows[0].country,'ロシア');
assert.equal(base.rows[0].allVehicles,168891);
assert.equal(base.rows[0].allVehiclesYoy,126.5);
assert.equal(base.rows[0].modelCountOfficial,null,'country cumulative is not Yaris count');
assert.ok(base.rows.find(x=>x.country==='オーストラリア').allVehicles===null);
assert.ok(base.rows.find(x=>x.country==='ニュージーランド').typeTopFive.length>=2);
assert.equal(compare('ホンダ','N-BOX').rows[0].modelCountOfficial,null);
const a=crossover.note({id:'m1',make:'日産',model:'ノート',country:'モンゴル',
 scope:'対象の個別車名',period:'2026-09',previous_period:'2025-09',current:30,previous:20,
 source:'記録した資料',source_url:'https://example.org/data',notes:'出典要確認'});
const b=crossover.note({...a,id:'m2',current:50,scope:'区分の異なる対象'});
const c=crossover.note({...a,id:'m3',country:'ロシア',period:'2026-08',previous_period:'2025-08',current:4,previous:6});
const raw=crossover.backup([a,b,c]);
const cmp=compare('日産','ノート',raw);
assert.equal(cmp.modelCountries,2);
const mong=cmp.rows.find(x=>x.country==='モンゴル');
assert.equal(mong.modelRecordCount,2);
assert.equal(mong.modelRecordConflict,true);
assert.equal(mong.modelRecord.period,'2026-09');
assert.equal(mong.modelCountOfficial,null,'user-entered record is NEVER a certified export count');
const ru=cmp.rows.find(x=>x.country==='ロシア');
assert.equal(ru.modelRecord.current,4);
assert.equal(compare('トヨタ','ヤリス',raw).modelCountries,0);
assert.ok(compare('日産','ノート','broken JSON').notesError);
assert.throws(()=>compare('トヨタ','not-listed'),/カタログ/);
assert.deepEqual(E.priceContext('', '日産','ノート'),{series:[],error:null});
assert.ok(E.priceContext('broken','日産','ノート').error);
const source=P.SOURCE;
const priceRow={month:'2026-08',make:'日産',model:'ノート',model_scope:'E13型',
 average_total_yen:1530000,extended_listings:2400,checked_on:'2026-09-09',
 source_url:source,source_pdf_url:''};
const series=E.priceContext(JSON.stringify([priceRow,{...priceRow,month:'2026-09',
 average_total_yen:1570000,checked_on:'2026-10-04'}]),'日産','ノート');
assert.equal(series.series.length,1);
assert.equal(series.series[0].latestMonth,'2026-09');
assert.equal(series.series[0].deltaYen,40000);
assert.equal(series.series[0].extendedListings,2400);
assert.equal(E.priceContext(JSON.stringify([priceRow,{...priceRow,month:'2026-10',
 average_total_yen:1590000,checked_on:'2026-11-01'}]),'日産','ノート').series[0].deltaYen,null,
 'gapped months must not be compared');
assert.equal(E.priceContext(JSON.stringify([priceRow,{...priceRow,model_scope:'E12型'}]),'日産','ノート').series.length,2,
 'different generations must never be combined');
assert.equal(E.priceContext(JSON.stringify([priceRow]),'トヨタ','ヤリス').series.length,0);
assert.ok(E.priceContext(JSON.stringify([{...priceRow,average_total_yen:-1}]),'日産','ノート').error);
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
for(const id of ['export-evidence-panel','export-evidence-mode','export-evidence-results'])
 assert.ok(html.includes('id="'+id+'"'),'missing '+id);
for(const file of ['export-evidence-desk.js?v=4.4.0','export-evidence-desk.css?v=4.4.0'])
 assert.ok(sw.includes(file)&&html.includes(file),'cache/HTML mismatch '+file);
assert.ok(sw.includes('md-market-pwa-v4-4-0-20261102'));
assert.ok(html.indexOf('model-price-report.js?v=2.3.0')<html.indexOf('export-evidence-desk.js?v=4.4.0'));
assert.ok(html.indexOf('global-export-model.js?v=4.3.0')<html.indexOf('export-evidence-desk.js?v=4.4.0'));
assert.ok(fs.readFileSync(path.join(root,'global-export-model.js'),'utf8').includes('MDExportEvidence.refresh'));
const src=fs.readFileSync(path.join(root,'export-evidence-desk.js'),'utf8');
assert.ok(!src.includes('innerHTML')&&!src.includes('localStorage.removeItem'));
console.log('PASS: top10 country-wide ranking ≠ model ranking, manual evidence conflicts, domestic listed price isolation and PWA');
