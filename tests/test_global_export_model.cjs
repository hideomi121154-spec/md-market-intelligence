'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
require('../overseas-market.js');
require('../crossborder-signal.js');
require('../estat-exports.js');
require('../russia-yaris.js');
const M=require('../global-export-model.js');
const data=name=>JSON.parse(fs.readFileSync(path.join(root,'data',name),'utf8'));
const catalog=data('export-model-catalog.json');
const snapshot=data('overseas-export-snapshot.json');
const official=data('estat_used_vehicle_exports.json');
const annual=data('registered_annual_history.json');
const kei=data('kei_annual_history.json');
const russia=data('russia-yaris-sources.json');
M.verifyCatalog(catalog);
assert.equal(catalog.countries.length,55);
assert.equal(catalog.makes.length,9);
assert.equal(catalog.makes.reduce((n,x)=>n+x.models.length,0),81);
assert.ok(catalog.makes.find(x=>x.make==='トヨタ').models.includes('ヤリス'));
assert.ok(catalog.makes.find(x=>x.make==='ホンダ').models.includes('N-BOX'));
assert.throws(()=>M.verifyCatalog({...catalog,countries:[...catalog.countries,'ロシア']}),/重複/);
assert.throws(()=>M.verifyCatalog({...catalog,makes:[catalog.makes[0],...catalog.makes]}),/不正/);
assert.throws(()=>M.verifyCatalog({...catalog,makes:catalog.makes.map(x=>x.make==='トヨタ'?{...x,models:[...x.models,'ヤリス']}:x)}),/重複/);
const opts=M.countryOptions(catalog,snapshot,official,{records:[]});
assert.equal(opts.filter(x=>x.hasAggregate).length,18);
assert.ok(opts.find(x=>x.name==='ロシア').hasAggregate);
assert.ok(opts.find(x=>x.name==='オーストラリア').onlyCandidate);
assert.ok(opts.find(x=>x.name==='アメリカ').onlyCandidate);
assert.equal(M.normalizeCountry('英国'),'イギリス');
assert.ok(opts.length>=55);
const choose=(country,make,model,notes='')=>M.buildView(catalog,snapshot,official,annual,kei,russia,notes,country,make,model);
const ru=choose('ロシア','トヨタ','ヤリス');
assert.equal(ru.macro.count,168891);
assert.equal(ru.directModelExportCount,null,'country count must not be attributed to Yaris');
assert.equal(ru.directModelExportStatus,'未取得');
assert.equal(ru.categories.find(x=>x.id==='ordinary').units,13997);
assert.equal(ru.categories.find(x=>x.id==='hybrid').units,null,'top-five omission is unknown, not zero');
assert.equal(ru.officialView.status,'not_configured','official empty e-Stat file remains empty');
assert.equal(ru.ruInfo.passenger2025.value,186585);
assert.equal(ru.ruInfo.toyotaSales2025.value,624822);
assert.ok(ru.japanNewSales.some(x=>x.year===2025));
const note=choose('モンゴル','日産','ノート');
assert.equal(note.macro.count,63492);
assert.equal(note.directModelExportCount,null);
assert.equal(note.ruInfo,null);
assert.ok(note.japanNewSales.length>=1);
const keiView=choose('ニュージーランド','ホンダ','N-BOX');
assert.ok(keiView.japanNewSales.length>=3,'zenkeijikyo source for kei cars');
assert.ok(keiView.japanNewSales.every(x=>x.scope==='軽自動車'));
assert.equal(keiView.categories.find(x=>x.id==='ev').units,366);
const missing=choose('オーストラリア','レクサス','LX');
assert.equal(missing.macro,null);
assert.equal(missing.directModelExportCount,null);
assert.ok(missing.categories.every(x=>x.units===null));
assert.equal(missing.modelNotes.length,0);
assert.throws(()=>choose('ロシア','トヨタ','カローラ セダン'),/カタログ/);
const C=globalThis.MDCrossover;
const record=C.note({id:'user-note-1',make:'日産',model:'ノート',country:'モンゴル',scope:'国別・車種別の本人転記（検証なし）',
 period:'2026-09',previous_period:'2025-09',current:25,previous:10,source:'原典メモ',
 source_url:'https://example.org/model-evidence',notes:'本人転記テスト'});
const encoded=C.backup([record]);
const evidence=choose('モンゴル','日産','ノート',encoded);
assert.equal(evidence.modelNotes.length,1);
assert.equal(evidence.modelNotes[0].current,25);
assert.equal(evidence.directModelExportCount,null,'manual observation cannot become official model count');
assert.equal(choose('ロシア','日産','ノート',encoded).modelNotes.length,0,'country matching required');
assert.equal(choose('モンゴル','ホンダ','フィット',encoded).modelNotes.length,0,'model matching required');
assert.ok(choose('モンゴル','日産','ノート','corrupt').notesError,'corrupt backup must be preserved and explained');
const extended=M.countryOptions(catalog,snapshot,official,M.readNotes(C.backup([C.note({...record,id:'u2',country:'ウズベキスタン'})])));
assert.ok(extended.find(x=>x.name==='ウズベキスタン'),'locally observed country can join selectors');
const fy=JSON.parse(JSON.stringify(official));
fy.status='available';
fy.stats_data_id='0004049306';fy.source_url='https://www.e-stat.go.jp/stat-search/database?layout=dataset';
fy.updated_at='2026-11-02T00:00:00+00:00';
fy.months=['2026-09'];fy.hs_labels=Object.fromEntries(Object.keys(globalThis.MDCountryMix?.HS||{
 '870321915':1,'870321925':1,'870322910':1,'870323915':1,'870323925':1,'870324910':1,
 '870331100':1,'870332915':1,'870332925':1,'870333910':1,'870340100':1,'870350100':1,
 '870360100':1,'870370100':1,'870380100':1,'870390100':1}).map(x=>[x,x]));
fy.rows=[{period:'2026-09',country:'オーストラリア',area_code:'50601',hs_code:'870322910',units:4}];
const v=M.buildView(catalog,snapshot,fy,annual,kei,russia,'','オーストラリア','トヨタ','ヤリス');
assert.equal(v.officialView.byGroup.find(x=>x.id==='petrol').units,4);
assert.equal(v.directModelExportCount,null,'HS category must not become model count');
assert.equal(v.options.find(x=>x.name==='オーストラリア').hasAggregate,true);
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
for(const id of ['export-model-panel','export-model-country','export-model-make','export-model-model','export-model-results',
 'export-model-refresh','export-model-add-note','export-model-country-mix','export-model-status']){
 assert.ok(html.includes('id="'+id+'"'),'missing UI control '+id);
 assert.equal(html.split('id="'+id+'"').length-1,1,'duplicated UI id '+id);
}
assert.ok(!html.includes('id="russia-yaris-panel"'),'obsolete fixed UI must be replaced');
for(const asset of ['global-export-model.js?v=4.3.0','global-export-model.css?v=4.3.0','data/export-model-catalog.json']){
 assert.ok(sw.includes(asset),'offline cache missing '+asset);
 if(!asset.startsWith('data/'))assert.ok(html.includes(asset),'HTML missing '+asset);
}
assert.ok(html.indexOf('crossborder-signal.js?v=3.9.0')<html.indexOf('global-export-model.js?v=4.3.0'),'notes dependency order');
assert.ok(html.indexOf('russia-yaris.js?v=4.0.0')<html.indexOf('global-export-model.js?v=4.3.0'),'legacy reference dependency order');
assert.ok(html.indexOf('estat-exports.js?v=4.2.0')<html.indexOf('global-export-model.js?v=4.3.0'),'official HS dependency order');
assert.ok(!fs.readFileSync(path.join(root,'global-export-model.js'),'utf8').includes('innerHTML'));
assert.ok(!fs.readFileSync(path.join(root,'global-export-model.js'),'utf8').includes('localStorage.removeItem'));
assert.ok(sw.includes('md-market-pwa-v4-4-0-20261102'));
console.log('PASS world country/model selector, 81 models, strict sources, notes, kei & JADA, missing≠0, official HS separation');
