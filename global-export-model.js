/* MD MARKET v4.3 — country × make × model overseas demand monitor.
 * A destination-country aggregate NEVER becomes a nameplate export figure.
 * All stored model records are user observations, not verified public series.
 */
'use strict';
(function(root){
const CATALOG='./data/export-model-catalog.json';
const SNAPSHOT='./data/overseas-export-snapshot.json';
const ANNUAL='./data/registered_annual_history.json';
const KEI='./data/kei_annual_history.json';
const OFFICIAL='./data/estat_used_vehicle_exports.json';
const RUSSIA='./data/russia-yaris-sources.json';
const NOTES_KEY='md-market-crossborder-model-notes-v1';
const SELECTION_KEY='md-market-global-export-model-select-v1';
const fmt=x=>Number(x).toLocaleString('ja-JP');
const normal=x=>String(x??'').normalize('NFKC').trim().replace(/\s+/g,' ');
const canon=x=>normal(x).toUpperCase().replace(/[\s\u3000\u2010-\u2015\u2212\u30fc\-_＿]/g,'');
const normalizeCountry=x=>{
 const s=normal(x);
 return ({'グルジア':'ジョージア','南アフリカ共和国':'南アフリカ','英国':'イギリス'})[s]||s;
};
function verifyCatalog(raw){
 if(!raw||raw.schema_version!==1||!Array.isArray(raw.countries)||!Array.isArray(raw.makes)||
 raw.countries.length<18||raw.countries.length>300||raw.makes.length<5||raw.makes.length>30)
  throw Error('国・車種カタログの形式が不正です');
 const countries=new Set();
 for(const x of raw.countries){
  if(typeof x!=='string'||!normal(x)||normal(x).length>75||countries.has(normalizeCountry(x)))
   throw Error('国の名称が不正または重複しています');
  countries.add(normalizeCountry(x));
 }
 const makes=new Set(),pairs=new Set();
 for(const x of raw.makes){
  if(!x||typeof x.make!=='string'||!normal(x.make)||normal(x.make).length>40||
    makes.has(normal(x.make))||!Array.isArray(x.models)||!x.models.length||x.models.length>70)
    throw Error('メーカーの設定が不正です');
  makes.add(normal(x.make));
  for(const m of x.models){
   if(typeof m!=='string'||!normal(m)||normal(m).length>80)throw Error('車種名が不正です');
   const pair=normal(x.make)+'|'+canon(m);
   if(pairs.has(pair))throw Error('車種名が重複しています：'+pair);
   pairs.add(pair);
  }
 }
 if(!pairs.has('トヨタ|ヤリス'))throw Error('既存のヤリス選択肢がありません');
 return raw;
}
function identity(make,model){
 return root.MDCrossover?.identity?root.MDCrossover.identity({make,model}):normal(make)+'|'+canon(model);
}
function readNotes(stored){
 if(!stored)return {records:[],error:null};
 try{
  const json=JSON.parse(stored);
  if(json?.schema_version!==1||json?.kind!=='md_market_crossborder_notes'||
    !root.MDCrossover?.validateNotes)throw Error('自己記録の検証ができません');
  return {records:root.MDCrossover.validateNotes(json.records),error:null};
 }catch(e){return {records:[],error:'既存の車種別本人記録を検証できません。記録は変更していません。'}}
}
function sourceCountryNames(snapshot,official){
 if(!snapshot||!Array.isArray(snapshot.country_ytd?.countries)||
    !Array.isArray(snapshot.type_rankings?.categories))throw Error('輸出統計が不正です');
 const set=new Set(snapshot.country_ytd.countries.map(r=>normalizeCountry(r.country)));
 for(const type of snapshot.type_rankings.categories){
  for(const row of type.rows||[])set.add(normalizeCountry(row[0]));
 }
 if(official?.status==='available'){
  for(const r of official.rows)set.add(normalizeCountry(r.country));
 }
 return set;
}
function countryOptions(catalog,snapshot,official,rawNotes){
 verifyCatalog(catalog);
 const measured=sourceCountryNames(snapshot,official);
 const noteCountries=(rawNotes?.records||[]).map(r=>normalizeCountry(r.country));
 const all=new Set([...catalog.countries.map(normalizeCountry),...measured,...noteCountries]);
 return [...all].sort((a,b)=>a.localeCompare(b,'ja')).map(name=>({
  name,hasAggregate:measured.has(name),onlyCandidate:!measured.has(name)
 }));
}
function newSales(annual,kei,make,model){
 const key=identity(make,model),list=[];
 for(const [obj,origin] of [[annual,'登録車'],[kei,'軽自動車']]){
  if(!obj||obj.schema_version!==1||!Array.isArray(obj.years))throw Error('国内新車統計の形式が不正です');
  for(const yr of obj.years){
   if(!Number.isInteger(yr.year)||!Array.isArray(yr.models))throw Error('新車統計の年・車種が不正です');
   const r=yr.models.find(x=>identity(x.make,x.model)===key);
   if(!r)continue;
   if(!Number.isSafeInteger(r.units)||r.units<0||!/^https:\/\//.test(yr.source_url))
    throw Error('国内新車台数の出典・形式が不正です');
   list.push({year:yr.year,units:r.units,scope:origin,
    source_type:origin==='軽自動車'?'official':yr.source_type,
    source_url:yr.source_url});
  }
 }
 return list.sort((a,b)=>a.year-b.year);
}
function buildView(catalog,snapshot,official,annual,kei,russia,stored,country,make,model){
 verifyCatalog(catalog);
 if(!catalog.makes.some(x=>x.make===make&&x.models.includes(model)))throw Error('選択された車種がカタログにありません');
 const where=normalizeCountry(country);
 const observation=readNotes(stored);
 const options=countryOptions(catalog,snapshot,official,observation);
 if(!options.some(x=>x.name===where))throw Error('輸出先を確認できません');
 if(!root.MDOverseas?.verifySnapshot)throw Error('海外統計検証の準備ができません');
 root.MDOverseas.verifySnapshot(snapshot);
 if(!root.MDEstatExports?.officialData)throw Error('e-Statデータ検証の準備ができません');
 root.MDEstatExports.officialData(official);
 const macro=snapshot.country_ytd.countries.find(x=>normalizeCountry(x.country)===where)||null;
 const categories=snapshot.type_rankings.categories.map(t=>{
  const found=t.rows.find(row=>normalizeCountry(row[0])===where);
  return {id:t.id,title:t.title,units:found?found[1]:null,
    period:snapshot.type_rankings.period,scope:'secondary_top_five_only'};
 });
 const source=normal(make)+'|'+canon(model);
 const evidence=observation.records.filter(r=>normalizeCountry(r.country)===where&&identity(r.make,r.model)===source)
  .sort((a,b)=>b.period.localeCompare(a.period));
 const sales=newSales(annual,kei,make,model);
 const officialMonth=official.status==='available'&&official.months.length?official.months.slice().sort().at(-1):null;
 const officialView=officialMonth?root.MDEstatExports.figures(official,where,officialMonth):{
  status:'not_configured',records:[],byGroup:[],country:where,month:null
 };
 let ruInfo=null;
 if(where==='ロシア'){
  if(!root.MDRussiaYaris?.verifySource)throw Error('ロシア参考資料の検証に失敗しました');
  const confirmed=root.MDRussiaYaris.verifySource(russia);
  ruInfo={
   passenger2025:confirmed.observations.find(x=>x.id==='jp-ru-used-passenger-2025')||null,
   toyotaSales2025:make==='トヨタ'?confirmed.observations.find(x=>x.id==='ru-toyota-used-sales-2025')||null:null,
   sanctions:confirmed.source_links.find(x=>x.label.includes('経産省'))||null
  };
 }
 return {country:where,make,model,options,catalog,macro,
  macroPeriod:snapshot.country_ytd.period,macroSource:snapshot.country_ytd.source_url,
  categories,categoryPeriod:snapshot.type_rankings.period,categorySource:snapshot.type_rankings.source_url,
  japanNewSales:sales,directModelExportCount:null,directModelExportStatus:'未取得',
  modelNotes:evidence,notesError:observation.error,ruInfo,officialView,
  officialSource:official.status==='available'?official.source_url:null,
  officialStatsId:official.status==='available'?official.stats_data_id:null};
}
const API={CATALOG,SNAPSHOT,ANNUAL,KEI,OFFICIAL,RUSSIA,NOTES_KEY,SELECTION_KEY,verifyCatalog,
 identity,normalizeCountry,readNotes,countryOptions,newSales,buildView};
if(typeof module==='object'&&module.exports)module.exports=API;
root.MDGlobalModelExport=API;
if(typeof document==='undefined')return;
const $=id=>document.getElementById(id),host=$('export-model-results');
if(!host)return;
const create=(tag,value,cls)=>{
 const e=document.createElement(tag);
 if(value!==undefined)e.textContent=value;
 if(cls)e.className=cls;
 return e;
};
function link(node,text,url){
 if(typeof url!=='string'||!/^https:\/\//.test(url))return;
 const a=create('a',text);a.href=url;a.target='_blank';a.rel='noopener noreferrer';node.append(a);
}
function metric(label,value,desc,kind){
 const el=create('article',undefined,'ry-metric');
 if(kind)el.dataset.kind=kind;
 el.append(create('small',label),create('strong',value),create('span',desc));
 return el;
}
function attachNewSales(view,rootNode){
 rootNode.append(create('h4',view.make+' '+view.model+'｜国内新車登録台数'));
 rootNode.append(create('p','国内で登録・販売された新車台数であり、選択した国への中古車輸出台数ではありません。ランキングに載らない年は未収録です。','ry-muted'));
 if(!view.japanNewSales.length){
  rootNode.append(create('p','この車種の国内新車年次統計は収録されていません。0台とは限りません。','ry-muted'));
  return;
 }
 const items=create('div',undefined,'ry-history'),max=Math.max(1,...view.japanNewSales.map(x=>x.units));
 for(const row of view.japanNewSales){
  const el=create('div',undefined,'ry-year'),track=create('div',undefined,'ry-track');
  const bar=create('div',undefined,'ry-fill');bar.style.width=(row.units/max*100).toFixed(1)+'%';
  track.append(bar);
  el.append(create('span',String(row.year)+'年'),track,
   create('span',fmt(row.units)+'台'));
  items.append(el);
 }
 rootNode.append(items);
 const sources=create('p','年次資料：','ry-muted');
 for(const y of view.japanNewSales){link(sources,String(y.year)+'年（'+y.scope+'・'+(y.source_type==='official'?'公式':'二次資料')+'）',y.source_url);sources.append(document.createTextNode('　'))}
 rootNode.append(sources);
}
function attachNotes(view,rootNode){
 rootNode.append(create('h4',view.country+' × '+view.make+' '+view.model+'｜車種別輸出需要の根拠'));
 rootNode.append(metric('車種名まで一致した公式の対'+view.country+'輸出台数','未取得','国の全車種データや国内新車数から割り振りません','missing'));
 if(view.notesError){rootNode.append(create('p',view.notesError,'ry-warning'));return}
 if(!view.modelNotes.length){
  rootNode.append(create('p','一致する車種別の本人記録はありません。選択できることは、その国で売れた・輸出された証拠ではありません。','ry-warning'));
  return;
 }
 rootNode.append(create('p','次は既存の本人入力データです。集計対象や原典は未検証で、公式の実輸出数値ではありません。','ry-warning'));
 for(const n of view.modelNotes.slice(0,10)){
  const line=create('p',n.period+'：当期 '+fmt(n.current)+'台／前年同月 '+fmt(n.previous)+'台｜'+n.scope+'｜'+n.source+'　','ry-note');
  link(line,'根拠URL',n.source_url);rootNode.append(line);
 }
}
function paint(view){
 host.replaceChildren();
 const stats=create('div',undefined,'ry-metrics');
 const ytd=view.macro;
 stats.append(metric('二次集計｜日本→'+view.country+'（全車種・全区分）',
  ytd?fmt(ytd.count)+'台':'未収録',
  ytd?view.macroPeriod+'／前年比 '+ytd.yoy_pct+'%':'国別累計の公開上位10か国外。0台ではありません',
  ytd?'secondary':'missing'));
 const ranked=view.categories.filter(x=>x.units!==null);
 stats.append(metric('二次集計｜車両分類の収録',ranked.length+' / '+view.categories.length+'分類',
  view.categoryPeriod+'、各分類の輸出先上位5か国だけを収録','secondary'));
 host.append(stats);
 host.append(create('p','国別累計と月次の分類別台数は対象期間が異なります。合算・比率計算はできません。国全体の増加を選択車種の需要増と判定しません。','ry-warning'));
 const linkBox=create('p','出典：','ry-muted');
 link(linkBox,'国別累計',view.macroSource);linkBox.append(document.createTextNode(' ／ '));
 link(linkBox,'分類別ランキング',view.categorySource);
 host.append(linkBox);
 host.append(create('h4',view.country+'｜車両タイプ別の月次輸出（上位5国抜粋）'));
 const cards=create('div',undefined,'ry-metrics');
 for(const c of view.categories){
  cards.append(metric(c.title,c.units===null?'未収録':fmt(c.units)+'台',
   c.units===null?'上位5か国に未掲載（ゼロではない）':c.period+'｜車種・メーカー不問',
   c.units===null?'missing':'secondary'));
 }
 host.append(cards);
 const official=create('section',undefined,'gm-official');
 official.append(create('h4','政府公式e-Stat｜国×HS分類（車種名ではない）'));
 const e=view.officialView;
 if(e.status==='available'){
  official.append(create('p',String(e.month)+'／公的統計表ID '+view.officialStatsId+'。以下は収録済みの中古乗用車HS行の小計で、車名別輸出実績ではありません。','ry-muted'));
  const summary=create('div',undefined,'ry-metrics');
  for(const g of e.byGroup){
   summary.append(metric(g.label,g.units===null?'未収録':fmt(g.units)+'台',
     '収録 '+g.reported+' HS行。車両分類の網羅性は未確認',
     g.units===null?'missing':'official'));
  }
  official.append(summary);
  const linkLine=create('p','原典：','ry-muted');link(linkLine,'政府統計データ',view.officialSource);official.append(linkLine);
 }else{
  official.append(create('p',e.status==='not_configured'
   ?'公式e-Statはまだ未設定です。GitHub Actionsの ESTAT_APP_ID 登録後に実測が取得できれば表示されます。'
   :'この国・月の公式HS分類データは未収録です。0台という意味ではありません。','ry-muted'));
 }
 host.append(official);
 if(view.ruInfo){
  const ru=create('div',undefined,'gm-country-reference');
  ru.append(create('h4','ロシア関連の公表参考値（車種別ではありません）'));
  const general=view.ruInfo.passenger2025;
  if(general){
   ru.append(metric('2025年 日本→ロシア 中古乗用車・全車種',
    fmt(general.value)+'台','JETRO引用の財務省通関統計／ヤリス等の車名別ではない','official'));
   const linkRow=create('p','原資料：','ry-muted');link(linkRow,'JETRO',general.source_url);ru.append(linkRow);
  }
  const toyota=view.ruInfo.toyotaSales2025;
  if(toyota){
   ru.append(metric('2025年 ロシア国内 トヨタ中古車販売・全トヨタ車',
    fmt(toyota.value)+'台','AUTOSTAT調査のブランド集計。日本からの輸出台数ではない','industry'));
  }
  if(view.ruInfo.sanctions){
   const p=create('p','対ロ輸出規制は車両の仕様・動力・排気量などで異なります。この選択画面では輸出可否を自動判定しません。','ry-warning');
   link(p,'経産省資料',view.ruInfo.sanctions.url);ru.append(p);
  }
  host.append(ru);
 }
 attachNewSales(view,host);
 attachNotes(view,host);
}
function status(message){$('export-model-status').textContent=message}
let inputs=null;
function rememberSelection(){
 try{localStorage.setItem(SELECTION_KEY,JSON.stringify({
  country:$('export-model-country').value,
  make:$('export-model-make').value,
  model:$('export-model-model').value
 }))}catch{/* private mode: controls still work */}
}
function readSelection(){
 try{const v=JSON.parse(localStorage.getItem(SELECTION_KEY)||'null');
  return v&&typeof v.country==='string'&&typeof v.make==='string'&&typeof v.model==='string'?v:null;
 }catch{return null}
}
function selectOptions(el,values,preferred){
 el.replaceChildren();
 for(const v of values){const item=create('option',v);item.value=v;el.append(item)}
 el.value=values.includes(preferred)?preferred:values[0]||'';
}
function updateModels(preferred){
 const maker=inputs.catalog.makes.find(x=>x.make===$('export-model-make').value);
 selectOptions($('export-model-model'),maker?.models||[],preferred);
}
function change(){
 if(!inputs)return;
 const c=$('export-model-country').value,m=$('export-model-make').value,v=$('export-model-model').value;
 try{
  const view=buildView(inputs.catalog,inputs.snapshot,inputs.official,inputs.annual,inputs.kei,inputs.russia,
   inputs.notes,c,m,v);
  paint(view);
  if(root.MDExportEvidence?.refresh){
    try{root.MDExportEvidence.refresh(view,inputs.snapshot,inputs.official)}
    catch(err){
      const target=$('export-evidence-results');
      if(target)target.textContent='比較表を表示できません：'+err.message;
    }
  }
  rememberSelection();
  status(view.country+' × '+view.make+' '+view.model+'を表示中。車種別の公式実輸出台数は未取得です。');
 }catch(err){host.replaceChildren();status('表示できません：'+err.message)}
}
async function readJson(path){
 const r=await (root.MDOffline?.read?root.MDOffline.read(path,{cache:'no-store'}):fetch(path,{cache:'no-store'}));
 if(!r.ok)throw Error('データを取得できません：'+path);
 return r.json();
}
async function refresh(){
 status('国・メーカー・車種のデータを確認中…');
 try{
  const [catalog,snapshot,annual,kei,official,russia]=await Promise.all([
   readJson(CATALOG),readJson(SNAPSHOT),readJson(ANNUAL),
   readJson(KEI),readJson(OFFICIAL),readJson(RUSSIA)
  ]);
  let notes='';
  try{notes=localStorage.getItem(NOTES_KEY)||''}catch{/* readonly failure */}
  inputs={catalog,snapshot,annual,kei,official,russia,notes};
  verifyCatalog(catalog);
  const previously=readSelection(),noteSet=readNotes(notes);
  const cOpts=countryOptions(catalog,snapshot,official,noteSet);
  const countrySelect=$('export-model-country');
  const popular=cOpts.filter(x=>x.hasAggregate),future=cOpts.filter(x=>!x.hasAggregate);
  countrySelect.replaceChildren();
  for(const [label,group] of [['公開統計に掲載あり（全車種・国別）',popular],['追加の輸出先候補（データ未収録の場合あり）',future]]){
   if(!group.length)continue;
   const optgroup=create('optgroup');optgroup.label=label;
   for(const item of group){const opt=create('option',item.name);opt.value=item.name;optgroup.append(opt)}
   countrySelect.append(optgroup);
  }
  countrySelect.value=cOpts.some(x=>x.name===previously?.country)?previously.country:'ロシア';
  selectOptions($('export-model-make'),catalog.makes.map(x=>x.make),previously?.make||'トヨタ');
  updateModels(previously?.model||'ヤリス');
  change();
 }catch(err){host.replaceChildren();status('統計を読み込めません：'+err.message)}
}
$('export-model-country').addEventListener('change',change);
$('export-model-make').addEventListener('change',()=>{updateModels();change()});
$('export-model-model').addEventListener('change',change);
$('export-model-refresh').addEventListener('click',refresh);
$('export-model-add-note').addEventListener('click',()=>{
 const p=$('crossborder-panel'),country=$('export-model-country').value;
 if(!p){status('車種別の本人記録フォームがありません');return}
 p.open=true;
 const inner=p.querySelector('details');if(inner)inner.open=true;
 for(const [id,value] of [['crossborder-note-make',$('export-model-make').value],
  ['crossborder-note-model',$('export-model-model').value],['crossborder-note-country',country]]){
  const target=$(id);if(target)target.value=value;
 }
 p.scrollIntoView({behavior:'smooth',block:'start'});
});
$('export-model-country-mix').addEventListener('click',()=>{
 const p=$('country-mix-panel'),select=$('country-mix-country');
 if(!p||!select){status('国別車両タイプの表示パネルがありません');return}
 p.open=true;
 const country=$('export-model-country').value;
 if([...select.options].some(x=>x.value===country)){
  select.value=country;select.dispatchEvent(new Event('change',{bubbles:true}));
  p.scrollIntoView({behavior:'smooth',block:'start'});
 }else{status('その国は車両区分の公開抜粋には未収録です。こちらのモニターで表示できます。')}
});
refresh();
})(typeof window==='undefined'?globalThis:window);
