'use strict';
const assert=require('node:assert/strict');
const F=require('../fault-research.js');
const sample={schema_version:1,updated_at:'2026-10-31',vehicles:[
 {make:'日産',model:'ノート',code:'DBA-E12',report_groups:[{name:'CVT',count:35,source:'s',source_url:'https://example.org/a'}],
  supplemental:[],web_mentions:[{category:'エアコン',title:'修理例A',url:'https://example.org/1',kind:'news_rss'},{category:'エアコン',title:'修理例A',url:'https://example.org/2',kind:'news_rss'}]},
 {make:'日産',model:'ノート',code:'HE12',report_groups:[],supplemental:[],web_mentions:[]}
]};
assert.equal(F.filterVehicles(sample,'日産','ノート','E12').length,1);
assert.equal(F.filterVehicles(sample,'日産','ノート','DBA-E12')[0].code,'E12');
assert.equal(F.filterVehicles(sample,'','ノート','').length,2);
assert.equal(F.filterVehicles(sample,'','ノート','E13').length,0);
assert.equal(F.filterVehicles(sample,'','ノート','HE12').length,1);
assert.equal(F.filterVehicles(sample,'','セレナ','').length,0);
assert.equal(F.groupMentions(sample.vehicles[0].web_mentions)[0].count,1);
assert.equal(F.validate(sample).vehicles[0].report_groups[0].count,35);
assert.throws(()=>F.validate({...sample,schema_version:3}),/形式/);
assert.throws(()=>F.validate({...sample,vehicles:[{...sample.vehicles[0],report_groups:[{name:'X',count:2,source_url:'javascript:alert(1)'}]}]}),/出典/);
assert.ok(F.searchLinks('日産','ノート','E12')[0].url.includes('E12'));
console.log('PASS: fault research filtering, code separation, provenance and ranking dedupe');
