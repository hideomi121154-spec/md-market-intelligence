/* MD MARKET: user-entered used-car listing observations (NOT sales transactions). */
'use strict';
(function(root){
const KEY='md-market-inventory-snapshots-v1',LIMIT=500;
const norm=s=>String(s||'').normalize('NFKC').trim().replace(/\s+/g,' ');
const canon=s=>norm(s).toUpperCase().replace(/[\s\u3000\u2010-\u2015\u2212\u30fc\-_]/g,'');
function validDate(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(s||'')))return false;const d=new Date(s+'T12:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===s}
function validUrl(s){try{const u=new URL(s);return ['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&u.hostname.includes('.')&&!['example.com','example.org','example.net','example.test'].includes(u.hostname)&&!u.hostname.endsWith('.test')}catch{return false}}
const host=s=>new URL(s).hostname.toLowerCase();
function validateEntry(r){
 if(!r||!validDate(r.date))throw Error('観測日が正しくありません');
 const o={date:r.date,make:norm(r.make),model:norm(r.model),region:norm(r.region),grade:norm(r.grade),color:norm(r.color),conditions:norm(r.conditions),source_url:String(r.source_url||'').trim(),count:typeof r.count==='number'?r.count:Number(r.count)};
 if(!o.make||!o.model||!o.region||!o.conditions)throw Error('メーカー・車種・地域・検索条件は必須です');
 for(const [k,max] of [['make',50],['model',70],['region',80],['grade',100],['color',60],['conditions',300]])if(o[k].length>max)throw Error('文字数の上限を超えています');
 if(!validUrl(o.source_url))throw Error('有効な参照URL（HTTP/HTTPS）が必要です');
 if(r.count===''||r.count==null||!Number.isSafeInteger(o.count)||o.count<0||o.count>1000000)throw Error('掲載台数は0〜100万台の整数で入力してください');
 return o;
}
function seriesKey(r){return JSON.stringify([canon(r.make),canon(r.model),canon(r.region),canon(r.grade),canon(r.color),canon(r.conditions),r.source_url])}
function validateRows(rows){
 if(!Array.isArray(rows)||rows.length>LIMIT)throw Error('記録形式または500件の上限を確認してください');
 const seen=new Set();
 return rows.map(r=>{const v=validateEntry(r),id=seriesKey(v)+'|'+v.date;if(seen.has(id))throw Error('同一条件・同一日が重複しています');seen.add(id);return v});
}
function mergeRows(base,newRows){
 const a=validateRows(base),b=validateRows(newRows),out=[...a],ids=new Map(a.map(r=>[seriesKey(r)+'|'+r.date,r]));
 for(const r of b){const id=seriesKey(r)+'|'+r.date,old=ids.get(id);
  if(old){if(JSON.stringify(old)!==JSON.stringify(r))throw Error('既存の同一日データは上書きしません');continue;}
  ids.set(id,r);out.push(r);
 }
 if(out.length>LIMIT)throw Error('500件の上限を超えます');
 return out.sort((a,b)=>a.date.localeCompare(b.date));
}
function summarize(rows,key){
 const data=validateRows(rows).filter(r=>seriesKey(r)===key).sort((a,b)=>a.date.localeCompare(b.date));
 const latest=data.at(-1)||null,previous=data.length>1?data[data.length-2]:null;
 const delta=latest&&previous?latest.count-previous.count:null;
 return {data,latest,previous,delta,pct:delta!==null&&previous.count>0?delta/previous.count*100:null};
}
function importBundle(s){
 let v;try{v=JSON.parse(s)}catch{throw Error('JSONの形式が正しくありません')}
 if(!v||v.schema_version!==1||v.kind!=='used_listing_observations'||!Array.isArray(v.records))throw Error('在庫観測バックアップではありません');
 return validateRows(v.records);
}
function exportBundle(rows){return JSON.stringify({schema_version:1,kind:'used_listing_observations',records:validateRows(rows)},null,2)}
const API={KEY,LIMIT,validDate,validateEntry,validateRows,seriesKey,mergeRows,summarize,importBundle,exportBundle};
root.MDInventory=API;
if(typeof module==='object'&&module.exports)module.exports=API;
if(typeof document==='undefined')return;
const $=id=>document.getElementById(id);if(!$('inventory-panel'))return;
const status=$('inventory-status'),select=$('inventory-series'),list=$('inventory-list'),summary=$('inventory-summary'),backup=$('inventory-backup');
let records=[],healthy=true;
const fmt=n=>Number(n).toLocaleString('ja-JP');
function node(tag,cls,text){const el=document.createElement(tag);if(cls)el.className=cls;if(text!==undefined)el.textContent=text;return el}
function load(){
 let raw='';
 try{raw=localStorage.getItem(KEY)||'';records=validateRows(raw?JSON.parse(raw):[])}
 catch(e){healthy=false;backup.value=raw;status.textContent='保存記録を読み込めません。上書きせず元データを控えてください：'+e.message}
 $('inventory-save').disabled=!healthy;$('inventory-restore').disabled=!healthy;
}
function persist(updated){localStorage.setItem(KEY,JSON.stringify(updated));records=updated;}
function render(){
 const old=select.value,groups=new Map();
 for(const r of records){const k=seriesKey(r);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(r)}
 select.replaceChildren();
 const entries=[...groups.entries()].sort((a,b)=>b[1].at(-1).date.localeCompare(a[1].at(-1).date));
 for(const [key,rows] of entries){const r=rows[0],option=node('option',null,r.make+' '+r.model+' / '+r.region+' / '+host(r.source_url)+' / '+r.conditions.slice(0,36));option.value=key;select.append(option)}
 if(entries.some(([k])=>k===old))select.value=old;
 list.replaceChildren();
 if(!entries.length){summary.textContent='記録はまだありません。同じ検索条件で2回以上確認すると増減を表示します。';return;}
 const s=summarize(records,select.value);
 summary.textContent='最新 '+s.latest.date+'：'+fmt(s.latest.count)+'台'+(s.previous?' ／ 前回 '+s.previous.date+'：'+fmt(s.previous.count)+'台 ／ 増減 '+(s.delta>=0?'+':'')+fmt(s.delta)+'台'+(s.pct===null?'（前回0台・増減率未計算）':'（'+(s.pct>=0?'+':'')+s.pct.toFixed(1)+'%）'):' ／ 比較用の2件目を記録してください');
 for(const r of [...s.data].reverse().slice(0,15)){const line=node('div','inventory-row');line.append(node('strong',null,r.date),node('span',null,fmt(r.count)+'台'));const a=node('a',null,'参照元');a.href=r.source_url;a.target='_blank';a.rel='noopener noreferrer';line.append(a);list.append(line);}
}
function today(){const d=new Date(),p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())}
$('inventory-date').value=today();load();render();
select.addEventListener('change',render);
$('inventory-form').addEventListener('submit',e=>{
 e.preventDefault();if(!healthy)return;
 try{const v=id=>$(id).value;
  const row=validateEntry({date:v('inventory-date'),make:v('inventory-make'),model:v('inventory-model'),region:v('inventory-region'),grade:v('inventory-grade'),color:v('inventory-color'),conditions:v('inventory-conditions'),source_url:v('inventory-url'),count:v('inventory-count')});
  const updated=mergeRows(records,[row]);if(updated.length===records.length)throw Error('同じ日の同一条件データが既に存在します');
  persist(updated);render();select.value=seriesKey(row);render();window.dispatchEvent(new Event('md-inventory-updated'));status.textContent='端末内に掲載台数を保存しました。成約台数ではありません。';
 }catch(err){status.textContent='保存できません：'+err.message}
});
$('inventory-export').addEventListener('click',()=>{try{backup.value=exportBundle(records);status.textContent=records.length+'件のバックアップを表示しました。コピーして保管してください。'}catch(e){status.textContent='書き出しエラー：'+e.message}});
$('inventory-restore').addEventListener('click',()=>{
 if(!healthy)return;
 try{const incoming=importBundle(backup.value),merged=mergeRows(records,incoming),n=merged.length-records.length;persist(merged);render();window.dispatchEvent(new Event('md-inventory-updated'));status.textContent=n+'件を追加復元しました。元の記録は削除・上書きしていません。'}
 catch(e){status.textContent='復元できません：'+e.message}
});
})(typeof window==='undefined'?{}:window);