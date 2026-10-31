'use strict';
const assert=require('node:assert/strict');
const Inv=require('../inventory-observations.js');
global.MDInventory=Inv;
const Desk=require('../md-evidence.js');
const base={date:'2026-10-01',make:'日産',model:'デイズ',region:'愛知県',grade:'X',color:'赤',conditions:'2022年式、走行5万km以下',count:1200,source_url:'https://www.carsensor.net/used/search?model=days'};
const latest={...base,date:'2026-10-30',count:1000};
const source={schema_version:1,snapshots:[
 {platform:'carsensor',scope:'national',month:'2026-09',source_url:'https://www.carsensor.net/ranking/index.html',models:[{make:'日産',model:'デイズ',rank:7}]},
 {platform:'goonet',scope:'national',month:'2026-09',source_url:'https://www.goo-net.com/ranking/',models:[{make:'日産',model:'ノート',rank:2}]},
]};
const key=Inv.seriesKey(base);
const evaluate=(obs=[base,latest],records=[],reviews=[],rank=source,date='2026-10-31')=>Desk.evidenceForSeries(obs,records,reviews,rank,key,date);
const evidence=evaluate();
assert.equal(evidence.available,true);
assert.equal(evidence.vehicle,'日産 デイズ');
assert.equal(evidence.verdict,'仕入れ判断は保留');
assert.equal(evidence.supply.delta,-200);
assert.ok(Math.abs(evidence.supply.percent+16.6666667)<0.01);
assert.equal(evidence.supply.ready,true);
assert.equal(evidence.demand.length,1);
assert.equal(evidence.demand[0].rank,7);
assert.equal(evidence.demand[0].platform,'carsensor');
assert.equal(evidence.prices.checkedCount,0);
assert.equal(evidence.prices.ready,false);
assert.match(evidence.issues.join(' '),/成約価格/);
const listing=(i,overrides={})=>({
 id:'test-'+i,date:'2026-10-29',make:'日産',model:'デイズ',region:'愛知県',grade:'X',color:'赤',channel:'retail',market_type:'retail_listing',
 source_url:'https://www.carsensor.net/used/detail/'+i,price_jpy:550000+i,...overrides
});
const prices=Array.from({length:5},(_,i)=>listing(i));
const audits=prices.map(r=>({id:r.id,status:'user_checked'}));
assert.equal(evaluate(undefined,prices,audits).prices.checkedCount,5);
assert.equal(evaluate(undefined,prices,audits).prices.ready,true);
assert.equal(evaluate(undefined,prices,audits.slice(0,4)).prices.checkedCount,4);
assert.equal(evaluate(undefined,prices,audits.slice(0,4)).prices.ready,false);
assert.equal(evaluate(undefined,prices.map((x,i)=>i===0?{...x,market_type:'dealer_auction'}:x),audits).prices.checkedCount,4);
assert.equal(evaluate(undefined,prices.map((x,i)=>i===0?{...x,region:'全国'}:x),audits).prices.checkedCount,4);
assert.equal(evaluate(undefined,prices.map((x,i)=>i===0?{...x,grade:'S'}:x),audits).prices.checkedCount,4);
assert.equal(evaluate(undefined,prices.map((x,i)=>i===0?{...x,color:'黒'}:x),audits).prices.checkedCount,4);
assert.equal(evaluate(undefined,prices.map((x,i)=>i===0?{...x,date:'2025-01-01'}:x),audits).prices.checkedCount,4);
assert.equal(evaluate(undefined,prices,prices.map(r=>({id:r.id,status:'flagged'}))).prices.checkedCount,0);
const duplicate=prices.map((p,i)=>i===4?{...p,source_url:prices[0].source_url}:p);
assert.equal(evaluate(undefined,duplicate,audits).prices.ready,false,'five records with four unique source URLs are not sufficient');
const noGrade=evaluate([ {...base,grade:'',color:''}, {...latest,grade:'',color:''} ]);
assert.equal(noGrade.prices.ready,false);
assert.match(noGrade.prices.limitation,/グレードと色/);
assert.equal(evaluate([base]).supply.ready,false);
assert.equal(evaluate([{...base,count:0},latest]).supply.percent,null);
const aged=evaluate([{...base,date:'2026-08-01'},{...latest,date:'2026-09-01'}],[],[],source,'2026-10-31');
assert.equal(aged.supply.ready,false);
assert.equal(evaluate([base,latest],[],[],source,'2027-03-01').demand.length,0,'stale demand must not count as fresh');
assert.equal(evaluate([base,latest],[],[],{schema_version:1,snapshots:[]}).demand.length,0,'no rank is not "unpopular"');
assert.equal(evaluate([{...base,region:'愛知県'},{...latest,region:'全国'}]).supply.previous,null,'do not mix regions');
assert.equal(evaluate([{...base,source_url:'https://different.example.net/used'},{...latest}]).supply.previous,null,'do not mix source URLs');
assert.equal(evaluate([]).available,false);
console.log('PASS MD evidence: listing comparability, regional boundaries, demand scope, stale records, checked prices, no auto buying');
