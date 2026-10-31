'use strict';
const assert=require('node:assert/strict');
const F=require('../fault-research.js');
const link=new URL(F.liveQueryUrl('トヨタ','アクア','NHP10'));
assert.equal(link.hostname,'api.gdeltproject.org');
assert.equal(link.searchParams.get('mode'),'artlist');
assert.ok(link.searchParams.get('query').includes('"アクア"'));
assert.ok(link.searchParams.get('query').includes('"NHP10"'));
assert.ok(F.liveQueryUrl('ホンダ','N-BOX').includes('N-BOX'));
assert.throws(()=>F.liveQueryUrl('','',''),/車種/);
assert.equal(F.liveMatches('トヨタ アクア NHP10 エアコン故障','トヨタ','アクア','NHP10'),true);
assert.equal(F.liveMatches('日産 ノート HE12 不具合','日産','ノート','E12'),false);
assert.equal(F.liveMatches('日産 ノート E12 不具合','日産','ノート','E12'),true);
assert.equal(F.liveMatches('トヨタ プリウス 故障','トヨタ','アクア'),false);
const payload={articles:[
 {title:'トヨタ アクア NHP10 エアコン 不具合',url:'https://example.org/a',seendate:'20261030T123000Z'},
 {title:'トヨタ アクア NHP10 エアコン 不具合',url:'https://example.org/a',seendate:'20261030T123000Z'},
 {title:'トヨタ アクア NHP10 CVT 変速故障',url:'https://example.org/c'},
 {title:'トヨタ アクア NHP10 故障',url:'javascript:alert(1)'},
 {title:'トヨタ アクア NHP11 エアコン故障',url:'https://example.org/wrong'},
 {title:'トヨタ ヴィッツ NHP10 エアコン故障',url:'https://example.org/wrong-model'}
]};
const result=F.classifyLiveArticles(payload,'トヨタ','アクア','NHP10');
assert.equal(result.total,2);
assert.deepEqual(result.groups.map(x=>x.count),[1,1]);
assert.ok(result.groups.some(x=>x.name==='エアコン・温度調整'));
assert.ok(result.groups.some(x=>x.name==='変速機・CVT'));
assert.throws(()=>F.classifyLiveArticles({},'トヨタ','アクア'),/正常なJSON/);
F.liveArticleSearch('マツダ','CX-5','',async(url,options)=>{
 assert.ok(url.includes('CX-5'));
 assert.equal(options.mode,'cors');
 return {ok:true,json:async()=>({articles:[{title:'マツダ CX-5 エンジン 不具合',url:'https://example.org/p'}]})};
}).then(x=>{
 assert.equal(x.total,1);
 console.log('PASS universal model live search, strict model-code separation, categories and API adapter');
}).catch(err=>{console.error(err);process.exitCode=1});
