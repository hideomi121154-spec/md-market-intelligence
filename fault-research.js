/* MD MARKET v2.7: in-app vehicle fault research rankings. Never call unknown pages or make up rates. */
(function(root){
'use strict';
const DATA='./data/fault-research-index.json';
const $=id=>document.getElementById(id);
const clean=v=>String(v??'').normalize('NFKC').trim().replace(/\s+/g,' ');
const code=v=>clean(v).toUpperCase().replace(/\s/g,'').replace(/^[A-Z0-9]{2,4}-/,'');
const key=v=>clean(v).toLowerCase().replace(/[\s・‐－\-]/g,'');
function isHttpUrl(input){try{const u=new URL(input);return ['https:','http:'].includes(u.protocol)&&!u.username&&!u.password&&u.hostname.includes('.');}catch{return false}}
function validate(data){
 if(!data||data.schema_version!==1||!Array.isArray(data.vehicles)||data.vehicles.length>100)
  throw Error('故障調査データの形式が正しくありません');
 const allowed=new Set(['mlit_secondary','news_rss','web_search','sns_api']);
 const vehicles=data.vehicles.map(v=>{
  if(!v||!clean(v.make)||!clean(v.model)||!code(v.code))throw Error('メーカー・車名・型式がありません');
  const groups=Array.isArray(v.report_groups)?v.report_groups:[];
  if(groups.length>25)throw Error('分類が多すぎます');
  const report_groups=groups.map(g=>{
   if(!clean(g.name)||!Number.isSafeInteger(g.count)||g.count<0||!isHttpUrl(g.source_url))throw Error('報告分類・出典が不正です');
   return {name:clean(g.name),count:g.count,source:clean(g.source),source_url:g.source_url,details:clean(g.details),scope:clean(g.scope)};
  });
  const supplemental=(Array.isArray(v.supplemental)?v.supplemental:[]).map(g=>{
   if(!clean(g.name)||!Number.isSafeInteger(g.count)||g.count<0||!isHttpUrl(g.source_url))throw Error('参考報告情報が不正です');
   return {name:clean(g.name),count:g.count,source:clean(g.source),source_url:g.source_url,note:clean(g.note)};
  });
  const mentions=(Array.isArray(v.web_mentions)?v.web_mentions:[]).filter(m=>m&&allowed.has(m.kind)&&isHttpUrl(m.url)&&clean(m.title)&&clean(m.category));
  return {make:clean(v.make),model:clean(v.model),code:code(v.code),label:clean(v.label)||code(v.code),
   report_groups, supplemental,web_mentions:mentions.slice(0,120),checked_at:clean(v.checked_at),source_note:clean(v.source_note)};
 });
 return {schema_version:1,updated_at:clean(data.updated_at),data_period:clean(data.data_period),vehicles};
}
function filterVehicles(data,make,model,modelCode=''){
 const m=key(make),n=key(model),c=code(modelCode);
 return validate(data).vehicles.filter(v=>(!m||key(v.make).includes(m))&&(!!n&&key(v.model).includes(n))&&(!c||v.code===c));
}
function groupMentions(mentions){
 const map=new Map(),dedup=new Set();
 for(const m of mentions){
  if(!m||!isHttpUrl(m.url)||!clean(m.title)||!clean(m.category))continue;
  const link=m.url.split('#')[0];const uniq=m.title.toLowerCase().normalize('NFKC').replace(/\s+/g,' ');
  if(dedup.has(uniq))continue; dedup.add(uniq);
  const name=clean(m.category),item=map.get(name)||{name,count:0,examples:[]};
  item.count++;if(item.examples.length<8)item.examples.push({...m,url:link});map.set(name,item);
 }
 return [...map.values()].sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'ja'));
}
function searchLinks(make,model,modelCode){
 const q=[clean(make),clean(model),code(modelCode),'故障 修理 不具合'].filter(Boolean).join(' ');
 const enc=encodeURIComponent(q);
 return [
  {label:'Web記事を検索',url:'https://www.google.com/search?q='+enc},
  {label:'Xの投稿を検索',url:'https://x.com/search?q='+encodeURIComponent(q)+'&f=live'},
  {label:'みんカラを検索',url:'https://www.google.com/search?q='+encodeURIComponent('site:minkara.carview.co.jp '+q)},
  {label:'国交省不具合情報',url:'https://renrakuda.mlit.go.jp/renrakuda/opn.html'}
 ];
}

/* Every user-supplied make/model can be researched via a live, public article-search API.
   News article hits are NOT reported faults, recall counts, or vehicle failure rates.
   GDELT Doc API publishes Access-Control-Allow-Origin: * for browser clients. */
const LIVE_API='https://api.gdeltproject.org/api/v2/doc/doc';
const ISSUE_RULES=[
 {name:'エアコン・温度調整',rx:/エアコン|エアミックス|コンプレッサ|冷房|暖房|air.?condition|aircon/i},
 {name:'変速機・CVT',rx:/CVT|ミッション|変速|トランスミッション|transmission/i},
 {name:'エンジン・始動',rx:/エンジン|エンスト|始動|点火|engine|stall/i},
 {name:'電装・バッテリー',rx:/バッテリー|発電機|電装|オルタネータ|battery|electrical/i},
 {name:'吸気・過給機',rx:/吸気|インタークーラ|ターボ|スーパーチャージャ|turbo/i},
 {name:'ブレーキ・制動',rx:/ブレーキ|制動|ABS|brake/i},
 {name:'足回り・操舵',rx:/足回り|ステアリング|サスペンション|タイヤ|suspension|steering/i},
 {name:'その他・部位不明',rx:/./}
];
function liveQueryUrl(make,model,modelCode=''){
 const m=clean(make),n=clean(model),c=code(modelCode);
 if(!n||n.length>80||m.length>50||c.length>30)throw Error('メーカー・車種・型式を確認してください');
 const safe=s=>'"'+s.replace(/["\\()]/g,' ').trim()+'"';
 const parts=[m,n,c].filter(Boolean).map(safe);
 const term=parts.join(' ')+' (故障 OR 不具合 OR リコール OR 修理)';
 const u=new URL(LIVE_API);
 u.searchParams.set('query',term);
 u.searchParams.set('mode','artlist');
 u.searchParams.set('format','json');
 u.searchParams.set('sort','datedesc');
 u.searchParams.set('maxrecords','75');
 u.searchParams.set('timespan','3m');
 return u.toString();
}
function liveMatches(title,make,model,modelCode){
 const t=key(title),m=key(make),n=key(model),c=code(modelCode);
 if(!n||!t.includes(n))return false;
 if(m&&!t.includes(m))return false;
 if(c){
   const normalized=clean(title).normalize('NFKC').toUpperCase();
   const re=new RegExp('(^|[^A-Z0-9])'+c.replace(/[^A-Z0-9]/g,'')+'(?=$|[^A-Z0-9])');
   if(!re.test(normalized))return false;
 }
 return true;
}
function classifyLiveArticles(payload,make,model,modelCode=''){
 if(!payload||!Array.isArray(payload.articles))throw Error('記事APIが正常なJSONを返しませんでした');
 const groups=new Map(),seen=new Set();let checked=0;
 for(const article of payload.articles.slice(0,150)){
  if(!article||!isHttpUrl(article.url)||!clean(article.title))continue;
  const title=clean(article.title),url=article.url;
  if(!liveMatches(title,make,model,modelCode))continue;
  const unique=title.toLowerCase()+'|'+url.split('?')[0];
  if(seen.has(unique))continue;seen.add(unique);checked++;
  const label=ISSUE_RULES.find(x=>x.rx.test(title)).name;
  const item=groups.get(label)||{name:label,count:0,examples:[]};
  item.count++;
  if(item.examples.length<12)item.examples.push({title,url,seendate:clean(article.seendate)});
  groups.set(label,item);
 }
 return {total:checked,groups:[...groups.values()].sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'ja'))};
}
async function liveArticleSearch(make,model,modelCode='',fetcher=(...args)=>fetch(...args)){
 const url=liveQueryUrl(make,model,modelCode);
 const r=await fetcher(url,{method:'GET',mode:'cors',cache:'no-store'});
 if(!r||!r.ok)throw Error('外部記事検索APIに接続できませんでした（HTTP '+(r?.status??'不明')+'）');
 const data=await r.json();
 return classifyLiveArticles(data,make,model,modelCode);
}

const API={validate,filterVehicles,groupMentions,searchLinks,code,DATA,liveQueryUrl,liveMatches,classifyLiveArticles,liveArticleSearch};
if(typeof module==='object'&&module.exports)module.exports=API;
root.MDFaultResearch=API;
if(typeof document==='undefined')return;
const section=$('fault-search-panel');if(!section)return;
const form=$('fault-search-form'),view=$('fault-search-results'),msg=$('fault-search-status');
const element=(name,cls,text)=>{const e=document.createElement(name);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e};
function anchor(url,text){const a=element('a','fault-link',text);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a}
function output(text){msg.textContent=text}
function fillLinks(make,model,modelCode){
 const links=$('fault-search-links');links.replaceChildren();
 for(const l of searchLinks(make,model,modelCode))links.append(anchor(l.url,l.label));
}
function ranking(v){
 const wrap=element('section','fault-ranked');
 const groups=v.report_groups.slice().sort((a,b)=>b.count-a.count);
 if(groups.length){
  wrap.append(element('h4',null,'不具合の報告件数ランキング'));
  wrap.append(element('p','fault-note','同一の公表集計に基づく分類別の申告件数です。故障率・発生確率・安全性の順位ではありません。'));
  groups.forEach((g,i)=>{
   const card=element('article','fault-ranked-item');
   const h=element('div','fault-ranked-head');
   h.append(element('strong',null,(i+1)+'位　'+g.name),element('span','fault-ranked-number',g.count.toLocaleString('ja-JP')+'件'));
   card.append(h);
   if(g.details)card.append(element('p','fault-note',g.details));
   const meta=element('p','fault-note',g.scope||v.label);
   meta.append(' ／ ',anchor(g.source_url,'集計の出典を確認'));card.append(meta);wrap.append(card);
  });
 }else{
  wrap.append(element('p','fault-note','この型式について、比較可能な公的申告の分類別集計はまだ登録されていません。0件という意味ではありません。'));
 }
 if(v.supplemental.length){
  wrap.append(element('h4',null,'関連する別集計（上の順位には含めない）'));
  for(const g of v.supplemental){
   const row=element('article','fault-ranked-item');
   row.append(element('strong',null,g.name+'：'+g.count+'件'),element('p','fault-note',g.note||'別の分類・対象範囲に基づく数字です。順位には合算しません。'));
   row.append(anchor(g.source_url,'別集計の出典を見る'));wrap.append(row);
  }
 }
 const ranked=groupMentions(v.web_mentions);
 wrap.append(element('h4',null,'ネットで見つかった故障関連の話題'));
 if(!ranked.length)wrap.append(element('p','fault-note','この型式のオンライン記事はまだ収録されていません。SNSの投稿や全インターネットを検索し終えた意味ではありません。'));
 else{
  wrap.append(element('p','fault-note','定期収集されたニュース・許諾された検索結果の見出しを分類した「収録ヒット件数」です。故障の確定件数ではありません。'));
  ranked.forEach((g,i)=>{
   const d=element('details','fault-ranked-item');
   const summary=element('summary',null,(i+1)+'位　'+g.name+'　'+g.count+'件（見出し）');
   d.append(summary);
   const ul=element('ul','fault-article-list');
   for(const m of g.examples){
    const li=element('li');
    li.append(anchor(m.url,m.title));
    li.append(element('span','fault-note',' '+(m.published_at||'日付不明')+' / '+(m.kind==='news_rss'?'ニュースRSS':'認可された検索結果')));
    ul.append(li);
   }
   d.append(ul);wrap.append(d);
  });
 }
 if(v.checked_at)wrap.append(element('p','fault-note','収録情報の基準日：'+v.checked_at+'。最新の申告・リコールは公式情報も確認してください。'));
 return wrap;
}
let db=null;
async function fetchData(){
 const reader=root.MDOffline&&typeof root.MDOffline.read==='function'?root.MDOffline.read(DATA,{cache:'no-store'}):fetch(DATA,{cache:'no-store'});
 const response=await reader;
 if(!response.ok)throw Error('配信データの取得に失敗しました');
 const payload=await response.json();
 db=validate(payload);
 return db;
}
function result(matches,make,model,wantedCode){
 view.replaceChildren();
 const live=element('section','fault-ranked');live.id='fault-live-results';view.append(live);
 fillLinks(make,model,wantedCode);
 if(!matches.length){
  view.append(element('p','fault-empty','この車種・型式の分析データはまだ収録されていません。ネット上に故障がないという意味ではありません。'));
  return;
 }
 const count=element('p','fault-note','登録された型式：'+matches.map(x=>x.label).join('、'));
 view.append(count);
 if(matches.length>1){
  view.append(element('p','fault-note','車種名だけでは型式の違う車が混ざるため、下の型式から選んでください。'));
  for(const v of matches){
   const b=element('button','button secondary',v.label+' のランキングを見る');
   b.type='button';b.addEventListener('click',()=>{
    $('fault-search-code').value=v.code;
    if(form.requestSubmit)form.requestSubmit();else $('fault-search-run').click();
   });view.append(b);
  }
  return;
 }
 const v=matches[0];
 view.append(element('h3',null,v.make+' '+v.model+' '+v.label));
 if(v.source_note)view.append(element('p','fault-note',v.source_note));
 view.append(ranking(v));
}
form.addEventListener('submit',async e=>{
 e.preventDefault();
 const make=$('fault-search-make').value,model=$('fault-search-model').value,modelCode=$('fault-search-code').value;
 if(!clean(model)){output('車種名を入力してください。');return;}
 const btn=$('fault-search-run');btn.disabled=true;
 output('車種 '+clean(model)+' の公開情報を検索しています…');
 let matches=[];
 try{
  const data=db||await fetchData();
  matches=filterVehicles(data,make,model,modelCode);
 }catch(err){
  output('保存された公的集計を取得できませんでした。ネット記事の調査を続けます：'+err.message);
 }
 result(matches,make,model,modelCode);
 if(!matches.length&&output)output('公開集計は未収録です。ネット上の関連記事を調査しています…');
 await renderLive(make,model,modelCode);
 const live=$('fault-live-results');
 const failed=live&&live.textContent.includes('取得できませんでした');
 if(!failed)output('調査結果を表示しました。国交省の申告件数とWeb記事の件数は別集計です。');
 else output('公的集計・ネット記事の収録範囲を確認してください。検索リンクから追加調査できます。');
 btn.disabled=false;
});
$('fault-search-e12').addEventListener('click',()=>{
 $('fault-search-make').value='日産';$('fault-search-model').value='ノート';$('fault-search-code').value='E12';
 if(form.requestSubmit)form.requestSubmit();else $('fault-search-run').click();
});
$('fault-search-mycar').addEventListener('click',()=>{
 try{
  const raw=localStorage.getItem(root.MDPersonal?.KEY),selected=$('mycar-selector').value;
  const car=JSON.parse(raw).cars.find(x=>x.id===selected);
  if(!car)throw Error('未登録');
  $('fault-search-make').value=car.make;$('fault-search-model').value=car.model;
  $('fault-search-code').value='';
  if(form.requestSubmit)form.requestSubmit();else $('fault-search-run').click();
 }catch{output('マイカーが未登録のため、車種を入力してください。')}
});
})(typeof window==='undefined'?globalThis:window);
