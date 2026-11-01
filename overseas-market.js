/* MD MARKET v3.8 — international demand context, no scraping or auto trade signals. */
'use strict';
(function(root){
const DATA='./data/overseas-export-snapshot.json',KEY='md-market-overseas-notes-v1',MAX=150;
const clean=v=>String(v??'').normalize('NFKC').trim().replace(/\s+/g,' ');
function month(s){return /^\d{4}-(0[1-9]|1[0-2])$/.test(s)}
function date(s){return /^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s}
function integer(v,min,max,label){if(v===''||v===undefined||v===null||typeof v==='boolean'||!Number.isSafeInteger(Number(v))||Number(v)<min||Number(v)>max)throw Error(label+'は'+min+'〜'+max+'の整数で入力してください');return Number(v)}
function url(value){const val=clean(value);if(!val)return '';try{const u=new URL(val);if(!['https:','http:'].includes(u.protocol)||u.username||u.password||!u.hostname.includes('.'))throw Error();return u.href}catch{throw Error('出典URLを正しいHTTP/HTTPSで入力してください')}}
function verifySnapshot(raw){
 if(!raw||raw.schema_version!==1||!date(raw.updated_at)||!month(raw.latest_period))throw Error('海外統計の形式が不正です');
 const a=raw.monthly_totals;
 if(!a||!Array.isArray(a['2025'])||!Array.isArray(a['2026'])||a['2025'].length!==12||a['2026'].length!==12)throw Error('月次数値が不足しています');
 for(const year of ['2025','2026']){
  a[year].forEach((v,i)=>{if(v===null&&year==='2026'&&i>Number(raw.latest_period.slice(5))-1)return;
   integer(v,0,5000000,'月次輸出台数')});
 }
 const rankings=raw.country_ytd?.countries;
 if(!Array.isArray(rankings)||!rankings.length||rankings.length>50)throw Error('国別データの形式が不正です');
 rankings.forEach(r=>{if(!clean(r.country)||clean(r.country).length>60)throw Error('国名の形式が不正です');
  integer(r.count,0,10000000,'国別台数');
  if(!Number.isFinite(r.yoy_pct)||r.yoy_pct<0||r.yoy_pct>10000)throw Error('前年比の形式が不正です')});
 const kinds=raw.type_rankings?.categories;
 if(!Array.isArray(kinds)||!kinds.length||kinds.length>20)throw Error('車種区分別データの形式が不正です');
 kinds.forEach(k=>{if(!clean(k.id)||!clean(k.title)||!Array.isArray(k.rows)||k.rows.length>20)throw Error('車種区分別データの形式が不正です');
  k.rows.forEach(x=>{if(!Array.isArray(x)||x.length!==2||!clean(x[0]))throw Error('車種区分別行の形式が不正です');integer(x[1],0,1000000,'区分別台数')})});
 url(raw.provenance?.url);url(raw.country_ytd?.source_url);url(raw.type_rankings?.source_url);
 return raw;
}
function comparison(data,period){
 const d=verifySnapshot(data);
 if(!month(period)||period.slice(0,4)!=='2026')throw Error('比較月が不正です');
 const idx=Number(period.slice(5))-1;
 const current=d.monthly_totals['2026'][idx],last=d.monthly_totals['2025'][idx];
 if(current===null||current===undefined||last===null||last===undefined)return {available:false,period};
 const previous=idx>0?d.monthly_totals['2026'][idx-1]:null;
 const yoy=last>0?(current/last-1)*100:null;
 return {available:true,period,current,priorYear:last,previous,yoy,monthOnMonth:previous>0?(current/previous-1)*100:null};
}
function latestComparison(data){const d=verifySnapshot(data);return comparison(d,d.latest_period)}
function countryMoves(data){const d=verifySnapshot(data);return d.country_ytd.countries.map(r=>({
  country:r.country,count:r.count,yoy_pct:r.yoy_pct,change_pct:r.yoy_pct-100,
  direction:r.yoy_pct>105?'increase':r.yoy_pct<95?'decrease':'flat'
 }))}
function validateNote(raw){
 if(!raw||typeof raw!=='object')throw Error('記録形式が不正です');
 const o={id:clean(raw.id),type:clean(raw.type),as_of:clean(raw.as_of),country:clean(raw.country),
  description:clean(raw.description),source:clean(raw.source),source_url:url(raw.source_url)};
 if(!o.id||o.id.length>100||!['fx','event'].includes(o.type)||!date(o.as_of)||
 !o.country||o.country.length>70||!o.source||o.source.length>120||o.description.length>500)throw Error('入力項目を確認してください');
 if(o.type==='fx'){
  const v=Number(raw.usdjpy);
  if(raw.usdjpy===''||raw.usdjpy===null||raw.usdjpy===undefined||!Number.isFinite(v)||v<50||v>300)throw Error('ドル円は50〜300円の実数で入力してください');
  if(o.country!=='全世界')throw Error('ドル円記録の対象は全世界にしてください');
  o.usdjpy=v;
 }else{
  if(!o.description)throw Error('規制・需要などの出来事の内容を入力してください');
  o.usdjpy=null;
 }
 if(!o.source_url)throw Error('検証できる出典URLを入力してください');
 return o;
}
function validateNotes(input){
 if(!Array.isArray(input)||input.length>MAX)throw Error('記録は最大150件です');
 const seen=new Set();
 return input.map(x=>{const r=validateNote(x);if(seen.has(r.id))throw Error('IDが重複しています');seen.add(r.id);return r});
}
function mergeNotes(prev,add){
 const merged=new Map(validateNotes(prev).map(x=>[x.id,x]));
 for(const r of validateNotes(add)){
  if(merged.has(r.id)&&JSON.stringify(merged.get(r.id))!==JSON.stringify(r))throw Error('同一IDで内容が異なる記録は上書きしません');
  merged.set(r.id,r)
 }
 return validateNotes([...merged.values()]);
}
function exportNotes(rows){return JSON.stringify({schema_version:1,kind:'md_market_overseas_notes',rows:validateNotes(rows)},null,2)}
function importNotes(json){
 let input;try{input=JSON.parse(json)}catch{throw Error('JSON形式を確認してください')}
 if(!input||input.schema_version!==1||input.kind!=='md_market_overseas_notes')throw Error('海外観測専用のJSONではありません');
 return validateNotes(input.rows);
}
const API={KEY,DATA,month,date,comparison,latestComparison,countryMoves,validateNote,validateNotes,mergeNotes,exportNotes,importNotes,verifySnapshot};
if(typeof module==='object'&&module.exports)module.exports=API;
root.MDOverseas=API;
if(typeof document==='undefined')return;
const $=id=>document.getElementById(id),panel=$('overseas-panel');
if(!panel)return;
const elem=(tag,cls,value)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(value!==undefined)el.textContent=value;return el};
const number=n=>Number(n).toLocaleString('ja-JP'),percent=n=>n===null?'比較不可':(n>=0?'+':'')+n.toFixed(1)+'%';
let snapshot=null,notes=[],storeOK=true;
function message(s){$('overseas-status').textContent=s}
function addLink(container,label,target){
 const a=elem('a',null,label);a.href=target;a.target='_blank';a.rel='noopener noreferrer';container.append(a);
}
function readNotes(){
 try{const v=localStorage.getItem(KEY);if(v)notes=importNotes(v)}
 catch(e){storeOK=false;notes=[];message('端末保存データの読込に失敗しました。破損データの保護のため新規保存を停止：'+e.message)}
 for(const id of ['overseas-add-fx','overseas-add-event','overseas-import'])$(id).disabled=!storeOK;
}
function writeNotes(rows){
 if(!storeOK)throw Error('保存領域が読み取れないため上書きを停止しています');
 const safe=validateNotes(rows);
 localStorage.setItem(KEY,exportNotes(safe));notes=safe;renderNotes();
}
function renderLatest(){
 const info=latestComparison(snapshot),metrics=$('overseas-metrics');metrics.replaceChildren();
 const m=(title,value,sub)=>{const c=elem('div','overseas-metric');c.append(elem('small',null,title),elem('strong',null,value),elem('span',null,sub));return c};
 metrics.append(m('直近の統計対象月',info.period,'公表日 '+snapshot.updated_at),
  m('輸出台数',number(info.current)+'台','2025年同月 '+number(info.priorYear)+'台'),
  m('前年同月比',percent(info.yoy),'サイト集計の前年比'),
  m('前月比',percent(info.monthOnMonth),'季節性や通関月のずれに注意'));
 const link=$('overseas-source');link.replaceChildren();
 addLink(link,'出典：JUMV.NETの輸出統計（e-Stat普通貿易統計に基づく独自集計）',snapshot.provenance.url);
 $('overseas-definition').textContent=snapshot.provenance.definition+' 記載の公表済み月までを表示し、毎日自動更新する仕組みではありません。';
}
function drawMonths(){
 const tbody=$('overseas-months');tbody.replaceChildren();
 const max=Math.max(...snapshot.monthly_totals['2025'],...snapshot.monthly_totals['2026'].filter(x=>x!==null));
 for(let i=0;i<12;i++){
  const a=snapshot.monthly_totals['2025'][i],b=snapshot.monthly_totals['2026'][i];
  const tr=elem('tr'),cell=(txt)=>tr.append(elem('td',null,txt));
  cell((i+1)+'月');
  for(const [title,value] of [['2025年',a],['2026年',b]]){
   const td=elem('td');const body=elem('div','overseas-bar-cell');
   if(value!==null){const span=elem('span','overseas-bar '+(title==='2025年'?'past':'current'));span.style.width=(100*value/max).toFixed(1)+'%';body.append(span)}
   body.append(elem('span','overseas-bar-value',value===null?'未公表':number(value)));
   td.append(body);tr.append(td);
  }
  cell(b===null?'—':percent((b/a-1)*100));
  tbody.append(tr);
 }
}
function drawCountries(){
 const root=$('overseas-countries');root.replaceChildren();
 const items=countryMoves(snapshot),max=items[0].count;
 for(const c of items){
  const row=elem('div','overseas-country');
  const head=elem('div','overseas-country-heading');
  head.append(elem('strong',null,c.country),elem('span',null,number(c.count)+'台 · 前年同期比 '+c.yoy_pct.toFixed(1)+'%'));
  const track=elem('div','overseas-bar-track'),bar=elem('div','overseas-bar current');bar.style.width=(c.count/max*100).toFixed(1)+'%';track.append(bar);
  row.append(head,track);root.append(row);
 }
 $('overseas-country-period').textContent=snapshot.country_ytd.period+'累計（上位10か国、全車種のサイト集計）';
}
function drawTypes(){
 const sel=$('overseas-type'),target=$('overseas-types-list');target.replaceChildren();
 const type=snapshot.type_rankings.categories.find(c=>c.id===sel.value);
 if(!type)return;
 const ol=elem('ol');
 for(const [country,count] of type.rows){ol.append(elem('li',null,country+'　'+number(count)+'台'))}
 target.append(ol);
 $('overseas-type-period').textContent=snapshot.type_rankings.period+'（カテゴリ別の輸出先上位、月次。車種名別ではありません）';
}
function renderNotes(){
 const target=$('overseas-notes');target.replaceChildren();
 const sorted=notes.slice().sort((a,b)=>b.as_of.localeCompare(a.as_of));
 $('overseas-notes-count').textContent=sorted.length+'件の個人観測記録';
 if(!sorted.length){target.append(elem('p','overseas-muted','為替・輸入規制などの個人観測は未登録です。'));return}
 for(const n of sorted){
  const block=elem('article','overseas-note');
  block.append(elem('strong',null,n.as_of+'｜'+(n.type==='fx'?'ドル円 '+n.usdjpy+'円':n.country+'の外部要因')));
  if(n.description)block.append(elem('p','overseas-muted',n.description));
  const line=elem('p','overseas-muted','情報源：'+n.source+'（ユーザー記録・未検証）');addLink(line,' 出典を見る',n.source_url);block.append(line);
  const del=elem('button','button ghost','削除');del.type='button';del.addEventListener('click',()=>{
   if(!confirm('この海外観測メモを削除しますか？'))return;
   try{writeNotes(notes.filter(x=>x.id!==n.id));message('1件削除しました')}catch(e){message('削除できません：'+e.message)}
  });block.append(del);target.append(block)
 }
}
function fromForm(kind){
 const id=typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():String(Date.now())+'-'+Math.random();
 const val=id=>$(id).value;
 if(kind==='fx')return validateNote({id,type:'fx',as_of:val('overseas-fx-date'),country:'全世界',
  usdjpy:val('overseas-usdjpy'),description:'日本銀行等の指定日時のドル円レート',source:val('overseas-fx-source'),source_url:val('overseas-fx-url')});
 return validateNote({id,type:'event',as_of:val('overseas-event-date'),country:val('overseas-event-country'),
  description:val('overseas-event-description'),source:val('overseas-event-source'),source_url:val('overseas-event-url')});
}
async function initialize(){
 readNotes();renderNotes();
 $('overseas-type').addEventListener('change',()=>{if(snapshot)drawTypes()});
 for(const type of ['fx','event'])$('overseas-add-'+type).addEventListener('click',()=>{
  try{const entry=fromForm(type);writeNotes(mergeNotes(notes,[entry]));message('海外観測メモを1件保存しました（検証済みの市場実績ではありません）。')}
  catch(e){message('保存できません：'+e.message)}
 });
 $('overseas-export').addEventListener('click',()=>{
  $('overseas-backup').value=exportNotes(notes);$('overseas-backup').focus();$('overseas-backup').select();
  message('JSONを書き出しました。自動アップロードはしません。')
 });
 $('overseas-import').addEventListener('click',()=>{
  try{const before=notes.length;writeNotes(mergeNotes(notes,importNotes($('overseas-backup').value)));
   message('追加復元 '+(notes.length-before)+'件。異なる既存IDは上書きしません。');}
  catch(e){message('復元できません：'+e.message)}
 });
 try{
  const response=await(root.MDOffline&&typeof root.MDOffline.read==='function'?
   root.MDOffline.read(DATA,{cache:'no-store'}):fetch(DATA,{cache:'no-store'}));
  if(!response.ok)throw Error('統計ファイルを取得できません');
  snapshot=verifySnapshot(await response.json());
  renderLatest();drawMonths();drawCountries();
  const s=$('overseas-type');s.replaceChildren();
  for(const kind of snapshot.type_rankings.categories){const o=elem('option',null,kind.title);o.value=kind.id;s.append(o)}
  drawTypes();
  $('overseas-results').hidden=false;
  message('2026年9月までの統計スナップショットを読み込みました。海外の指標は仕入れ推奨ではありません。');
 }catch(e){
  $('overseas-results').hidden=true;
  message('海外統計を読み込めません：'+e.message+'。公式情報の参照リンクを確認してください。');
 }
}
initialize();
})(typeof window==='undefined'?globalThis:window);
