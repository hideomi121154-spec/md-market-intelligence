'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const I=require('../inventory-observations.js');
const W=require('../observation-watch.js');
const O=require('../overseas-market.js');
const M=require('../crossborder-signal.js');
const root=path.resolve(__dirname,'..');
const snapshot=O.verifySnapshot(JSON.parse(fs.readFileSync(path.join(root,'data/overseas-export-snapshot.json'),'utf8')));
const car={date:'2026-10-24',make:'トヨタ',model:'ヤリス',region:'全国',grade:'X',color:'白',conditions:'2022〜2025年、走行5万km以下',
 source_url:'https://www.goo-net.com/usedcar/search/',count:100};
const later={...car,date:'2026-10-29',count:135};
const rows=[car,later],key=I.seriesKey(car);
const result=M.analyze(rows,key,'タンザニア',[],snapshot,'2026-11-01',I,W);
assert.equal(result.available,true);
assert.equal(result.domestic.ready,true);
assert.equal(result.domestic.delta,35);
assert.equal(result.domestic.direction,'増加');
assert.equal(result.overseas.direction,'増加');
assert.equal(result.overseas.total,137290);
assert.equal(result.modelEvidence,null,'a country aggregate is NEVER a model export claim');
assert.ok(result.evidenceStrength.includes('不明'));
assert.ok(result.verdict.includes('全車種'));
assert.ok(result.blockers.some(s=>s.includes('車種需要を断定しない')));
const one=M.analyze([car],key,'ロシア',[],snapshot,'2026-11-01',I,W);
assert.equal(one.domestic.ready,false);
assert.equal(one.domestic.direction,'比較保留');
const different=I.validateEntry({...later,grade:'G'});
assert.equal(M.analyze([car,different],key,'ロシア',[],snapshot,'2026-11-01',I,W).domestic.ready,false,
 'different grade must not create a fake inventory delta');
const old=M.analyze(rows,key,'タンザニア',[],snapshot,'2026-12-10',I,W);
assert.equal(old.domestic.ready,false,'stale inventory cannot be an active supply signal');
const carsensor=[{...car,date:'2026-10-15',source_url:'https://www.carsensor.net/usedcar/search/',count:100},
 {...car,date:'2026-10-25',source_url:'https://www.carsensor.net/usedcar/search/',count:150}];
assert.equal(M.analyze(carsensor,I.seriesKey(carsensor[0]),'ロシア',[],snapshot,'2026-11-01',I,W).domestic.outage,true);
assert.equal(M.analyze(carsensor,I.seriesKey(carsensor[0]),'ロシア',[],snapshot,'2026-11-01',I,W).domestic.ready,false);
assert.throws(()=>M.analyze(rows,key,'架空の国',[],snapshot,'2026-11-01',I,W),/国別統計/);
const modelEvidence={id:'a',make:'トヨタ',model:'ヤリス',country:'タンザニア',period:'2026-09',previous_period:'2025-09',scope:'同じ年式・型式を含む車名別輸出台数',
 current:20,previous:10,source:'試験用の仮定値（実データではない）',source_url:'https://test.example.jp/model-export',notes:'本物の実績としては使わない'};
const withModel=M.analyze(rows,key,'タンザニア',[modelEvidence],snapshot,'2026-11-01',I,W);
assert.equal(withModel.modelEvidence.model,'ヤリス');
assert.equal(withModel.modelYoy,100);
assert.ok(withModel.evidenceStrength.includes('ユーザー記録'));
assert.equal(M.analyze(rows,key,'ロシア',[modelEvidence],snapshot,'2026-11-01',I,W).modelEvidence,null,'country must match');
assert.equal(M.analyze([{...car,make:'日産'}, {...later,make:'日産'}],
 I.seriesKey({...car,make:'日産'}),'タンザニア',[modelEvidence],snapshot,'2026-11-01',I,W).modelEvidence,null,'manufacturer must match');
assert.throws(()=>M.note({...modelEvidence,current:''}),/整数/);
assert.throws(()=>M.note({...modelEvidence,period:'2026-08'}),/同じ月/);
assert.throws(()=>M.note({...modelEvidence,previous_period:'2024-09'}),/同じ月/);
assert.throws(()=>M.note({...modelEvidence,source_url:'javascript:alert(1)'}),/URL/);
assert.throws(()=>M.note({...modelEvidence,previous:-1}),/整数/);
assert.throws(()=>M.note({...modelEvidence,previous:0,current:0}),/両方0台/);
assert.equal(M.mergeNotes([modelEvidence],[modelEvidence]).length,1);
assert.throws(()=>M.mergeNotes([modelEvidence],[{...modelEvidence,current:100}]),/上書きしません/);
assert.equal(M.restore(M.backup([modelEvidence])).length,1);
assert.throws(()=>M.restore('{"schema_version":1,"kind":"wrong","records":[]}'),/専用/);
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
for(const id of ['crossborder-panel','crossborder-series','crossborder-country','crossborder-results','crossborder-status','crossborder-save','crossborder-export','crossborder-import','crossborder-json'])
 assert.ok(html.includes('id="'+id+'"'),id+' missing');
for(const name of ['crossborder-signal.js?v=3.9.0','crossborder-signal.css?v=3.9.0'])
 assert.ok(html.includes(name)&&sw.includes(name),'PWA asset mismatch '+name);
assert.ok(html.indexOf('inventory-observations.js?v=2.1.0')<html.indexOf('crossborder-signal.js?v=3.9.0'),'dependency order');
const source=fs.readFileSync(path.join(root,'crossborder-signal.js'),'utf8');
assert.ok(!source.includes('innerHTML'),'untrusted strings must use textContent');
assert.ok(!source.includes('localStorage.removeItem'),'do not erase other modules');
assert.ok(html.includes('id="repair-md-panel"')&&html.includes('id="overseas-panel"'));
console.log('PASS: domestic/overseas comparison, exact inventory series, outage/stale guards, country/model discrimination, safe backups and PWA linkage');
