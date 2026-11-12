'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const L=require('../listing-counts.js');
const d=new Date(),p=n=>String(n).padStart(2,'0');
const today=d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());
d.setDate(d.getDate()-1);
const yesterday=d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());
const base={platform:'carsensor',make:'トヨタ',model:'プリウス',date:yesterday,count:12000,
 source_url:'https://www.carsensor.net/usedcar/bTO/s122/index.html'};
assert.equal(L.validateObservation(base).scope,'national');
assert.equal(L.verifiedLink('carsensor','ホンダ','Ｎ－ＢＯＸ'),
 'https://www.carsensor.net/usedcar/bHO/s094/index.html');
assert.equal(L.verifiedLink('goonet','トヨタ','プリウス'),
 'https://www.goo-net.com/usedcar/brand-TOYOTA/car-PRIUS/');
assert.equal(L.verifiedLink('goonet','ホンダ','N-BOXカスタム'),
 'https://www.goo-net.com/usedcar/brand-HONDA/car-N-BOX_CUSTOM/');
assert.equal(L.verifiedLink('goonet','トヨタ','クラウンハイブリッド'),null,
 'Crown Hybrid must not silently redirect to the broader Crown results');
assert.equal(L.verifiedLink('carsensor','トヨタ','ハイエースバン'),
 'https://www.carsensor.net/usedcar/bTO/s185/index.html');
assert.equal(L.verifiedLink('carsensor','トヨタ','セレナ'),null);
assert.equal(L.officialUrl('carsensor','https://www.carsensor.net/usedcar/bTO/s122/index.html'),true);
assert.equal(L.officialUrl('carsensor','https://www.goo-net.com/usedcar/brand-TOYOTA/car-PRIUS/'),false);
assert.equal(L.officialUrl('goonet','https://www.goo-net.com.evil.net/usedcar/'),false);
assert.equal(L.officialUrl('carsensor','http://www.carsensor.net/usedcar/'),false);
assert.equal(L.officialUrl('goonet','https://www.goo-net.com/ranking/'),false);
assert.throws(()=>L.validateObservation({...base,count:-1}));
assert.throws(()=>L.validateObservation({...base,date:'2099-01-01'}));
assert.throws(()=>L.validateObservation({...base,source_url:'https://www.goo-net.com/usedcar/'}));
assert.throws(()=>L.validateObservation({...base,count:NaN}));
const next={...base,date:today,count:10500};
let rows=L.mergeRows([], [base,next]);
assert.equal(rows.length,2);
let stats=L.listingStats(rows,'carsensor','トヨタ','プリウス');
assert.equal(stats.latest.count,10500);
assert.equal(stats.delta,-1500);
assert.equal(stats.pct,-12.5);
rows=L.mergeRows(rows,[{...next,count:11000}]);
assert.equal(rows.length,2,'Correcting the same date and URL replaces one observation');
assert.equal(L.listingStats(rows,'carsensor','トヨタ','プリウス').delta,-1000);
rows=L.mergeRows(rows,[{...next,platform:'goonet',count:9500,
 source_url:'https://www.goo-net.com/usedcar/brand-TOYOTA/car-PRIUS/'}]);
assert.equal(rows.length,3,'Two sites cannot be conflated');
assert.equal(L.listingStats(rows,'goonet','トヨタ','プリウス').delta,null);
const changedUrl={...next,source_url:'https://www.carsensor.net/usedcar/bTO/s122/new/index.html',count:8000};
rows=L.mergeRows(rows,[changedUrl]);
assert.equal(L.listingStats(rows,'carsensor','トヨタ','プリウス').delta,null,
 'Changing the search URL must not generate a false listing-count trend');
const html=fs.readFileSync(__dirname+'/../index.html','utf8');
const sw=fs.readFileSync(__dirname+'/../sw.js','utf8');
assert.ok(html.includes('listing-counts.js?v=1.0.0'));
assert.ok(sw.includes("'./listing-counts.js?v=1.0.0'"));
for(const id of ['listing-count-status','listing-count-export','listing-count-restore','listing-count-backup'])
 assert.ok(html.includes('id="'+id+'"'));
assert.ok(!fs.readFileSync(__dirname+'/../listing-counts.js','utf8').includes('fetch('),
 'No fetch or crawling of third-party search pages');
console.log('PASS model listing notes: per-site counts, date, official source URL, trend, corrections, and iPhone assets');