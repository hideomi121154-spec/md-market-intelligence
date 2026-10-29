/* Run with Node: node test_store.js. No internet or dependencies required. */
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const env={window:{},URL,console};
vm.runInNewContext(fs.readFileSync(__dirname+'/storage.js','utf8'),env);
const s=env.window.MDStore;
const head='date,make,model,grade,year,mileage_km,price_jpy,channel,market_type,source_url,color,equipment\n';
const csv=head+'2026-10-22,トヨタ,プリウス,Z,2023,22000,2700000,auction,dealer_auction,https://example.test/car/1,ホワイト,サンルーフ|純正ナビ\n'+
'2026-10-23,TOYOTA,プリウス,G,2024,5000,3000000,auction,consumer_auction,https://example.test/car/2,黒,純正ナビ\n'+
'2026-10-24,ホンダ,NBOX,L,2022,30000,1000000,retail,retail_listing,https://example.test/car/3,,\n';
const p=s.readRecords(csv);assert.equal(p.records.length,3);assert.equal(p.rejected,0);
assert.equal(s.canonicalMake('TOYOTA'),'トヨタ');assert.equal(s.canonicalModel('NBOX'),'N-BOX');assert.equal(s.colorGroup('ブラック'),'黒系');
assert.equal(s.filter(p.records,{model:'プリウス'}).length,2);
assert.equal(s.filter(p.records,{equipment:'サンルーフ'}).length,1);
assert.equal(s.filter(p.records,{equipment:'サン'}).length,0);
assert.equal(s.filter(p.records,{yearMin:'2024'}).length,1);
assert.equal(s.filter(p.records,{channel:'retail'}).length,1);
assert.equal(s.summarize(p.records.filter(x=>x.channel==='auction')).median_price_jpy,null);
assert.equal(s.summarize(p.records.filter(x=>x.market_type==='dealer_auction')).median_price_jpy,2700000);
const invalid=s.readRecords(head+'2026-10-22,トヨタ,プリウス,Z,2023,10000,100000,retail,dealer_auction,https://example.test,白,\n');assert.equal(invalid.rejected,1);
assert.equal(s.parseCSV('a,b\n"quoted, field","foo\nbar"\n').length,2);
console.log('PASS: CSV parse, validation, market separation, vehicle filters, equipment tokens (11 checks)');