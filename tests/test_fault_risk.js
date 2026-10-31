'use strict';
const assert=require('node:assert/strict');
const F=require('../fault-risk.js');
const valid={id:'a',make:'日産',model:'ノート',model_code:'DBA-E12',component:'エアミックスアクチュエーター',
 symptom:'温度が変わらない',source_type:'field',source_url:'',status:'reported',event_date:'',
 mileage_km:null,repair_cost_jpy:null,notes:'現場メモ'};
assert.equal(F.code('DBA-E12'),'E12');
assert.equal(F.code('DAA-HE12'),'HE12');
assert.notEqual(F.code('DBA-E12'),F.code('DAA-HE12'));
assert.equal(F.item(valid).model_code,'E12');
assert.equal(F.search([valid],{model_code:'HE12'}).length,0);
assert.equal(F.search([valid],{model_code:'E12'}).length,1);
assert.equal(F.search([valid],{model_code:'DBA-E12'}).length,1);
assert.throws(()=>F.item({...valid,source_type:'sns'}),/原典URL/);
assert.throws(()=>F.item({...valid,source_type:'mlit',source_url:'javascript:alert(1)'}),/URL/);
assert.throws(()=>F.item({...valid,mileage_km:-3}),/走行距離/);
assert.throws(()=>F.item({...valid,event_date:'2026-02-30'}),/確認日/);
assert.throws(()=>F.item({...valid,repair_cost_jpy:-1}),/修理費/);
assert.equal(F.adjustedCap(1000000,50000),950000);
assert.equal(F.adjustedCap(1000000,1000001),null);
assert.equal(F.adjustedCap('',50000),null);
const original=[F.item(valid)];
assert.deepEqual(F.restore(F.backup(original)),original);
assert.equal(F.merge(original,original).length,1);
assert.throws(()=>F.merge(original,[{...valid,notes:'different'}]),/上書き/);
assert.throws(()=>F.restore('{"kind":"other","schema_version":1,"items":[]}'),/バックアップ/);
assert.throws(()=>F.validate(Array.from({length:251},(_,i)=>({...valid,id:String(i)}))),/最大250件/);
console.log('fault-risk: 16 checks passed');
