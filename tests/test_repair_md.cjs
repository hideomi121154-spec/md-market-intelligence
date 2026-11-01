'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const R=require('../repair-md.js');
const V=require('../valuation.js');
const cohort={
 id:'case-1',make:'日産',model:'ノート',code:'DBA-E12',year_min:2015,year_max:2020,
 mileage_min:0,mileage_max:100000,component:'空調',evidence_type:'cohort',
 inspected:100,affected:4,assumed_rate_pct:null,repair_cost_jpy:50000,
 source_label:'サンプルの社内集計・仮想データ',source_url:'',as_of:'2026-10-31',notes:'実データではない'
};
const alt={...cohort,id:'case-2',code:'HE12',affected:8};
const cvt={...cohort,id:'case-3',component:'CVT',affected:2,repair_cost_jpy:150000};
const scenario={...cohort,id:'case-4',evidence_type:'assumption',inspected:null,affected:null,assumed_rate_pct:8,
 component:'吸気系',repair_cost_jpy:20000};
const actualVehicle={make:'日産',model:'ノート',code:'E12',year:2017,mileage:55000};
assert.equal(R.modelCode('DBA-E12'),'E12');
assert.equal(R.modelCode('DAA-HE12'),'HE12');
assert.equal(R.validateRow(cohort).code,'E12');
assert.equal(R.validateRow(alt).code,'HE12');
assert.equal(R.match(R.validateRow(cohort),R.vehicleInput(actualVehicle)),true);
assert.equal(R.match(R.validateRow(alt),R.vehicleInput(actualVehicle)),false);
assert.equal(R.match(R.validateRow(cohort),R.vehicleInput({...actualVehicle,year:2022})),false);
assert.equal(R.match(R.validateRow(cohort),R.vehicleInput({...actualVehicle,mileage:120000})),false);
const base=V.calculateValues({...V.DEFAULTS});
const result=R.study([cohort,alt,cvt,scenario],actualVehicle,0,V.DEFAULTS,V.calculateValues);
assert.equal(result.matching.length,3);
assert.equal(result.rawExpectedCost,6600); // 4%*50000 + 2%*150000 + 8%*20000
assert.equal(result.additionalCost,6600);
assert.equal(result.adjustedCeiling,base.conservativeCeiling-6600);
assert.equal(result.revisedProfitAtBid,base.expectedProfitAtBid-6600);
assert.equal(result.containsAssumptions,true);
assert.equal(result.qualifies,false);
const only=R.study([cohort],actualVehicle,0,V.DEFAULTS,V.calculateValues);
assert.equal(only.rawExpectedCost,2000);
assert.equal(only.qualifies,true);
const covered=R.study([cohort,cvt],actualVehicle,5000,V.DEFAULTS,V.calculateValues);
assert.equal(covered.rawExpectedCost,5000);
assert.equal(covered.additionalCost,0);
assert.equal(covered.adjustedCeiling,base.conservativeCeiling);
assert.equal(R.study([],actualVehicle,0,V.DEFAULTS,V.calculateValues).hasData,false);
assert.equal(R.study([],actualVehicle,0,V.DEFAULTS,V.calculateValues).additionalCost,0);
assert.throws(()=>R.study([cohort,{...cohort,id:'dup',component:'空調'}],actualVehicle,0,V.DEFAULTS,V.calculateValues),/複数の該当記録/);
assert.throws(()=>R.study([cohort],actualVehicle,1000000,V.DEFAULTS,V.calculateValues),/超えています/);
assert.throws(()=>R.validateRow({...cohort,inspected:null}),/母数|対象車両数/);
assert.throws(()=>R.validateRow({...cohort,affected:101}),/故障確認車両数/);
assert.throws(()=>R.validateRow({...cohort,assumed_rate_pct:30}),/混ぜない/);
assert.throws(()=>R.validateRow({...scenario,inspected:100}),/混ぜない/);
assert.throws(()=>R.validateRow({...scenario,assumed_rate_pct:101}),/0〜100/);
assert.throws(()=>R.validateRow({...cohort,as_of:'2026-02-30'}),/集計日/);
assert.throws(()=>R.validateRow({...cohort,source_url:'javascript:alert(1)'}),/URL/);
assert.throws(()=>R.validateRow({...cohort,repair_cost_jpy:-1}),/整備費/);
assert.equal(R.parseBackup(R.backup([R.validateRow(cohort)]))[0].code,'E12');
assert.equal(R.merge([cohort],[cohort]).length,1);
assert.throws(()=>R.merge([cohort],[{...cohort,affected:5}]),/上書きしません/);
assert.throws(()=>R.parseBackup('{"kind":"wrong","schema_version":1,"rows":[]}'),/JSONではありません/);
assert.throws(()=>R.validate(Array.from({length:201},(_,i)=>({...cohort,id:String(i)}))),/200件/);
assert.equal(cohort.affected,4,'inputs must not be mutated');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
for(const id of ['repair-md-panel','repair-md-form','repair-md-save','repair-md-kind','repair-md-cohort-fields',
  'repair-md-assumption-fields','repair-md-filter-code','repair-md-filter-year','repair-md-filter-mileage',
  'repair-md-coverage','repair-md-output','repair-md-export','repair-md-import','repair-md-json']){
 assert.ok(html.includes('id="'+id+'"'),'missing control '+id);
}
for(const asset of ['repair-md.js?v=3.7.0','repair-md.css?v=3.7.0']){
 assert.ok(html.includes(asset),'missing HTML asset '+asset);
 assert.ok(sw.includes(asset),'missing PWA asset '+asset);
}
const source=fs.readFileSync(path.join(root,'repair-md.js'),'utf8');
assert.ok(!source.includes('fetch('),'no internal data fetch should happen');
assert.ok(!source.includes('innerHTML'),'no untrusted markup injection');
console.log('PASS: MD repair risk calculation / cohort denominator / code separation / no double-charge / backups / UI and offline integration');
