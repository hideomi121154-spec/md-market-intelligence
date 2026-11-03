const assert=require('node:assert/strict');
const fs=require('node:fs');
const M=require('../resale-research.js');
const row={
 make:'トヨタ',model:'アルファード',powertrain:'gasoline',segment:'車種全体',metric:'year_avg',model_year:2022,
 period_end:'2026-10-31',published_on:'2026-11-02',observed_on:'2026-11-03',
 average_estimate_jpy:3484090,average_mileage_km:43357,sample_count:null,
 source_url:'https://resalevalue.jp/article/alphard/',memo:'原典の年式別表を確認'
};
assert.equal(M.normalize(row).average_estimate_jpy,3484090);
assert.equal(M.merge([row],[row]).length,1);
const older={...row,period_end:'2026-10-24',published_on:'2026-10-26',observed_on:'2026-11-01',average_estimate_jpy:3300000};
const arr=M.merge([older],[row]);
assert.equal(M.compare(arr,M.normalize(row)).amount,184090);
assert.equal(M.parseBundle(M.bundle(arr)).length,2);
assert.throws(()=>M.normalize({...row,source_url:'javascript:alert(1)'}),/URL/);
assert.throws(()=>M.normalize({...row,source_url:'https://resalevalue.jp.evil.test/article/alphard/'}),/公式記事/);
assert.throws(()=>M.normalize({...row,metric:'weekly_avg',model_year:null,average_mileage_km:43357}),/週次全体平均/);
assert.throws(()=>M.normalize({...row,sample_count:692}),/車種全体/);
assert.throws(()=>M.normalize({...row,period_end:'2026-02-30'}),/日付/);
assert.throws(()=>M.merge([row],[{...row,average_estimate_jpy:1}]),/異なります/);
assert.throws(()=>M.parseBundle('{"schema":"other","rows":[]}'),/バックアップ/);
assert.equal(M.compare(M.merge([older,{...row,segment:'Zレザーパッケージ',average_estimate_jpy:3500000}]),M.normalize({...row,segment:'Zレザーパッケージ',average_estimate_jpy:3500000})),null);
const other={...row,model:'ハリアー',source_url:'https://resalevalue.jp/article/harrier/',average_estimate_jpy:1000000};
assert.equal(M.compare(M.merge([older,other]),M.normalize(other)),null);
const page=fs.readFileSync(require('node:path').join(__dirname,'..','index.html'),'utf8');
const sw=fs.readFileSync(require('node:path').join(__dirname,'..','sw.js'),'utf8');
for(const text of ['id="resale-panel"','id="resale-form"','resale-research.js?v=1.0.0','resale-research.css?v=1.0.0'])assert.ok(page.includes(text),text);
for(const text of ['resale-research.js?v=1.0.0','resale-research.css?v=1.0.0'])assert.ok(sw.includes(text),text);
console.log('PASS: resale official source checks, manual-only records, series comparability, safe backup and wiring');
