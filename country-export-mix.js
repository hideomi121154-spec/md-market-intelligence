/* MD MARKET v4.1 — country-by-country used vehicle export mix.
 * Third-party top-five/category snapshots are partial. Customs HS rows are
 * user-transcribed and remain unverified; they never become official facts.
 */
'use strict';
(function(root){
const DATA='./data/overseas-export-snapshot.json';
const KEY='md-market-country-hs-manual-v1';
const LIMIT=3000;
const CLASSES=[
  {id:'ordinary',title:'普通車（サイト分類）'},
  {id:'hybrid',title:'ハイブリッド車'},
  {id:'ev',title:'電気自動車'},
  {id:'kei',title:'軽自動車'}
];
const HS=Object.freeze({
 '870321915':['petrol_660','ガソリン／660cc以下'],
 '870321925':['petrol_1000','ガソリン／660cc超〜1,000cc'],
 '870322910':['petrol_1500','ガソリン／1,000cc超〜1,500cc'],
 '870323915':['petrol_2000','ガソリン／1,500cc超〜2,000cc'],
 '870323925':['petrol_3000','ガソリン／2,000cc超〜3,000cc'],
 '870324910':['petrol_over3000','ガソリン／3,000cc超'],
 '870331100':['diesel_1500','ディーゼル／1,500cc以下'],
 '870332915':['diesel_2000','ディーゼル／1,500cc超〜2,000cc'],
 '870332925':['diesel_2500','ディーゼル／2,000cc超〜2,500cc'],
 '870333910':['diesel_over2500','ディーゼル／2,500cc超'],
 '870340100':['hv_petrol','非プラグインHV／ガソリン'],
 '870350100':['hv_diesel','非プラグインHV／ディーゼル'],
 '870360100':['phev_petrol','PHEV／ガソリン'],
 '870370100':['phev_diesel','PHEV／ディーゼル'],
 '870380100':['ev','EV／電気のみ'],
 '870390100':['other','その他動力']
});
const normalize=s=>String(s??'').normalize('NFKC').trim().replace(/\s+/g,' ');
const country=s=>{const n=normalize(s);return ({'グルジア':'ジョージア','南アフリカ共和国':'南アフリカ','英国':'イギリス'})[n]||n};
function month(v){return /^2026-(0[1-9]|1[0-2])$/.test(v)}
function govUrl(s){try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password&&
 (u.hostname==='www.customs.go.jp'||u.hostname==='customs.go.jp'||u.hostname==='www.e-stat.go.jp'||u.hostname==='e-stat.go.jp');}catch{return false}}
function hsCode(v){const c=String(v??'').replace(/[.\-\s]/g,'');if(!Object.hasOwn(HS,c))throw Error('2026年の中古乗用車HSコードが未対応：'+String(v));return c}
function validateRow(raw){
 if(!raw||typeof raw!=='object')throw Error('CSV行の形式が不正です');
 const r={period:normalize(raw.period),country:country(raw.country),hs_code:hsCode(raw.hs_code),
    units:Number(raw.units),source_url:normalize(raw.source_url)};
 if(!month(r.period)||!r.country||r.country.length>70||r.country==='全世界'||
    raw.units===''||raw.units===null||raw.units===undefined||typeof raw.units==='boolean'||
    !Number.isSafeInteger(r.units)||r.units<0||r.units>5000000||!govUrl(r.source_url))
   throw Error('2026年月・国名・台数・税関/e-Stat出典URLを確認してください');
 return r;
}
const key=r=>r.period+'|'+r.country+'|'+r.hs_code;
function validateRows(raw){
 if(!Array.isArray(raw)||raw.length>LIMIT)throw Error('登録は最大'+LIMIT+'行です');
 const seen=new Map();
 for(const x of raw){const r=validateRow(x),id=key(r);
   if(seen.has(id))throw Error('同一月・国・HSコードが重複しています：'+id);
   seen.set(id,r);
 }
 return [...seen.values()];
}
function mergeRows(prev,next){
 const map=new Map(validateRows(prev).map(r=>[key(r),r]));
 for(const r of validateRows(next)){
  const id=key(r);
  if(map.has(id)&&JSON.stringify(map.get(id))!==JSON.stringify(r))throw Error('同一月・国・HSコードの異なる数値は上書きしません：'+id);
  map.set(id,r);
 }
 return validateRows([...map.values()]);
}
function parseCSV(text){
 if(typeof text!=='string'||text.length>350000)throw Error('CSVは350KB以下にしてください');
 const table=[],row=[];let field='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(quoted){if(c==='"'&&text[i+1]==='"'){field+='"';i++}else if(c==='"')quoted=false;else field+=c}
  else if(c==='"'){if(field)throw Error('CSVの引用符の形式が不正です');quoted=true}
  else if(c===','){row.push(field);field=''}
  else if(c==='\n'){row.push(field.replace(/\r$/,''));field='';if(row.some(x=>x.trim()))table.push(row.splice(0));else row.length=0}
  else field+=c;
 }
 if(quoted)throw Error('CSVの引用符が閉じられていません');
 if(field||row.length){row.push(field.replace(/\r$/,''));if(row.some(x=>x.trim()))table.push(row)}
 const header=['period','country','hs_code','units','source_url'];
 if(!table.length||table[0].length!==header.length||table[0].some((x,i)=>x.trim()!==header[i]))
   throw Error('見出しは period,country,hs_code,units,source_url にしてください');
 return validateRows(table.slice(1).map((a,i)=>{
  if(a.length!==5)throw Error((i+2)+'行目の列数を確認してください');
  return Object.fromEntries(header.map((h,j)=>[h,a[j]]));
 }));
}
const csvQuote=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
function toCSV(rows){
 const list=validateRows(rows);
 return ['period,country,hs_code,units,source_url',...list.map(r=>
    [r.period,r.country,r.hs_code,r.units,r.source_url].map(csvQuote).join(','))].join('\n')+'\n';
}
function validateSnapshot(raw){
 if(!root.MDOverseas?.verifySnapshot)throw Error('海外統計の検証モジュールがありません');
 root.MDOverseas.verifySnapshot(raw);
 if(!Array.isArray(raw.type_rankings?.categories)||!raw.type_rankings?.period||
 !raw.country_ytd?.period)throw Error('海外統計の分類と集計期間が不明です');
 return raw;
}
function allCountries(snap,local=[]){
 const s=validateSnapshot(snap),set=new Set(s.country_ytd.countries.map(x=>country(x.country)));
 s.type_rankings.categories.forEach(c=>c.rows.forEach(r=>set.add(country(r[0]))));
 validateRows(local).forEach(x=>set.add(x.country));
 return [...set].sort((a,b)=>a.localeCompare(b,'ja'));
}
function analyze(snap,name,manual=[],selectedMonth){
 const raw=validateSnapshot(snap),c=country(name),rows=validateRows(manual);
 const currentPeriod=selectedMonth||raw.type_rankings.period;
 if(!c||!month(currentPeriod))throw Error('国名か表示年月が不正です');
 const ytd=raw.country_ytd.countries.find(x=>country(x.country)===c)||null;
 const pieces=CLASSES.map(cl=>{
  const cat=raw.type_rankings.categories.find(k=>k.id===cl.id);
  const row=cat?.rows.find(x=>country(x[0])===c);
  return {id:cl.id,title:cl.title,units:currentPeriod===raw.type_rankings.period&&row?row[1]:null,
    completeness:'各区分の輸出先上位5か国のみ収録（未掲載は0台ではない）'};
 });
 const officialManual=rows.filter(r=>r.country===c&&r.period===currentPeriod);
 return {country:c,ytd:ytd?{units:ytd.count,yoy_pct:ytd.yoy_pct,period:raw.country_ytd.period}:null,
   typePeriod:raw.type_rankings.period,displayPeriod:currentPeriod,types:pieces,
   hsRows:officialManual.map(r=>({...r,kind:HS[r.hs_code][0],description:HS[r.hs_code][1]})),
   selectedTotals:CLASSES.map(cl=>({id:cl.id,label:cl.title,rows:raw.type_rankings.categories.find(x=>x.id===cl.id)?.rows||[]})),
   sourceCountry:raw.country_ytd.source_url,sourceTypes:raw.type_rankings.source_url,
   all:allCountries(raw,rows)};
}
function backup(rows){return JSON.stringify({schema_version:1,kind:'md_market_country_hs_manual',rows:validateRows(rows)},null,2)}
function restore(text){let obj;try{obj=JSON.parse(text)}catch{throw Error('JSONを読み取れません')}
 if(!obj||obj.schema_version!==1||obj.kind!=='md_market_country_hs_manual')throw Error('この機能専用のバックアップではありません');
 return validateRows(obj.rows);
}
const API={DATA,KEY,HS,CLASSES,hsCode,month,country,govUrl,validateRow,validateRows,mergeRows,parseCSV,toCSV,validateSnapshot,allCountries,analyze,backup,restore};
if(typeof module==='object'&&module.exports)module.exports=API;
root.MDCountryMix=API;
if(typeof document==='undefined')return;
const $=id=>document.getElementById(id),host=$('country-mix-panel');if(!host)return;
const el=(tag,t,cls)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(t!==undefined)e.textContent=t;return e};
const aLink=(node,label,url)=>{const a=el('a',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';node.append(a)};
const fmt=x=>Number(x).toLocaleString('ja-JP');
let snapshot=null,notes=[],writable=true;
const status=t=>{$('country-mix-status').textContent=t};
function getNotes(){
 try{const raw=localStorage.getItem(KEY);if(raw)notes=restore(raw)}
 catch(e){writable=false;notes=[];status('保存済みの転記データが不正です。上書き防止のため保存を停止：'+e.message)}
 $('country-mix-import').disabled=!writable;
}
function putNotes(rows){
 if(!writable)throw Error('既存保存領域が不正なため更新停止中');
 const saved=validateRows(rows);
 localStorage.setItem(KEY,backup(saved));
 notes=saved;
}
function show(){
 if(!snapshot)return;
 const chosen=$('country-mix-country').value,period=$('country-mix-month').value;
 const out=analyze(snapshot,chosen,notes,period);
 const area=$('country-mix-details');area.replaceChildren();
 const heading=el('div',undefined,'cm-kpis');
 const year=el('article',undefined,'cm-kpi');
 year.append(el('small','国別累計（全車種・全区分）'),el('strong',out.ytd?fmt(out.ytd.units)+'台':'未収録'),
   el('span',out.ytd?out.ytd.period+'／前年比'+out.ytd.yoy_pct+'%':'国別累計の公開上位10か国外。0台ではありません'));
 heading.append(year);
 const measured=out.types.filter(x=>x.units!==null).length;
 const cover=el('article',undefined,'cm-kpi');
 cover.append(el('small',out.displayPeriod+'　区分別の収録状況'),el('strong',measured+' / 4 区分'),
   el('span','月次の上位5国に掲載された区分数。網羅率ではありません'));
 heading.append(cover);area.append(heading);
 const list=el('div',undefined,'cm-kpis cm-category');
 for(const x of out.types){
  const card=el('article',undefined,'cm-kpi');
  card.append(el('small',x.title),el('strong',x.units===null?'未収録':fmt(x.units)+'台'),
    el('span',x.units===null?'上位5国に非掲載／数値不明':out.displayPeriod+'／掲載済みの月次台数'));
  list.append(card);
 }
 area.append(el('h4','車両区分ごとの輸出台数（'+out.displayPeriod+'）'),list,
   el('p','この区分別表は各カテゴリーの上位5国だけの抜粋です。未掲載をゼロとせず、国別累計と合算・比率計算を行いません。','cm-warning'));
 const source=el('p','資料の確認：','cm-muted');
 aLink(source,'国別累計',out.sourceCountry);source.append(document.createTextNode(' ／ '));
 aLink(source,'区分別月次',out.sourceTypes);area.append(source);
 const title=el('h4','HS統計番号別（財務省・e-Statからの本人転記）');
 area.append(title);
 if(!out.hsRows.length){area.append(el('p','この国・月のHS番号別データは未登録です。CSVで登録した場合のみ表示されます。','cm-muted'))}
 else{
  const table=el('table',undefined,'cm-table'),thead=el('thead'),tr=el('tr');
  ['HSコード','中古乗用車の区分','登録値'].forEach(x=>tr.append(el('th',x)));
  thead.append(tr);table.append(thead);
  const tbody=el('tbody');out.hsRows.sort((a,b)=>a.hs_code.localeCompare(b.hs_code)).forEach(r=>{
   const tr=el('tr');
   tr.append(el('td',r.hs_code),el('td',r.description),el('td',fmt(r.units)+'台'));
   const td=el('td');aLink(td,'原典',r.source_url);tr.append(td);tbody.append(tr);
  });
  const th=el('th','原典');thead.firstChild.append(th);
  table.append(tbody);const wrap=el('div',undefined,'cm-scroll');wrap.append(table);area.append(wrap);
  area.append(el('p',out.hsRows.length+'件の本人転記（真偽未検証）。掲載した行だけの数値で、国全体の内訳を網羅していません。','cm-warning'));
 }
 area.append(el('p','車種名（ヤリス・プリウス等）・グレード別の実輸出台数：未取得。HS分類は車名を特定できません。','cm-warning'));
 showRanking();
}
function showRanking(){
 if(!snapshot)return;
 const kind=$('country-mix-type').value;
 const cat=snapshot.type_rankings.categories.find(x=>x.id===kind);
 const area=$('country-mix-ranking');area.replaceChildren();
 if(!cat)return;
 area.append(el('p',snapshot.type_rankings.period+'　'+cat.title+'（公開順位の上位5か国のみ）','cm-muted'));
 const list=el('ol',undefined,'cm-ranking-list');
 for(const [name,count] of cat.rows){const item=el('li');const b=el('button',country(name)+'　'+fmt(count)+'台','cm-rank-button');b.type='button';
  b.addEventListener('click',()=>{
   const select=$('country-mix-country'),target=country(name);
   if(![...select.options].some(x=>x.value===target)){const opt=el('option',target);opt.value=target;select.append(opt)}
   select.value=target;show();
  });
  item.append(b);list.append(item);
 }
 area.append(list);
}
function updateCountryOptions(selected){
 if(!snapshot)return;
 const opts=allCountries(snapshot,notes),select=$('country-mix-country');
 const old=selected||select.value||'ロシア';select.replaceChildren();
 opts.forEach(n=>{const o=el('option',n);o.value=n;select.append(o)});
 select.value=opts.includes(old)?old:opts[0];
}
async function initialize(){
 getNotes();
 $('country-mix-month').value='2026-09';
 $('country-mix-country').addEventListener('change',show);
 $('country-mix-month').addEventListener('change',show);
 $('country-mix-type').addEventListener('change',showRanking);
 $('country-mix-template').addEventListener('click',()=>{
  const t=$('country-mix-csv');t.value='period,country,hs_code,units,source_url\n';t.focus();t.select();
  status('標準化CSVの見出しを表示しました。公式の通関表を確認し、行ごとに転記してください。')
 });
 $('country-mix-import').addEventListener('click',()=>{
  try{const incoming=parseCSV($('country-mix-csv').value);const start=notes.length;
    putNotes(mergeRows(notes,incoming));updateCountryOptions();show();
    status((notes.length-start)+'行追加しました。自動照合は行っていません。')}
  catch(e){status('CSVを登録できません：'+e.message)}
 });
 $('country-mix-backup').addEventListener('click',()=>{
  const t=$('country-mix-csv');t.value=toCSV(notes);t.focus();t.select();
  status(notes.length+'行のCSVを表示しました。外部にコピーして保存してください。')
 });
 try{
  const read=root.MDOffline?.read?root.MDOffline.read(DATA,{cache:'no-store'}):fetch(DATA,{cache:'no-store'});
  const response=await read;if(!response.ok)throw Error('統計ファイルを取得できません');
  snapshot=validateSnapshot(await response.json());
  $('country-mix-month').value=snapshot.type_rankings.period;
  updateCountryOptions('ロシア');
  const kinds=$('country-mix-type');kinds.replaceChildren();
  for(const x of CLASSES){const o=el('option',x.title);o.value=x.id;kinds.append(o)}
  show();status('公表済みの区分別上位5ランキングと国別累計を読み込みました。未収録は0台ではありません。');
 }catch(e){status('統計を読み込めません：'+e.message)}
}
initialize();
})(typeof window==='undefined'?globalThis:window);
