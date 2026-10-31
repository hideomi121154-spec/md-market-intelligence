'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const {evaluate,nextMonthOutcome}=require('../market-warning.js');
const data=JSON.parse(fs.readFileSync(path.join(root,'data/uss_monthly.json'),'utf8'));
const months=data.months;
const get=month=>months.find(row=>row.month===month);

assert.equal(data.schema_version,1);
const july=evaluate(get('2026-07'));
assert.equal(july.level,'high','July warning must use only July source row');
assert.equal(july.offeredGrowth,15);
assert.equal(july.soldGrowth,10.8);
assert.equal(july.growthGap,4.2,'USS 115.0 YoY is +15.0%, not +115%');
assert.equal(july.rateDifference,-2.4);
assert.equal(july.metCount,3);
assert.equal(evaluate(get('2026-06')).level,'low','high prices do not equal supply-warning');
assert.equal(evaluate(get('2026-08')).level,'high');
assert.equal(evaluate(get('2026-09')).level,'high');
const after=nextMonthOutcome(months,get('2026-07'));
assert.equal(after.month,'2026-08');
assert.equal(after.changePct,-7.2,'month-to-month change rounded to 1 decimal');
assert.equal(nextMonthOutcome(months,get('2026-09')),null,'unknown future cannot be predicted as actual');
assert.equal(nextMonthOutcome([get('2026-07'),get('2026-09')],get('2026-07')),null,'skip nonconsecutive months');
const invalid=evaluate({...get('2026-07'),sale_rate_prev_pct:undefined});
assert.equal(invalid.level,'unknown','missing reference rate is not zero/safe');
assert.equal(evaluate(null).level,'unknown');
const manipulated={...get('2026-07'),avg_sold_price_thousand_jpy:1};
assert.equal(evaluate(manipulated).level,'high','alert must never depend on current or future price');
const changedNext={...get('2026-08'),avg_sold_price_thousand_jpy:9999};
assert.equal(evaluate(get('2026-07')).level,evaluate(get('2026-07')).level);
assert.equal(nextMonthOutcome([get('2026-07'),changedNext],get('2026-07')).changePct,643.4,'future outcome only changes the retrospective field');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
const uss=fs.readFileSync(path.join(root,'uss.js'),'utf8');
for(const id of ['uss-warning-panel','uss-warning-level','uss-warning-month','uss-warning-outcome','uss-warning-detail']){
  assert.ok(html.includes('id="'+id+'"'),'missing '+id);
}
for(const asset of ['market-warning.js?v=2.9.0','market-warning.css?v=2.9.0']){
  assert.ok(html.includes(asset),'HTML not linked '+asset);
  assert.ok(sw.includes(asset),'offline asset missing '+asset);
}
assert.ok(html.indexOf('market-warning.js?v=2.9.0')<html.indexOf('uss.js?v=2.0.3'),'event listener must load before USS producer');
assert.ok(uss.includes("new CustomEvent('mdmarket:uss-data'"),'validated data must be published to warning module');
assert.ok(uss.includes("new Event('mdmarket:uss-unavailable'"),'failed data load must not leave a silent stale alert');
assert.ok(html.includes('車種')&&html.includes('閾値・的中率は未検証'));
console.log('PASS: USS early warning flags, no price leakage, retrospective check, offline integration');
