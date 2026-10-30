'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const H=require('../registered-history.js');
const d=JSON.parse(fs.readFileSync(__dirname+'/../data/registered_annual_history.json','utf8'));
const years=H.validate(d);
assert.deepEqual(years.map(y=>y.year),[2021,2022,2023,2024,2025]);
assert.ok(years.every(y=>y.models.length===50));
assert.deepEqual(years.map(y=>y.source_type),['secondary','official','official','official','official']);
function units(make,model){
  return H.findVehicle(years,{make,model}).map(y=>y.row?.units??null);
}
assert.deepEqual(units('トヨタ','プリウス'),[49179,32675,99149,83485,63717]);
assert.deepEqual(units('トヨタ','ヤリス'),[212927,168557,194364,166162,166533]);
assert.deepEqual(units('トヨタ','シエンタ'),[57802,68922,132332,111090,106558]);
assert.deepEqual(units('日産','ノート'),[90177,110113,102508,101766,78123]);
assert.equal(units('トヨタ','ランドクルーザー')[0],null,'Do not silently merge old Land Cruiser W with different family');
assert.equal(H.findVehicle(years,{make:'トヨタ',model:'非掲載車'}).every(y=>y.row===null),true,'missing means outside top50, not zero');
assert.equal(H.key({make:'SUBARU',model:'インプレッサ'}),H.key({make:'スバル',model:'インプレッサ'}));
assert.ok(H.listModels(years).length>=50);
assert.throws(()=>H.validate({...d,years:years.slice(0,4)}));
assert.throws(()=>H.validate({...d,years:years.map((y,i)=>i===2?{...y,models:y.models.slice(0,49)}:y)}));
console.log('PASS: 2021-2025 registered new-car series with transparent secondary provenance, canonical names and missing rows');
