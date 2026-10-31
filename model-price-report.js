/* MD MARKET v2.3: user-transcribed monthly model price report (NOT sales outcomes).
   Source: CarSensor monthly model trends. Local-only, no scraping, no automatic price assumptions. */
'use strict';
(function(root){
 const KEY='md-market-model-price-monthly-v1',LIMIT=500;
 const SOURCE='https://www.carsensor.net/contents/souken/contents/_68603.html';
 const MONTH=/^20\d{2}-(0[1-9]|1[0-2])$/;
 const clean=s=>String(s??'').normalize('NFKC').trim().replace(/\s+/g,' ');
 const canon=s=>clean(s).toUpperCase().replace(/[\s\u3000\u2010-\u2015\u2212\u30fc\-＿_]/g,'');
 const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''))&&
    !Number.isNaN(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
 function pdfUrl(s){
  const url=clean(s);
  if(!url)return '';
  try{
   const u=new URL(url);
   if(u.protocol!=='https:'||u.username||u.password||!/^(?:[\w-]+\.)?carsensor\.net$/.test(u.hostname.toLowerCase()))throw Error();
   if(!u.pathname.toLowerCase().endsWith('.pdf'))throw Error();
   return u.href;
  }catch{throw Error('PDFのURLはカーセンサー公式ドメインのHTTPS・PDFファイルを指定してください');}
 }
 function inputYen(s){
  const value=String(s??'').trim();
  if(!/^(?:0|[1-9]\d{0,3})(?:\.\d)?$/.test(value))throw Error('平均支払総額は万円単位の数字（小数第1位まで）で入力してください');
  const yen=Math.round(Number(value)*10000);
  if(yen<10000||yen>99990000)throw Error('平均支払総額は1万〜9,999万円の範囲です');
  return yen;
 }
 function validate(row){
  if(!row||!MONTH.test(row.month)||!validDate(row.checked_on))throw Error('対象月または確認日が不正です');
  const o={month:row.month,make:clean(row.make),model:clean(row.model),model_scope:clean(row.model_scope),
   average_total_yen:row.average_total_yen,extended_listings:row.extended_listings,
   source_url:SOURCE,source_pdf_url:pdfUrl(row.source_pdf_url),checked_on:row.checked_on};
  if([o.make,o.model,o.model_scope].some(x=>!x))throw Error('メーカー・車名・モデル区分は必須です');
  if(o.make.length>50||o.model.length>70||o.model_scope.length>140)throw Error('車名・モデル区分が長すぎます');
  if(row.source_url!==SOURCE)throw Error('参照元は公式のモデル別中古車動向データに限定しています');
  if(!Number.isSafeInteger(o.average_total_yen)||o.average_total_yen<10000||o.average_total_yen>99990000)
    throw Error('平均支払総額は円の整数（1万〜9,999万円）にしてください');
  if(!Number.isSafeInteger(o.extended_listings)||o.extended_listings<0||o.extended_listings>2000000)
    throw Error('月間延べ掲載台数は0〜200万台の整数です');
  return o;
 }
 function seriesKey(r){return JSON.stringify([canon(r.make),canon(r.model),canon(r.model_scope),r.source_url]);}
 function recordKey(r){return seriesKey(r)+'|'+r.month;}
 function validateRows(rows){
  if(!Array.isArray(rows)||rows.length>LIMIT)throw Error('月次価格記録は500件以内です');
  const seen=new Set();
  return rows.map(r=>{const v=validate(r),k=recordKey(v);if(seen.has(k))throw Error('同じ車種・区分・月の記録が重複しています');seen.add(k);return v;});
 }
 function mergeRows(existing,incoming){
  const a=validateRows(existing),b=validateRows(incoming),out=[...a],map=new Map(a.map(x=>[recordKey(x),x]));
  for(const row of b){
   const k=recordKey(row),old=map.get(k);
   if(old){if(JSON.stringify(old)!==JSON.stringify(row))throw Error('既存月の数値と異なります。上書きしません。原典を確認してください');continue;}
   out.push(row);map.set(k,row);
  }
  if(out.length>LIMIT)throw Error('500件の上限を超えるため復元しません');
  return out.sort((x,y)=>x.month.localeCompare(y.month));
 }
 const monthIndex=m=>Number(m.slice(0,4))*12+Number(m.slice(5,7));
 function summarize(rows,key){
  const data=validateRows(rows).filter(x=>seriesKey(x)===key).sort((a,b)=>a.month.localeCompare(b.month));
  const latest=data.at(-1)||null,previous=data.length>1?data.at(-2):null;
  const gap=latest&&previous?monthIndex(latest.month)-monthIndex(previous.month):null;
  const delta=latest&&previous?latest.average_total_yen-previous.average_total_yen:null;
  const pct=delta!==null&&previous.average_total_yen>0?delta/previous.average_total_yen*100:null;
  const volumeDelta=latest&&previous?latest.extended_listings-previous.extended_listings:null;
  return {data,latest,previous,gap,delta,pct,volumeDelta,
   comparable:!!(previous&&gap===1)};
 }
 function bundle(rows){return JSON.stringify({schema_version:1,kind:'model_monthly_price_observations',source:'user_transcribed_from_official_publication',records:validateRows(rows)},null,2);}
 function unbundle(s){
  let b;try{b=JSON.parse(s)}catch{throw Error('JSON形式が不正です')}
  if(!b||b.schema_version!==1||b.kind!=='model_monthly_price_observations'||!Array.isArray(b.records))throw Error('車種別月次価格のバックアップではありません');
  return validateRows(b.records);
 }
 const API={KEY,LIMIT,SOURCE,validate,validateRows,mergeRows,seriesKey,recordKey,summarize,bundle,unbundle,inputYen,pdfUrl};
 if(typeof module==='object'&&module.exports)module.exports=API;
 root.MDModelPrice=API;
 if(typeof document==='undefined')return;
 const $=id=>document.getElementById(id);
 if(!$('model-price-panel'))return;
 const status=$('model-price-status'),selector=$('model-price-series'),summary=$('model-price-summary'),table=$('model-price-rows');
 const backup=$('model-price-backup');
 let rows=[],ok=true;
 const number=n=>Number(n).toLocaleString('ja-JP');
 const money=n=>(n/10000).toLocaleString('ja-JP',{minimumFractionDigits:0,maximumFractionDigits:1})+'万円';
 function node(tag,text,cls){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;}
 function read(){
  let raw='';
  try{raw=localStorage.getItem(KEY)||'';rows=validateRows(raw?JSON.parse(raw):[]);}
  catch(err){ok=false;backup.value=raw;status.textContent='保存済み価格記録の形式を確認できません。原本を削除・上書きせずに保管してください：'+err.message;}
  $('model-price-save').disabled=!ok;$('model-price-restore').disabled=!ok;
 }
 function persist(next){localStorage.setItem(KEY,JSON.stringify(next));rows=next;}
 function dateNow(){
  const d=new Date(),p=x=>String(x).padStart(2,'0');
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());
 }
 function chart(holder,data,key,yLabel){
  holder.replaceChildren();if(!data.length)return;
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 330 120');svg.setAttribute('role','img');
  svg.setAttribute('aria-label',yLabel+'の記録済み月次推移');
  const vals=data.map(x=>x[key]),low=Math.min(...vals),high=Math.max(...vals),spread=Math.max(1,high-low);
  const pts=data.map((x,i)=>({x:data.length===1?165:22+i*286/(data.length-1),y:92-((x[key]-low)/spread)*64}));
  const path=document.createElementNS('http://www.w3.org/2000/svg','polyline');
  path.setAttribute('points',pts.map(p=>p.x+','+p.y).join(' '));path.setAttribute('fill','none');path.setAttribute('stroke','#56dbc8');path.setAttribute('stroke-width','3');
  svg.append(path);
  for(let i=0;i<pts.length;i++){
   const dot=document.createElementNS('http://www.w3.org/2000/svg','circle');
   dot.setAttribute('cx',pts[i].x);dot.setAttribute('cy',pts[i].y);dot.setAttribute('r','3.5');dot.setAttribute('fill','#fff');svg.append(dot);
  }
  holder.append(svg);
 }
 function draw(){
  const old=selector.value,group=new Map();
  for(const r of rows){const k=seriesKey(r);if(!group.has(k))group.set(k,[]);group.get(k).push(r);}
  selector.replaceChildren();
  for(const [key,items] of group){
   const r=items[0],op=node('option',r.make+' '+r.model+' / '+r.model_scope+'（'+items.length+'か月）');
   op.value=key;selector.append(op);
  }
  if(group.has(old))selector.value=old;
  selector.disabled=group.size===0;
  table.replaceChildren();
  if(group.size===0){
   summary.textContent='まだ月次数値の登録はありません。公式のPDFを開き、同じモデル区分の2か月分を確認・登録すると推移を表示します。';
   chart($('model-price-chart'),[],'average_total_yen','平均支払総額');
   chart($('model-volume-chart'),[],'extended_listings','延べ掲載台数');
   return;
  }
  const s=summarize(rows,selector.value);
  const r=s.latest;
  summary.textContent=r.make+' '+r.model+' / '+r.model_scope+'：'+r.month+' 平均支払総額 '+money(r.average_total_yen)+'、月間延べ掲載台数 '+number(r.extended_listings)+'台'+
    (s.previous?'。'+s.previous.month+'と比較 '+(s.delta>=0?'+':'')+money(s.delta)+
       ' / '+(s.volumeDelta>=0?'+':'')+number(s.volumeDelta)+'台'+
       (s.comparable?'（前月比較）':'（'+s.gap+'か月間隔・前月比ではありません）'):'。比較する月次記録はありません。');
  const view=s.data.slice(-12);
  chart($('model-price-chart'),view,'average_total_yen','平均支払総額');
  chart($('model-volume-chart'),view,'extended_listings','延べ掲載台数');
  for(const r of [...s.data].reverse()){
   const tr=node('tr');
   for(const value of [r.month,money(r.average_total_yen),number(r.extended_listings)+'台',r.checked_on])tr.append(node('td',value));
   const cell=node('td');
   const link=node('a',r.source_pdf_url?'原文PDF':'原資料一覧');
   link.href=r.source_pdf_url||r.source_url;link.target='_blank';link.rel='noopener noreferrer';cell.append(link);
   tr.append(cell);table.append(tr);
  }
 }
 $('model-price-checked').value=dateNow();
 $('model-price-month').value=dateNow().slice(0,7);
 $('model-price-source').href=SOURCE;
 read();draw();
 selector.addEventListener('change',draw);
 $('model-price-form').addEventListener('submit',e=>{
  e.preventDefault();if(!ok)return;
  try{
   const val=id=>$(id).value;
   const p=validate({month:val('model-price-month'),make:val('model-price-make'),model:val('model-price-model'),
    model_scope:val('model-price-scope'),average_total_yen:inputYen(val('model-price-amount')),
    extended_listings:Number(val('model-price-count')),checked_on:val('model-price-checked'),
    source_url:SOURCE,source_pdf_url:val('model-price-pdf')});
   if(val('model-price-count').trim()==='')throw Error('月間延べ掲載台数を入力してください');
   const next=mergeRows(rows,[p]);
   if(next.length===rows.length)throw Error('同一月・同一モデルの記録は登録済みです');
   persist(next);draw();selector.value=seriesKey(p);draw();
   status.textContent=p.month+'の価格・台数をこの端末に記録しました。PDFから利用者が転記した数値であり、アプリは原文との一致を自動検証していません。';
  }catch(err){status.textContent='登録できません：'+err.message;}
 });
 $('model-price-export').addEventListener('click',()=>{
  try{backup.value=bundle(rows);status.textContent=rows.length+'件のJSONを表示しました。コピーして端末の外へ保管してください';}
  catch(e){status.textContent='書き出しエラー：'+e.message;}
 });
 $('model-price-restore').addEventListener('click',()=>{
  if(!ok)return;
  try{const incoming=unbundle(backup.value),next=mergeRows(rows,incoming),added=next.length-rows.length;
    persist(next);draw();status.textContent=added+'件を追加復元しました。既存の値を消去・上書きしていません';}
  catch(e){status.textContent='復元できません：'+e.message;}
 });
})(typeof window==='undefined'?globalThis:window);
