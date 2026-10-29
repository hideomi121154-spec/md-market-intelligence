/* MD MARKET – offline IndexedDB store & CSV parser, no third-party libraries. */
(function(global){
'use strict';
const DB_NAME='md_market_pwa_v1', VERSION=2, STORE='records', AUDITS='audits';
const FIELDS=['date','make','model','grade','year','mileage_km','price_jpy','channel','market_type','region','source_url','color','equipment','repair_history','source_name','vendor_record_id','evidence_status'];
const REQUIRED=['date','make','model','price_jpy','channel','source_url'];
const MARKET=['dealer_auction','consumer_auction','unspecified_auction','retail_listing'];
function normalize(s){return String(s||'').normalize('NFKC').trim().replace(/\s+/g,' ')}
function canonicalMake(s){const v=normalize(s),u=v.toUpperCase();return ({'TOYOTA':'トヨタ','トヨタ自動車':'トヨタ','HONDA':'ホンダ','本田':'ホンダ','NISSAN':'日産','ニッサン':'日産','SUZUKI':'スズキ','MAZDA':'マツダ','DAIHATSU':'ダイハツ','SUBARU':'スバル'})[u]||v}
function canonicalModel(s){const v=normalize(s),u=v.toUpperCase().replace(/[\s－‐‑ー_]/g,'');return ({'NBOX':'N-BOX','CX5':'CX-5','RAV4':'RAV4'})[u]||v}
function colorGroup(s){const x=normalize(s).toUpperCase();if(!x||['不明','未確認','UNKNOWN','-'].includes(x))return '不明';if(/ツートン|2トーン|2 TONE|白黒|黒白/.test(x))return 'その他';for(const [cat,re] of [['白系',/白|ホワイト|WHITE|パール/],['黒系',/黒|ブラック|BLACK/],['銀系',/銀|シルバー|SILVER/],['灰系',/灰|グレー|グレイ|GRAY|GREY/],['青系',/青|ブルー|BLUE|紺/],['赤系',/赤|レッド|RED|ワイン/]])if(re.test(x))return cat;return 'その他'}
function tokens(s){return String(s||'').split(/[|;；、\n]+/).map(normalize).filter(Boolean)}
function parseCSV(text){let arr=[],row=[],cell='',quoted=false;const input=String(text||'').replace(/^\uFEFF/,'');for(let i=0;i<input.length;i++){const c=input[i];if(quoted){if(c==='"'&&input[i+1]==='"'){cell+='"';i++}else if(c==='"')quoted=false;else cell+=c;}else if(c==='"'&&cell==='')quoted=true;else if(c===','){row.push(cell);cell='';}else if(c==='\n'||c==='\r'){if(c==='\r'&&input[i+1]==='\n')i++;row.push(cell);cell='';if(row.some(x=>x!==''))arr.push(row);row=[];}else cell+=c;}if(quoted)throw new Error('CSVの引用符が閉じられていません');row.push(cell);if(row.some(x=>x!==''))arr.push(row);return arr;}
const ALIASES={'メーカー':'make','車種':'model','車名':'model','グレード':'grade','年式':'year','走行距離':'mileage_km','成約価格':'price_jpy','落札価格':'price_jpy','市場区分':'market_type','出典URL':'source_url','色':'color','装備':'equipment','成約日':'date','データ提供元':'source_name'};
function validUrl(s){try{const u=new URL(String(s));return ['https:','http:'].includes(u.protocol)}catch{return false}}
function readRecords(text){const rows=parseCSV(text);if(!rows.length)throw new Error('CSVにデータがありません');const heads=rows[0].map(s=>ALIASES[normalize(s)]||normalize(s));const missing=REQUIRED.filter(x=>!heads.includes(x));if(missing.length)throw new Error('必須列が不足しています: '+missing.join(', '));if(rows.length>20001)throw new Error('一度に読み込めるのは20,000行までです');const result=[],errors=[];for(let j=1;j<rows.length;j++){const src={};heads.forEach((h,i)=>{if(FIELDS.includes(h))src[h]=String(rows[j][i]||'').trim()});const err=[];for(const k of REQUIRED)if(!src[k])err.push(k+' が空');const p=Number(src.price_jpy);if(!Number.isSafeInteger(p)||p<0)err.push('price_jpy が正しくありません');if(!/^\d{4}-\d{2}-\d{2}$/.test(src.date||'')||!Number.isFinite(Date.parse(src.date)))err.push('date はYYYY-MM-DDにしてください');if(!['auction','retail'].includes(src.channel))err.push('channelはauctionまたはretail');if(!validUrl(src.source_url))err.push('source_urlがHTTP(S)ではありません');let market=src.market_type|| (src.channel==='retail'?'retail_listing':'unspecified_auction');if(!MARKET.includes(market)||(src.channel==='retail')!==(market==='retail_listing'))err.push('market_typeとchannelが一致しません');const year=src.year?Number(src.year):null;if(src.year&&(!Number.isInteger(year)||year<1900||year>2100))err.push('yearが範囲外');const mileage=src.mileage_km?Number(src.mileage_km):null;if(src.mileage_km&&(!Number.isFinite(mileage)||mileage<0||mileage>2000000))err.push('mileage_kmが範囲外');if(err.length){if(errors.length<20)errors.push(`${j+1}行目: ${err.join(' / ')}`);continue;}
result.push({...src,price_jpy:p,year,mileage_km:mileage,date:src.date,market_type:market,make_norm:canonicalMake(src.make),model_norm:canonicalModel(src.model),grade_norm:normalize(src.grade),color_group:colorGroup(src.color),equipment_tokens:tokens(src.equipment),evidence_status:'unverified'});
}return {records:result,rejected:rows.length-1-result.length,errors};}
async function decodeImportText(input){
 const raw=String(input||'').trim();
 if(!/^MDGZ1:/i.test(raw))return raw;
 const encoded=raw.slice(6).replace(/\s+/g,'');
 if(!encoded||encoded.length>1000000||!/^[A-Za-z0-9_-]+$/.test(encoded))throw new Error('貼り付けコードの形式が正しくありません');
 if(typeof DecompressionStream==='undefined')throw new Error('このSafariは圧縮データの展開に対応していません。iOSを更新してください');
 try{
  const base64=encoded.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-encoded.length%4)%4);
  const bytes=Uint8Array.from(atob(base64),c=>c.charCodeAt(0));
  const decoded=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text();
  if(new TextEncoder().encode(decoded).length>5*1024*1024)throw new Error('展開されたデータが5MBを超えています');
  return decoded;
 }catch(err){if(err?.message?.includes('5MB'))throw err;throw new Error('貼り付けコードを復元できません。途中で欠けていないか確認してください');}
}
function idFor(r){const keys=['date','make','model','grade','year','mileage_km','price_jpy','channel','market_type','source_url','vendor_record_id'];return keys.map(k=>String(r[k]??'')).join('\u001f')}
function openDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,VERSION);req.onupgradeneeded=()=>{const d=req.result;if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE,{keyPath:'id'});if(!d.objectStoreNames.contains(AUDITS))d.createObjectStore(AUDITS,{keyPath:'id'})};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function all(){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly');const req=tx.objectStore(STORE).getAll();req.onsuccess=()=>resolve(req.result||[]);req.onerror=()=>reject(req.error);tx.oncomplete=()=>db.close();tx.onerror=()=>reject(tx.error);})}
async function insert(rows){const db=await openDb();return new Promise((resolve,reject)=>{let inserted=0,duplicates=0;const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE);const seen=new Set();for(const row of rows){const r={...row,id:idFor(row)};if(seen.has(r.id)){duplicates++;continue;}seen.add(r.id);const lookup=store.get(r.id);lookup.onsuccess=()=>{if(lookup.result){duplicates++;return;}const add=store.add(r);add.onsuccess=()=>inserted++;};}tx.oncomplete=()=>{db.close();resolve({inserted,duplicates})};tx.onerror=()=>{db.close();reject(tx.error||Error('DB保存失敗'))};tx.onabort=()=>{db.close();reject(tx.error||Error('DB保存中断'))};})}
async function clear(){const db=await openDb();return new Promise((resolve,reject)=>{const tx=db.transaction([STORE,AUDITS],'readwrite');tx.objectStore(STORE).clear();tx.objectStore(AUDITS).clear();tx.oncomplete=()=>{db.close();resolve()};tx.onerror=()=>{db.close();reject(tx.error)}})}

function eligibleForManualCheck(row){
 const url=String(row.source_url||'');
 let host='';
 try{host=new URL(url).hostname.toLowerCase()}catch{return false;}
 const prohibited=['example.com','example.org','example.net','example.test','localhost','127.0.0.1'];
 if(prohibited.includes(host)||host.endsWith('.test')||!host.includes('.'))return false;
 return ['dealer_auction','consumer_auction','retail_listing'].includes(row.market_type)&&
  Number.isSafeInteger(row.price_jpy)&&row.price_jpy>=0;
}
function validateReviewInput(record,action,notes,confirmed){
 if(!record?.id)throw new Error('照合対象のレコードがありません');
 if(!['user_checked','flagged','unverified'].includes(action))throw new Error('照合状況が不正です');
 if(action==='user_checked'){
  if(!eligibleForManualCheck(record))throw new Error('出典URLが例示用、または市場種別が未特定です。照合済みにできません');
  if(!confirmed)throw new Error('原本の金額・日付・車両情報・市場区分の照合確認が必要です');
  if(String(notes||'').trim().length<10)throw new Error('原本の確認内容・相違のない点を10文字以上で記録してください');
 }
 if(action==='flagged'&&String(notes||'').trim().length<5)throw new Error('問題点を5文字以上で記録してください');
 return {id:record.id,status:action,notes:action==='unverified'?'':String(notes||'').trim().slice(0,500),
   checked_at:action==='unverified'?'':new Date().toISOString(),source_url:record.source_url};
}
async function getReviews(){const db=await openDb();return new Promise((resolve,reject)=>{
 const tx=db.transaction(AUDITS,'readonly'),q=tx.objectStore(AUDITS).getAll();
 q.onsuccess=()=>resolve(q.result||[]);q.onerror=()=>reject(q.error);
 tx.oncomplete=()=>db.close();tx.onerror=()=>reject(tx.error);
});}

async function exportReviewBundle(){
 const reviews=await getReviews();
 return JSON.stringify({schema:'MD_MARKET_REVIEW_V1',created_at:new Date().toISOString(),
   description:'Local user-attested reviews, not third-party verification',reviews},null,2);
}
async function restoreReviewBundle(raw){
 const input=String(raw||'').trim();
 if(input.length>5*1024*1024)throw new Error('照合履歴は5MB以下にしてください');
 let data;
 try{data=JSON.parse(input)}catch{throw new Error('バックアップのJSONを読み取れません');}
 if(data?.schema!=='MD_MARKET_REVIEW_V1'||!Array.isArray(data.reviews)||data.reviews.length>20000)
   throw new Error('MD MARKET照合履歴の形式ではありません');
 const rows=await all(),map=new Map(rows.map(r=>[r.id,r]));
 const candidates=[],seen=new Set();
 for(const item of data.reviews){
  if(!item||typeof item.id!=='string'||seen.has(item.id))continue;
  seen.add(item.id);
  const original=map.get(item.id);
  if(!original||original.source_url!==item.source_url)continue;
  if(!['user_checked','flagged'].includes(item.status))continue;
  const notes=String(item.notes||'').slice(0,500);
  if(item.status==='user_checked'&&(!eligibleForManualCheck(original)||notes.trim().length<10))continue;
  if(item.status==='flagged'&&notes.trim().length<5)continue;
  if(typeof item.checked_at!=='string'||!/^20\d\d-/.test(item.checked_at)||
     !Number.isFinite(Date.parse(item.checked_at)))continue;
  candidates.push({id:item.id,status:item.status,notes,checked_at:item.checked_at,source_url:original.source_url});
 }
 if(!candidates.length)return {restored:0,skipped:data.reviews.length};
 const db=await openDb();
 return new Promise((resolve,reject)=>{
  const tx=db.transaction(AUDITS,'readwrite'),store=tx.objectStore(AUDITS);
  for(const item of candidates)store.put(item);
  tx.oncomplete=()=>{db.close();resolve({restored:candidates.length,skipped:data.reviews.length-candidates.length})};
  tx.onerror=()=>{db.close();reject(tx.error)};
 });
}

async function saveReview(record,action,notes,confirmed){
 const audit=validateReviewInput(record,action,notes,confirmed);
 const db=await openDb();
 return new Promise((resolve,reject)=>{
 const tx=db.transaction([STORE,AUDITS],'readwrite');
 const rq=tx.objectStore(STORE).get(record.id);
 rq.onsuccess=()=>{
  if(!rq.result){tx.abort();return;}
  if(action==='unverified')tx.objectStore(AUDITS).delete(record.id);
  else tx.objectStore(AUDITS).put(audit);
 };
 tx.oncomplete=()=>{db.close();resolve(audit)};
 tx.onabort=()=>{db.close();reject(new Error('照合対象がない、または保存処理に失敗しました'))};
 tx.onerror=()=>{db.close();reject(tx.error)};
 });
}

function median(values){if(!values.length)return null;const x=[...values].sort((a,b)=>a-b),m=Math.floor(x.length/2);return x.length%2?x[m]:(x[m-1]+x[m])/2}
function filter(rows,f){const make=canonicalMake(f.make||''),model=canonicalModel(f.model||''),grade=normalize(f.grade||'');const equipment=normalize(f.equipment||'');return rows.filter(r=>{
 if(f.channel&&r.channel!==f.channel)return false;if(f.market&&r.market_type!==f.market)return false;if(make&&!canonicalMake(r.make).includes(make))return false;if(model&&!canonicalModel(r.model).toUpperCase().includes(model.toUpperCase()))return false;if(grade&&!normalize(r.grade).includes(grade))return false;if(f.yearMin&&(r.year==null||r.year<Number(f.yearMin)))return false;if(f.yearMax&&(r.year==null||r.year>Number(f.yearMax)))return false;if(f.mileageMax!==(undefined)&&f.mileageMax!==''&&(r.mileage_km==null||r.mileage_km>Number(f.mileageMax)))return false;if(f.color&&r.color_group!==f.color)return false;if(equipment&&!tokens(r.equipment).includes(equipment))return false;return true})}
function summarize(rows){const types=[...new Set(rows.map(r=>r.market_type))];const mixed=types.length>1;const byMonth=new Map();if(!mixed)for(const r of rows){const key=r.date.slice(0,7);if(!byMonth.has(key))byMonth.set(key,[]);byMonth.get(key).push(r.price_jpy)}const series=[...byMonth.entries()].sort((a,b)=>a[0].localeCompare(b[0])).map(([month,prices])=>({month,median_price_jpy:median(prices),count:prices.length}));return {count:rows.length,median_price_jpy:mixed?null:median(rows.map(r=>r.price_jpy)),mixed,markets:types,series}}
function safeCSV(v){let s=String(v==null?'':v);if(/^[\s]*[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"'}
function exportCSV(rows){return '\uFEFF'+FIELDS.filter(f=>f!=='evidence_status').join(',')+'\r\n'+rows.map(row=>FIELDS.filter(f=>f!=='evidence_status').map(k=>safeCSV(row[k])).join(',')).join('\r\n')+'\r\n'}
global.MDStore={openDb,all,insert,clear,getReviews,saveReview,exportReviewBundle,restoreReviewBundle,eligibleForManualCheck,validateReviewInput,readRecords,decodeImportText,filter,summarize,median,exportCSV,parseCSV,colorGroup,canonicalMake,canonicalModel};
})(window);