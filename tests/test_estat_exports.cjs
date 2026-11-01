'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),M=require('../estat-exports.js');
const empty=JSON.parse(fs.readFileSync(path.join(root,'data/estat_used_vehicle_exports.json'),'utf8'));
assert.equal(M.officialData(empty).status,'not_configured');
assert.equal(M.figures(empty,'ロシア','2026-09').status,'not_configured');
const hs=['870321915','870321925','870322910','870323915','870323925','870324910','870331100','870332915','870332925','870333910','870340100','870350100','870360100','870370100','870380100','870390100'];
const data={schema_version:1,status:'available',year:2026,stats_data_id:'0004049306',
 source_url:'https://www.e-stat.go.jp/stat-search/database?layout=dataset',updated_at:'2026-11-01T10:00:00+00:00',
 months:['2026-08','2026-09'],hs_labels:Object.fromEntries(hs.map(x=>[x,x])),
 rows:[
  {period:'2026-09',country:'ロシア',area_code:'50224',hs_code:'870322910',units:12},
  {period:'2026-09',country:'ロシア',area_code:'50224',hs_code:'870380100',units:0},
  {period:'2026-09',country:'タンザニア',area_code:'50543',hs_code:'870340100',units:15}
 ]};
assert.equal(M.officialData(data).rows.length,3);
const ru=M.figures(data,'ロシア','2026-09');
assert.equal(ru.status,'available');
assert.equal(ru.byGroup.find(x=>x.id==='petrol').units,12);
assert.equal(ru.byGroup.find(x=>x.id==='ev').units,0);
assert.equal(ru.byGroup.find(x=>x.id==='hv').units,null);
assert.equal(M.figures(data,'ロシア','2026-08').status,'missing_country');
assert.equal(M.figures(data,'ロシア','2026-10').status,'missing_month');
assert.throws(()=>M.officialData({...data,rows:[data.rows[0],data.rows[0]]}),/重複/);
assert.throws(()=>M.officialData({...data,rows:[{...data.rows[0],hs_code:'870322920'}]}),/不正/);
assert.throws(()=>M.officialData({...data,rows:[{...data.rows[0],units:-1}]}),/不正/);
assert.throws(()=>M.officialData({...data,status:'not_configured'}),/未設定/);
const html=fs.readFileSync(path.join(root,'index.html'),'utf8'),sw=fs.readFileSync(path.join(root,'sw.js'),'utf8');
for(const id of ['estat-export-panel','estat-export-country','estat-export-month','estat-export-results','estat-export-status'])
 assert.ok(html.includes('id="'+id+'"'),id);
for(const asset of ['estat-exports.js?v=4.2.0','estat-exports.css?v=4.2.0'])
 assert.ok(html.includes(asset)&&sw.includes(asset),asset);
assert.ok(sw.includes("'./data/estat_used_vehicle_exports.json'"));
assert.ok(html.includes('country-mix-panel'));
assert.ok(!fs.readFileSync(path.join(root,'estat-exports.js'),'utf8').includes('innerHTML'));
console.log('PASS: official e-Stat source and missing≠0, HS categories, safe PWA wiring');
