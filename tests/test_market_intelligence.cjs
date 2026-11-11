'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const logic=require('../market-intelligence-core.js');
const warning=require('../market-warning.js');
const read=f=>JSON.parse(fs.readFileSync(path.join(root,'data',f),'utf8'));
const uss=read('uss_monthly.json');
const kei=read('kei_annual_history.json');
const registered=read('registered_annual_history.json');
const jobs=read('prefecture_jobs.json');
const migration=read('prefecture_migration.json');

const current=logic.radar(uss,'2026-10',warning);
assert.equal(current.month,'2026-10');
assert.equal(current.previousMonth,'2026-09');
assert.equal(current.row.offered,364701);
assert.equal(current.row.sold,227517);
assert.equal(current.delta.offeredPct,10.5);
assert.equal(current.delta.soldPct,7.1);
assert.equal(current.delta.pricePct,4);
assert.equal(current.delta.saleRatePoint,-2);
assert.ok(current.contradictions.length>=2,'detect disagreement without predicting future');
assert.equal(logic.radar(uss,'2026-04',warning).delta.offeredPct,null,'no prior month is not zero');
assert.throws(()=>logic.radar({schema_version:1,months:[{month:'2026-10',offered:1,sold:2}]},null,warning),/不正/);

const supply=logic.forecastCohorts({kei,registered},2028,5,20);
assert.equal(supply.sourceYear,2023);
assert.ok(supply.coveredModels>50);
const nbox=supply.vehicles.find(r=>r.vehicleClass==='軽乗用車'&&logic.norm(r.model)===logic.norm('N-BOX'));
assert.ok(nbox,'N-BOX must retain its official light vehicle cohort');
assert.equal(nbox.units,231385);
assert.equal(nbox.scenario,46277);
assert.equal(supply.partial,true,'ranked 15/50 must never imply complete supply');
const missing=logic.forecastCohorts({kei,registered},2032,5,20);
assert.equal(missing.coveredModels,0);
assert.equal(missing.missing.length,2,'unpublished cohorts are missing not zero');
const referenced=logic.forecastCohorts({kei,registered},2028,7,10);
assert.ok(referenced.vehicles.some(v=>v.sourceType==='secondary'), 'registered 2021 transcriptions labelled');
assert.throws(()=>logic.forecastCohorts({kei,registered},2028,5,-1),/仮定流通率/);
assert.throws(()=>logic.forecastCohorts({kei,registered},2028,4,50),/3・5・7/);

const regional=logic.regionalSignals(jobs,migration,'2026-09','yoy');
assert.equal(regional.reason,null);
assert.equal(regional.rows.length,47);
assert.equal(regional.hasMigrationYoY,true);
const kanagawa=regional.rows.find(r=>r.name==='神奈川県');
assert.ok(kanagawa);
assert.equal(kanagawa.net,15542-13808);
assert.ok(Number.isFinite(kanagawa.netChange));
assert.equal(logic.regionalSignals(jobs,migration,'2026-08','yoy').reason!==null,true,
 'missing migration month must not fabricate demand');
const hypotheses=logic.hypotheses(current,regional,supply);
assert.ok(hypotheses.some(h=>h.id==='composition'));
for(const h of hypotheses)for(const key of ['evidence','theory','alternative','need','disproof'])
 assert.ok(h[key]&&typeof h[key]==='string','hypothesis needs falsification data: '+key);

const past=logic.retrospective(uss,warning);
assert.equal(past.samples.length,uss.months.length-1);
assert.equal(past.assessable,false,'only a few months cannot estimate model accuracy');
assert.equal(past.samples.at(-1).decisionMonth,'2026-09');
assert.equal(past.samples.at(-1).nextMonth,'2026-10');
assert.equal(past.samples.at(-1).nextAvgPct,4);
assert.ok(!past.samples.some(s=>s.decisionMonth==='2026-10'),'latest month is not predicted retrospective future');
assert.equal(logic.retrospective({schema_version:1,months:[uss.months[0],uss.months[2]]},warning).samples.length,0,
 'no bridging missing months');

const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
for(const id of ['mi-panel','mi-reload','mi-radar-result','mi-supply-result','mi-region-result',
 'mi-hypothesis-result','mi-backtest-result','mi-month','mi-region-month','mi-supply-share','mi-sources']){
 assert.ok(html.includes('id="'+id+'"'),'must expose screen control '+id);
}
for(const asset of ['market-intelligence-core.js?v=1.0.0','market-intelligence.js?v=1.0.0','market-intelligence.css?v=1.0.0']){
 assert.ok(html.includes(asset),'missing script/style link '+asset);
 assert.ok(sw.includes("'./"+asset+"'"),'missing offline cache entry '+asset);
}
assert.ok(html.indexOf('market-intelligence-core.js?v=1.0.0')<html.indexOf('market-intelligence.js?v=1.0.0'));
assert.ok(sw.includes("'./data/uss_monthly.json'"),'USS latest snapshot needs offline fallback');
const ui=fs.readFileSync(path.join(root,'market-intelligence.js'),'utf8');
assert.ok(ui.includes('MDOffline')&&ui.includes("data-mi-stage")&&ui.includes('replaceChildren'));
assert.ok(!ui.includes('localStorage.setItem')&&!ui.includes('MDStore.clear'),'public source display is read-only');
console.log('PASS five-stage source-bounded models, missing data, hypotheses, retrospective and iPhone assets');
