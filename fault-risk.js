/* MD MARKET v2.6 - user-verified fault evidence notebook, no scraping or inferred fault rates. */
(function(root){
'use strict';
const KEY='md-market-fault-evidence-v1', MAX=250;
const TYPES=Object.freeze({field:'現場経験・本人確認',mlit:'国交省の不具合申告',maker:'メーカー公式情報',sns:'SNS・口コミ',web:'整備事例・その他'});
const STATUSES=Object.freeze({reported:'症状の報告',diagnosed:'故障部位を確認',repaired:'修理・交換を確認'});
const $=id=>document.getElementById(id);
const clean=x=>String(x??'').normalize('NFKC').trim().replace(/\s+/g,' ');
const code=x=>clean(x).toUpperCase().replace(/\s/g,'').replace(/^[A-Z0-9]{2,4}-/,'');
function url(input){
 const s=clean(input);if(!s)return '';
 try{const u=new URL(s);if(!['https:','http:'].includes(u.protocol)||u.username||u.password||!u.hostname.includes('.'))throw Error();
 return u.href;}catch{throw Error('出典URLはHTTP/HTTPSの有効なURLを入力してください');}
}
function date(s){
 if(!s)return true;
 if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;
 const d=new Date(s+'T00:00:00Z');
 return !Number.isNaN(d.getTime())&&d.toISOString().slice(0,10)===s;
}
function item(raw){
 if(!raw||typeof raw!=='object')throw Error('記録の形式が正しくありません');
 const o={id:clean(raw.id),make:clean(raw.make),model:clean(raw.model),
  model_code:code(raw.model_code),component:clean(raw.component),symptom:clean(raw.symptom),
  source_type:clean(raw.source_type),source_url:url(raw.source_url),
  status:clean(raw.status),event_date:clean(raw.event_date),notes:clean(raw.notes),
  mileage_km:raw.mileage_km===''||raw.mileage_km==null?null:Number(raw.mileage_km),
  repair_cost_jpy:raw.repair_cost_jpy===''||raw.repair_cost_jpy==null?null:Number(raw.repair_cost_jpy)};
 if(!o.id||o.id.length>100||!o.make||o.make.length>50||!o.model||o.model.length>80)
  throw Error('ID・メーカー・車種を確認してください');
 if(!o.model_code||o.model_code.length>24||!/^[A-Z0-9-]+$/.test(o.model_code))
  throw Error('型式を正しく入力してください（例：E12 / HE12 / DBA-E12）');
 if(!o.component||o.component.length>80||!o.symptom||o.symptom.length>400||o.notes.length>500)
  throw Error('故障部位・症状・メモの文字数を確認してください');
 if(!Object.hasOwn(TYPES,o.source_type)||!Object.hasOwn(STATUSES,o.status))throw Error('情報源・確認状況を選択してください');
 if(o.source_type!=='field'&&!o.source_url)throw Error('外部情報を記録する場合は原典URLを必ず入力してください');
 if(!date(o.event_date))throw Error('確認日が不正です');
 if(o.mileage_km!==null&&(!Number.isSafeInteger(o.mileage_km)||o.mileage_km<0||o.mileage_km>2000000))
  throw Error('走行距離は0〜200万kmにしてください');
 if(o.repair_cost_jpy!==null&&(!Number.isSafeInteger(o.repair_cost_jpy)||o.repair_cost_jpy<0||o.repair_cost_jpy>10000000))
  throw Error('修理費は0〜1,000万円にしてください');
 return o;
}
function validate(items){
 if(!Array.isArray(items)||items.length>MAX)throw Error('最大250件まで保存できます');
 const seen=new Set();
 return items.map(x=>{const r=item(x);if(seen.has(r.id))throw Error('記録IDが重複しています');seen.add(r.id);return r;});
}
function merge(old,incoming){
 const a=validate(old),b=validate(incoming),map=new Map(a.map(x=>[x.id,x]));
 for(const x of b){const prior=map.get(x.id);if(prior){if(JSON.stringify(prior)!==JSON.stringify(x))throw Error('同一IDで内容が異なる記録は上書きしません');}else map.set(x.id,x);}
 return validate([...map.values()]);
}
function search(items,filter){
 const f={make:clean(filter.make).toLowerCase(),model:clean(filter.model).toLowerCase(),model_code:code(filter.model_code)};
 return validate(items).filter(x=>(!f.make||x.make.toLowerCase().includes(f.make))&&
  (!f.model||x.model.toLowerCase().includes(f.model))&&(!f.model_code||x.model_code===f.model_code));
}
function backup(items){return JSON.stringify({kind:'md_market_fault_evidence',schema_version:1,items:validate(items)},null,2);}
function restore(text){
 let b;try{b=JSON.parse(text)}catch{throw Error('JSON形式が正しくありません')}
 if(!b||b.kind!=='md_market_fault_evidence'||b.schema_version!==1)throw Error('故障情報メモのバックアップではありません');
 return validate(b.items);
}
function adjustedCap(baseline,reserve){
 if(baseline===''||reserve==='')return null;
 const a=Number(baseline),b=Number(reserve);
 if(!Number.isSafeInteger(a)||!Number.isSafeInteger(b)||a<0||b<0||a>1e9||b>1e7||b>a)return null;
 return a-b;
}
const API={KEY,MAX,TYPES,STATUSES,code,item,validate,merge,search,backup,restore,adjustedCap};
if(typeof module==='object'&&module.exports)module.exports=API;
root.MDFault=API;
if(typeof document==='undefined')return;
const rootEl=$('fault-risk-panel');if(!rootEl)return;
let rows=[],healthy=true;
const status=$('fault-status'),form=$('fault-form'),list=$('fault-records'),filterCode=$('fault-filter-code');
const el=(tag,cls,value)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(value!=null)n.textContent=value;return n;};
function say(message){status.textContent=message;}
function load(){
 try{const raw=localStorage.getItem(KEY);rows=raw?restore(raw):[];}
 catch(err){healthy=false;rows=[];say('保存データに問題があります。既存データ保護のため保存・復元を停止しました：'+err.message);}
 if(!healthy){$('fault-save').disabled=true;$('fault-restore').disabled=true;}
}
function persist(next){
 if(!healthy)throw Error('保存データが壊れているため書き込みを中止しました');
 const normalized=validate(next);
 localStorage.setItem(KEY,backup(normalized));
 rows=normalized;
 render();
}
function link(href,label){
 const a=el('a','fault-link',label);a.href=href;a.target='_blank';a.rel='noopener noreferrer';return a;
}
function render(){
 const matches=search(rows,{make:$('fault-filter-make').value,model:$('fault-filter-model').value,model_code:filterCode.value});
 $('fault-count').textContent='端末内メモ '+matches.length+'件（全'+rows.length+'件）';
 list.replaceChildren();
 if(!matches.length){list.append(el('p','mycar-note','条件に合う記録がありません。未登録は「故障がない」という意味ではありません。'));return;}
 for(const x of matches.slice().reverse()){
  const card=el('article','fault-record');
  const hd=el('div','fault-record-head');
  hd.append(el('strong','',x.make+' '+x.model+' / '+x.model_code),el('span','fault-source-tag',TYPES[x.source_type]));
  card.append(hd,el('div','fault-record-title',x.component+'：'+x.symptom));
  const meta=[STATUSES[x.status],x.event_date||'日付未記録',x.mileage_km==null?'距離不明':x.mileage_km.toLocaleString('ja-JP')+' km',
   x.repair_cost_jpy==null?'修理費未記録':'修理費 '+x.repair_cost_jpy.toLocaleString('ja-JP')+' 円'];
  card.append(el('p','fault-record-meta',meta.join(' / ')));
  if(x.notes)card.append(el('p','fault-record-note',x.notes));
  const bottom=el('div','fault-record-actions');
  if(x.source_url)bottom.append(link(x.source_url,'記録された出典を開く'));
  const remove=el('button','button ghost','このメモを削除');remove.type='button';
  remove.addEventListener('click',()=>{
   if(!confirm('この故障情報メモ1件を削除しますか？ 元には戻せません。'))return;
   try{persist(rows.filter(q=>q.id!==x.id));say('1件削除しました。バックアップの更新を推奨します。');}
   catch(err){say('削除できません：'+err.message)}
  });
  bottom.append(remove);card.append(bottom);list.append(card);
 }
}
function fromForm(){
 const v=id=>$(id).value;
 return item({id:typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():String(Date.now())+'-'+Math.random().toString(36).slice(2),
  make:v('fault-make'),model:v('fault-model'),model_code:v('fault-code'),component:v('fault-component'),
  symptom:v('fault-symptom'),source_type:v('fault-source'),source_url:v('fault-url'),status:v('fault-condition'),
  event_date:v('fault-date'),mileage_km:v('fault-mileage'),repair_cost_jpy:v('fault-cost'),notes:v('fault-notes')});
}
function fillFromCar(){
 try{
  const selector=$('mycar-selector'),raw=localStorage.getItem(root.MDPersonal?.KEY);
  const car=JSON.parse(raw).cars.find(x=>x.id===selector.value);
  if(!car)throw Error('マイカー登録がありません');
  $('fault-make').value=car.make;$('fault-model').value=car.model;
  $('fault-filter-make').value=car.make;$('fault-filter-model').value=car.model;
  $('fault-mileage').value=car.mileage;render();say('登録したマイカーの車名・走行距離を読み込みました。型式は別途確認してください。');
 }catch{say('マイカーが登録されていません。メーカー・車種を直接入力してください。');}
}
function showCap(){
 const result=adjustedCap($('fault-baseline').value,$('fault-reserve').value);
 $('fault-adjusted').textContent=result==null?'両方の金額を正しく入力してください':'¥'+result.toLocaleString('ja-JP');
}
load();
$('fault-today').textContent='※確認の取れた資料や現場経験のみ記録。SNS投稿は故障確定ではありません。';
$('fault-example').addEventListener('click',()=>{
 $('fault-make').value='日産';$('fault-model').value='ノート';$('fault-code').value='E12';
 $('fault-component').value='エアミックスアクチュエーター';
 $('fault-symptom').value='温度調整不能（現場経験を記録する際の入力例）';
 $('fault-source').value='field';$('fault-condition').value='reported';
 $('fault-date').value='';$('fault-mileage').value='';$('fault-cost').value='';$('fault-url').value='';
 $('fault-notes').value='入力例です。具体的な修理・診断を確認してから保存してください。';
 say('E12の入力例を表示しました。自動保存していません。HE12など別型式とは分けてください。');
});
$('fault-sync-mycar').addEventListener('click',fillFromCar);
form.addEventListener('submit',e=>{
 e.preventDefault();
 try{const x=fromForm();persist(merge(rows,[x]));form.reset();say('出典区分付きで1件保存しました。故障率やリコール対象を示す情報ではありません。');}
 catch(err){say('保存できません：'+err.message)}
});
['fault-filter-make','fault-filter-model','fault-filter-code'].forEach(id=>$(id).addEventListener('input',render));
$('fault-export').addEventListener('click',()=>{
 try{const area=$('fault-backup');area.value=backup(rows);area.focus();area.select();say('故障メモ'+rows.length+'件分を表示しました。コピーして端末外に保管してください。まだ外部保存は完了していません。');}
 catch(err){say('書き出しに失敗しました：'+err.message)}
});
$('fault-restore').addEventListener('click',()=>{
 try{const old=rows.length;persist(merge(rows,restore($('fault-backup').value)));say((rows.length-old)+'件を追加復元しました。既存メモは上書きしていません。');}
 catch(err){say('復元できません：'+err.message)}
});
['fault-baseline','fault-reserve'].forEach(id=>$(id).addEventListener('input',showCap));
showCap();render();
})(typeof window==='undefined'?globalThis:window);
