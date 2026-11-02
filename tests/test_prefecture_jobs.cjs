'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const api=require('../prefecture-jobs.js');
const {PREF,validate,compare,SOURCE}=api;
assert.equal(PREF.length,47);
assert.equal(new Set(PREF).size,47);
assert.ok(PREF.includes('愛知県')&&PREF.includes('広島県'));
const publicData=JSON.parse(fs.readFileSync(path.join(root,'data/prefecture_jobs.json'),'utf8'));
assert.equal(validate(publicData,true),publicData);
if(publicData.available){
 assert.equal(publicData.source_type,'e_stat_file_verified');
 assert.ok(/^[0-9]{12}$/.test(publicData.source_file_id));
 assert.ok(/^[a-f0-9]{64}$/.test(publicData.source_sha256));
 assert.ok(publicData.months.length>=14);
 assert.ok(publicData.months.at(-1).month>='2026-09');
 const sept=publicData.months.find(x=>x.month==='2026-09');
 assert.ok(sept,'2026-09 must exist');
 assert.equal(Object.values(sept.values).reduce((a,b)=>a+b,0),777944,'official national sheet1 total must reconcile');
 const yoy=compare(publicData,'2026-09','yoy');
 assert.equal(yoy.status,'ready');
} else {
 assert.equal(publicData.months.length,0);
 assert.throws(()=>validate(publicData),/公表日/);
}
const vals=(base)=>Object.fromEntries(PREF.map((n,i)=>[n,base+i*10]));
const row=(month,base)=>({month,values:vals(base)});
const data={
  schema_version:1,dataset:'hello_work_prefecture_new_offers',geography:'accepted_at_prefecture',
  measure:'monthly_new_job_offers_original_count',source_table:'long_term_table_12',
  source_url:SOURCE,source_type:'user_import_unverified',
  available:true,published_on:'2026-10-30',
  months:[row('2025-09',1000),row('2026-08',1100),row('2026-09',1200)]
};
assert.equal(validate(data),data);
const m=compare(data,'2026-09','mom');
assert.equal(m.status,'ready');assert.equal(m.rising,47);assert.equal(m.falling,0);
assert.equal(m.rows.find(r=>r.name==='愛知県').difference,100);
assert.equal(m.rows.find(r=>r.name==='広島県').difference,100);
const yoy=compare(data,'2026-09','yoy');
assert.equal(yoy.status,'ready');assert.equal(yoy.rows.find(r=>r.name==='愛知県').difference,200);
assert.equal(compare(data,'2026-08','mom').status,'unavailable','missing July cannot silently bridge gaps');
assert.equal(compare(data,'2026-08','yoy').status,'unavailable');
assert.throws(()=>validate({...data,months:[row('2026-09',1000),row('2026-08',1000)]}),/月または/);
assert.throws(()=>validate({...data,months:[{month:'2026-09',values:{'愛知県':123}}]}),/月または/);
assert.throws(()=>validate({...data,months:[{month:'2026-09',values:{...vals(1000),'愛知県':-1}}]}),/不正な求人数/);
assert.throws(()=>validate({...data,published_on:'2026-08-01'}),/公表日/);
assert.throws(()=>validate({...data,source_url:'https://example.com'}),/形式/);
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
const js=fs.readFileSync(path.join(root,'prefecture-jobs.js'),'utf8');
for(const asset of ['prefecture-jobs.js?v=4.5.0','prefecture-jobs.css?v=4.5.0']){
 assert.ok(html.includes(asset),asset+' missing HTML');
 assert.ok(sw.includes(asset),asset+' missing SW');
}
assert.ok(sw.includes('./data/prefecture_jobs.json'));
assert.ok(html.includes('id="prefecture-jobs-panel"'));
assert.ok(html.includes('id="prefecture-jobs-data-source"'));
assert.ok(html.includes('id="prefecture-jobs-trend"'));
assert.ok(js.includes('MDOffline.read('),'offline-first access required');
assert.ok(js.includes("localStorage.setItem(KEY"),'mobile local import persistence required');
assert.ok(js.includes("raw.source_type='user_import_unverified'"),'user import must never auto-promote as verified');
console.log('PASS: 47 prefectures, strict monthly data, provenance, MoM/YoY comparisons, no bridge/fabrication, offline UI');
