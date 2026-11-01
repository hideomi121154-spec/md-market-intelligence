/* MD MARKET v3.9: domestic used listings vs overseas export macro context.
   Never infer model demand from country or category aggregates. */
'use strict';
(function(root){
const KEY='md-market-crossborder-model-notes-v1',MAX=100;
const tidy=x=>String(x??'').normalize('NFKC').trim().replace(/\s+/g,' ');
const canon=x=>tidy(x).toUpperCase().replace(/[\s\u3000\u2010-\u2015\u2212\u30fc\-_＿]/g,'');
const maker=x=>({'TOYOTA':'トヨタ','NISSAN':'日産','HONDA':'ホンダ','LEXUS':'レクサス','SUZUKI':'スズキ','MAZDA':'マツダ','SUBARU':'スバル','DAIHATSU':'ダイハツ','MITSUBISHI':'三菱'})[canon(x)]||canon(x);
const identity=r=>maker(r.make)+'|'+canon(r.model);
const ym=s=>/^\d{4}-(0[1-9]|1[0-2])$/.test(s);
const date=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
const days=(a,b)=>(Date.parse(a+'T12:00:00Z')-Date.parse(b+'T12:00:00Z'))/86400000;
function positive(v,max,label){if(v===''||v===null||v===undefined||typeof v==='boolean'||!Number.isSafeInteger(Number(v))||Number(v)<0||Number(v)>max)throw Error(label+'は0〜'+max+'の整数で指定してください');return Number(v)}
function uri(value){const v=tidy(value);try{const u=new URL(v);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||!u.hostname.includes('.'))throw Error();return u.href}catch{throw Error('参照URLは有効なHTTP/HTTPS形式で入力してください')}}
function note(raw){
 if(!raw||typeof raw!=='object')throw Error('車種別根拠の形式が不正です');
 const out={id:tidy(raw.id),make:tidy(raw.make),model:tidy(raw.model),country:tidy(raw.country),
  scope:tidy(raw.scope),period:tidy(raw.period),previous_period:tidy(raw.previous_period),
  current:positive(raw.current,10000000,'当期の台数'),previous:positive(raw.previous,10000000,'前年同月の台数'),
  source:tidy(raw.source),source_url:uri(raw.source_url),notes:tidy(raw.notes)};
 if(!out.id||out.id.length>100||!out.make||out.make.length>50||!out.model||out.model.length>80||
 !out.country||out.country.length>60||!out.scope||out.scope.length>160||
 !out.source||out.source.length>160||out.notes.length>500)throw Error('車種・国・集計対象・出典などを確認してください');
 if(!ym(out.period)||!ym(out.previous_period)||Number(out.period.slice(0,4))-Number(out.previous_period.slice(0,4))!==1||
 out.period.slice(5)!==out.previous_period.slice(5))throw Error('同じ月の前年同期との比較のみ記録できます');
 if(out.current===0&&out.previous===0)throw Error('両方0台の場合は海外需要を判断できません');
 return out;
}
function validateNotes(raw){
 if(!Array.isArray(raw)||raw.length>MAX)throw Error('最大100件の記録のみ保存できます');
 const ids=new Set();
 return raw.map(x=>{const n=note(x);if(ids.has(n.id))throw Error('記録IDが重複しています');ids.add(n.id);return n});
}
function mergeNotes(a,b){
 const map=new Map(validateNotes(a).map(x=>[x.id,x]));
 for(const n of validateNotes(b)){
  if(map.has(n.id)&&JSON.stringify(map.get(n.id))!==JSON.stringify(n))throw Error('同じIDの異なる記録は上書きしません');
  map.set(n.id,n)
 }
 return validateNotes([...map.values()]);
}
function backup(rows){return JSON.stringify({schema_version:1,kind:'md_market_crossborder_notes',records:validateNotes(rows)},null,2)}
function restore(text){let x;try{x=JSON.parse(text)}catch{throw Error('JSONが不正です')}
 if(!x||x.schema_version!==1||x.kind!=='md_market_crossborder_notes')throw Error('この機能専用のバックアップではありません');
 return validateNotes(x.records);
}
function analyze(inventoryRows,series,country,notes,snapshot,asOf,I,watch){
 if(!I||!I.validateRows||!I.seriesKey||!I.summarize)throw Error('国内在庫の検証処理がありません');
 if(!root.MDOverseas?.verifySnapshot && !snapshot?.country_ytd)throw Error('輸出統計がありません');
 if(!date(asOf))throw Error('確認日が不正です');
 const checked=I.validateRows(inventoryRows),matching=checked.filter(x=>I.seriesKey(x)===series&&x.date<=asOf);
 const domestic=I.summarize(matching,series);
 const row=domestic.latest;
 if(!row)return {available:false,reason:'保存した国内掲載在庫から対象を選択してください'};
 const elapsed=days(asOf,row.date);
 const gap=domestic.previous?days(row.date,domestic.previous.date):null;
 const outage=!!(domestic.previous&&watch?.outageOverlap?.(domestic.previous.date,row.date,row.source_url));
 const supplyReady=!!domestic.previous&&gap>=1&&gap<=45&&elapsed>=0&&elapsed<=30&&!outage;
 const countryRow=snapshot.country_ytd?.countries?.find(x=>x.country===country)||null;
 if(!countryRow)throw Error('収録されている国別統計から選んでください');
 const diff=countryRow.yoy_pct-100;
 const exportDirection=diff>5?'増加':diff< -5?'減少':'横ばい圏';
 const supplyDirection=!supplyReady?'比較保留':domestic.delta>0?'増加':domestic.delta<0?'減少':'変化なし';
 const inferred=validateNotes(notes).filter(n=>identity(n)===identity(row)&&n.country===country&&n.period<=snapshot.latest_period)
  .sort((a,b)=>b.period.localeCompare(a.period));
 const modelEvidence=inferred[0]||null;
 const modelYoy=modelEvidence&&modelEvidence.previous>0?100*(modelEvidence.current/modelEvidence.previous-1):null;
 const mismatched=inferred.length>1&&inferred[1].period===modelEvidence.period&&
  (inferred[1].scope!==modelEvidence.scope||inferred[1].current!==modelEvidence.current||inferred[1].previous!==modelEvidence.previous);
 const blockers=[];
 if(!domestic.previous)blockers.push('国内掲載台数を同じ検索条件で2回記録する');
 else if(outage)blockers.push('掲載元の障害期間をまたぐ観測のため比較を保留する');
 else if(!supplyReady)blockers.push(elapsed>30?'国内掲載台数が30日超前です':'国内観測の日付・間隔を確認する');
 if(!modelEvidence)blockers.push('この車種・輸出先の実台数は未収録。国全体の輸出増から車種需要を断定しない');
 if(modelEvidence&&modelYoy===null)blockers.push('車種別前年同月が0台のため伸び率は計算不能');
 if(modelEvidence)blockers.push('入力した車種別出典と対象台数が同一定義か原典で再確認する（入力値は未認証）');
 if(mismatched)blockers.push('同月の車種別データが複数の集計範囲で競合しています');
 blockers.push('国内掲載終了は売約の確証ではなく、輸出先の輸入規制・車齢要件・輸送費とAA成約価格を別に調べる');
 return {available:true,model:row.make+' '+row.model,region:row.region,conditions:row.conditions,
  grade:row.grade,color:row.color,domestic:{current:row.count,previous:domestic.previous?.count??null,
   delta:domestic.delta,pct:domestic.pct,latestDate:row.date,previousDate:domestic.previous?.date??null,
   interval:gap,age:elapsed,outage,ready:supplyReady,direction:supplyDirection,source:row.source_url},
  overseas:{country,total:countryRow.count,yoy:countryRow.yoy_pct,direction:exportDirection,period:snapshot.country_ytd.period,
   source:snapshot.country_ytd.source_url},
  modelEvidence,modelYoy,modelEvidenceConflict:!!mismatched,
  verdict:supplyReady?'国内掲載 '+supplyDirection+'／'+country+'全車種の輸出 '+exportDirection:'国内掲載比較保留／'+country+'全車種の輸出 '+exportDirection,
  evidenceStrength:modelEvidence?'車種別台数はユーザー記録（原典照合要）':'車種別の輸出需要は不明',
  blockers};
}
const API={KEY,note,validateNotes,mergeNotes,backup,restore,analyze,identity};
if(typeof module==='object'&&module.exports)module.exports=API;
root.MDCrossover=API;
if(typeof document==='undefined')return;
const $=id=>document.getElementById(id),panel=$('crossborder-panel');if(!panel)return;
const mk=(tag,cls,value)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(value!==undefined)x.textContent=value;return x};
const fmt=n=>Number(n).toLocaleString('ja-JP');
let snapshot=null,notes=[],storageOK=true,inventoryOK=true;
function status(s){$('crossborder-status').textContent=s}
function localRead(){
 let rows;
 try{rows=root.MDInventory?.validateRows(JSON.parse(localStorage.getItem(root.MDInventory.KEY)||'[]')||[])}
 catch(e){inventoryOK=false;status('掲載台数の保存データを確認できません。元のデータは変更していません：'+e.message);return []}
 return rows;
}
function setupSeries(){
 const rows=localRead(),select=$('crossborder-series'),current=select.value;
 const grouped=new Map();
 for(const r of rows){const k=root.MDInventory.seriesKey(r);if(!grouped.has(k))grouped.set(k,r)}
 select.replaceChildren();
 for(const [key,entry] of grouped){
  const o=mk('option',null,entry.make+' '+entry.model+'｜'+entry.region+'｜'+entry.conditions.slice(0,34));o.value=key;select.append(o);
 }
 if(grouped.has(current))select.value=current;
}
function readNotes(){
 try{notes=restore(localStorage.getItem(KEY)||backup([]))}
 catch(e){storageOK=false;notes=[];status('海外車種別根拠の保存データを読み込めないため保存を停止します：'+e.message)}
 for(const id of ['crossborder-save','crossborder-import'])$(id).disabled=!storageOK;
}
function writeNotes(next){
 if(!storageOK)throw Error('保存状態が不正なため上書きを停止しています');
 const checked=validateNotes(next);localStorage.setItem(KEY,backup(checked));notes=checked;drawNotes();
}
function drawNotes(){
 const area=$('crossborder-notes');area.replaceChildren();
 if(!notes.length){area.append(mk('p','overseas-muted','車種別の実台数記録はありません。現状は国全体の統計との対比のみです。'));return}
 for(const entry of notes.slice().reverse()){
  const box=mk('div','crossborder-note');
  box.append(mk('strong',null,entry.make+' '+entry.model+'｜'+entry.country+'｜'+entry.period));
  box.append(mk('p','overseas-muted',entry.scope+'：'+fmt(entry.current)+'台（前年同月 '+fmt(entry.previous)+'台）'));
  const a=mk('a',null,'自己入力した出典');a.href=entry.source_url;a.target='_blank';a.rel='noopener noreferrer';box.append(a);
  const del=mk('button','button ghost','この記録を削除');del.type='button';del.addEventListener('click',()=>{
   if(!confirm('この車種別根拠を削除しますか？'))return;
   try{writeNotes(notes.filter(n=>n.id!==entry.id));refresh();status('1件削除しました')}catch(e){status(e.message)}
  });box.append(del);area.append(box);
 }
}
function noteFromForm(){
 const id=typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random();
 const v=id=>$(id).value;
 return note({id,make:v('crossborder-note-make'),model:v('crossborder-note-model'),country:v('crossborder-note-country'),
  scope:v('crossborder-note-scope'),period:v('crossborder-note-period'),previous_period:v('crossborder-note-prior-period'),
  current:v('crossborder-note-current'),previous:v('crossborder-note-previous'),source:v('crossborder-note-source'),
  source_url:v('crossborder-note-url'),notes:v('crossborder-note-extra')});
}
function refresh(){
 if(!snapshot)return;
 const area=$('crossborder-results');area.replaceChildren();
 try{
  const result=analyze(localRead(),$('crossborder-series').value,$('crossborder-country').value,notes,snapshot,
   new Date().toLocaleDateString('sv-SE'),root.MDInventory,root.MDWatch);
  if(!result.available){area.append(mk('p','crossborder-caution',result.reason));return}
  const metric=(k,v)=>{const block=mk('div','crossborder-metric');block.append(mk('small',null,k),mk('strong',null,v));return block};
  const cards=mk('div','crossborder-metrics');
  cards.append(metric('国内の最新掲載台数',fmt(result.domestic.current)+'台'),
   metric('国内の前回比',result.domestic.ready?(result.domestic.delta>0?'+':'')+fmt(result.domestic.delta)+'台':'比較保留'),
   metric(result.overseas.country+'向け全車種の輸出台数',fmt(result.overseas.total)+'台'),
   metric('同国向け輸出・前年同期比',result.overseas.yoy.toFixed(1)+'%'));
  area.append(cards);
  area.append(mk('h3',null,result.verdict));
  area.append(mk('p','overseas-muted','国内：'+result.domestic.previousDate+' → '+result.domestic.latestDate
   +'（'+result.domestic.region+'）／海外：'+result.overseas.period+'。観測期間と対象母数は異なるため直接比較できません。'.replace('undefined','')));
  if(result.modelEvidence){
   const n=result.modelEvidence;
   area.append(mk('p','crossborder-emphasis','車種別の自己記録：'+n.make+' '+n.model+'／'+n.country+'　当月'+fmt(n.current)+'台、前年同月'+fmt(n.previous)+'台'
    +'、前年比'+(result.modelYoy===null?'計算不可':(result.modelYoy>=0?'+':'')+result.modelYoy.toFixed(1)+'%')
    +'（'+n.period+'、集計範囲：'+n.scope+'）。入力値の真偽は未検証。'));
   const link=mk('a',null,'車種別根拠を確認する');link.href=n.source_url;link.target='_blank';link.rel='noopener noreferrer';area.append(link);
  }else area.append(mk('p','crossborder-caution','**車種別輸出需要は未確認**：国別の輸出増加は、その車種の海外人気を証明しません。'));
  area.append(mk('p','overseas-muted','比較対象：'+result.model+'／'+result.region+'／'+result.conditions
   +'。仕入れの上限価格・販売速度・収益性は推定していません。'));
  const list=mk('ul','crossborder-tasks');
  for(const task of result.blockers)list.append(mk('li',null,task));
  area.append(list);
  const refs=mk('p','overseas-muted','出典：');
  const exportLink=mk('a',null,'国別輸出統計');exportLink.href=result.overseas.source;exportLink.rel='noopener noreferrer';exportLink.target='_blank';
  const localLink=mk('a',null,'国内の検索条件');localLink.href=result.domestic.source;localLink.rel='noopener noreferrer';localLink.target='_blank';
  refs.append(exportLink,document.createTextNode(' / '),localLink);area.append(refs);
 }catch(e){area.append(mk('p','crossborder-caution','比較できません：'+e.message))}
}
async function initialize(){
 readNotes();drawNotes();setupSeries();
 $('crossborder-series').addEventListener('change',refresh);
 $('crossborder-country').addEventListener('change',refresh);
 root.addEventListener('md-inventory-updated',()=>{setupSeries();refresh()});
 $('crossborder-save').addEventListener('click',()=>{
  try{writeNotes(mergeNotes(notes,[noteFromForm()]));refresh();status('車種別輸出実績の自己記録を保存しました。出典は未検証です。')}
  catch(e){status('保存できません：'+e.message)}
 });
 $('crossborder-export').addEventListener('click',()=>{$('crossborder-json').value=backup(notes);$('crossborder-json').focus();$('crossborder-json').select();status('バックアップJSONを表示しました。自動送信しません。')});
 $('crossborder-import').addEventListener('click',()=>{
  try{const before=notes.length;writeNotes(mergeNotes(notes,restore($('crossborder-json').value)));refresh();status('追加復元：'+(notes.length-before)+'件。衝突IDは上書きしません。')}catch(e){status('復元できません：'+e.message)}
 });
 try{
  const reader=root.MDOffline?.read?root.MDOffline.read(root.MDOverseas.DATA,{cache:'no-store'}):fetch(root.MDOverseas.DATA,{cache:'no-store'});
  const response=await reader;if(!response.ok)throw Error('国別統計の取得に失敗しました');
  snapshot=root.MDOverseas.verifySnapshot(await response.json());
  const countries=snapshot.country_ytd.countries.map(x=>x.country),country=$('crossborder-country');
  for(const item of countries){const option=mk('option',null,item);option.value=item;country.append(option)}
  refresh();
  if(inventoryOK)status('国内掲載記録と海外輸出統計を比較できます。車種別需要は別途出典が必要です。');
 }catch(e){status('海外統計を読み込めません。ネット接続とキャッシュを確認してください：'+e.message)}
}
initialize();
})(typeof window==='undefined'?globalThis:window);
