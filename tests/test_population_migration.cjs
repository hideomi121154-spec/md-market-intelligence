'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const jobsApi=require('../prefecture-jobs.js');
const migration=require('../population-migration.js');
const jobData=JSON.parse(fs.readFileSync(path.join(__dirname,'../data/prefecture_jobs.json'),'utf8'));
const PREF=migration.PREF;
assert.equal(PREF.length,47);
assert.equal(migration.validate(JSON.parse(fs.readFileSync(path.join(__dirname,'../data/prefecture_migration.json'),'utf8')),true).available,false);
const values=Object.fromEntries(PREF.map(name=>[name,{in:1000,out:1000}]));
values['島根県']={in:675,out:706};
values['愛知県']={in:1031,out:1000};
const sample={schema_version:1,dataset:'interprefecture_migration_total',
  geography:'prefecture',measure:'monthly_in_out_domestic_moves',
  source_url:migration.SOURCE,source_table:'stat_go_jp_table_2',
  available:true,source_type:'user_import_unverified',published_on:'2026-10-27',
  months:[{month:'2026-09',values}]};
assert.equal(migration.validate(sample),sample);
const result=migration.combined(jobData,sample,'2026-09','mom');
assert.equal(result.status,'ready');
assert.equal(result.rows.length,47);
assert.equal(result.rows.find(r=>r.name==='島根県').net,-31);
assert.equal(result.rows.find(r=>r.name==='島根県').signal,'求人増・転出超過');
assert.equal(result.rows.find(r=>r.name==='島根県').jobPct,35.5);
const noData=migration.combined(jobData,sample,'2026-08','mom');
assert.equal(noData.status,'unavailable');
assert.equal(noData.rows.length,0);
assert.throws(()=>migration.validate({...sample,months:[{month:'2026-09',values:{...values,'島根県':{in:1,out:1}}}]}),/一致しません/);
assert.throws(()=>migration.validate({...sample,source_type:'stat_go_jp_xlsx_verified'}),/SHA256/);
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
for(const id of ['migration-jobs-panel','migration-pref','migration-month','migration-mode','migration-cards','migration-rows','migration-import','migration-clear'])
  assert.ok(html.includes('id="'+id+'"'),id);
const sw=fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8');
assert.ok(sw.includes('./population-migration.js?v=4.6.0'));
console.log('PASS population-migration jobs+registered-migration validation / mobile markup');
