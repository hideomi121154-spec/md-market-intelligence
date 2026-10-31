/* USS public, aggregate monthly figures. Kept separate from local individual records. */
'use strict';
(()=>{
 const el=id=>document.getElementById(id);
 const number=n=>Number(n).toLocaleString('ja-JP');
 const pct=n=>Number(n).toFixed(1)+'%';
 const label=month=>month.replace(/^(\d{4})-(\d{2})$/,(_,y,m)=>`${y}年${Number(m)}月`);
 const fallbackKey='mdmarket_uss_monthly_v1';
 function validate(data){
   if(!data||data.schema_version!==1||!Array.isArray(data.months)||data.months.length<1||data.months.length>12)throw Error('月次データ形式が異なります');
   if(!/^https:\/\/(www\.ussnet\.co\.jp|qtwcca163\.secure\.jp)\/ir\//.test(data.source_url||''))throw Error('USS公式URLを確認できません');
   let previous='';const observed=new Set();
   for(const r of data.months){
     if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(r.month)||r.month<=previous||observed.has(r.month))throw Error('月の並びが不正です');
     previous=r.month;observed.add(r.month);
     const fields=['offered','sold','sale_rate_pct','avg_sold_price_thousand_jpy','offered_yoy_pct','sold_yoy_pct','avg_sold_price_yoy_pct'];
     if(fields.some(k=>typeof r[k]!=='number'||!Number.isFinite(r[k])))throw Error('統計値が不正です');
     if(r.offered<=0||r.sold<=0||r.sold>r.offered||r.avg_sold_price_thousand_jpy<=0||r.sale_rate_pct<0||r.sale_rate_pct>100||Math.abs(r.sold/r.offered*100-r.sale_rate_pct)>0.16)throw Error('統計値の整合性エラー');
   }
   return data;
 }
 function svgLine(items,field,unit,title){
   const w=600,h=170,left=54,right=18,top=24,bottom=32;
   const vals=items.map(x=>x[field]);let low=Math.min(...vals),high=Math.max(...vals);
   if(low===high){low=Math.max(0,low*.96);high=high*1.04+0.1;}else{const padding=(high-low)*.12;low=Math.max(0,low-padding);high+=padding;}
   const points=vals.map((v,i)=>({x:left+(w-left-right)*(vals.length===1?.5:i/(vals.length-1)),y:h-bottom-(v-low)/(high-low)*(h-top-bottom)}));
   const poly=points.map(p=>p.x.toFixed(1)+','+p.y.toFixed(1)).join(' ');
   let inner=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${title}の月別推移" class="uss-svg"><line x1="${left}" y1="${h-bottom}" x2="${w-right}" y2="${h-bottom}" stroke="#3f5672"/><text x="2" y="${top}" fill="#acc0d9" font-size="12">${high.toFixed(1)}${unit}</text><text x="2" y="${h-bottom}" fill="#acc0d9" font-size="12">${low.toFixed(1)}${unit}</text><polyline points="${poly}" fill="none" stroke="#28d1bd" stroke-width="3" stroke-linejoin="round"/>`;
   points.forEach((p,i)=>{inner+=`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="4" fill="#28d1bd"/>`;if(i===0||i===points.length-1|| (points.length>3 && i%Math.ceil(points.length/4)===0)){inner+=`<text x="${p.x.toFixed(1)}" y="${h-8}" text-anchor="middle" fill="#bed0e4" font-size="12">${Number(items[i].month.slice(5))}月</text>`;}});
   return inner+'</svg>';
 }
 function render(data,mode){
   const months=data.months,latest=months[months.length-1];
   el('uss-period').textContent=`${label(latest.month)} · USS公式月次統計`;
   el('uss-offered').textContent=number(latest.offered);
   el('uss-sold').textContent=number(latest.sold);
   el('uss-rate').textContent=pct(latest.sale_rate_pct);
   el('uss-price').textContent=number(latest.avg_sold_price_thousand_jpy/10)+'万円';
   el('uss-yoy').textContent=`前年同月比：出品 ${pct(latest.offered_yoy_pct)} · 成約 ${pct(latest.sold_yoy_pct)} · 単価 ${pct(latest.avg_sold_price_yoy_pct)}`;
   el('uss-chart-price').innerHTML=svgLine(months,'avg_sold_price_thousand_jpy','千円','平均成約単価');
   el('uss-chart-rate').innerHTML=svgLine(months,'sale_rate_pct','%','成約率');
   const body=el('uss-rows');body.textContent='';
   for(const r of months.slice().reverse()){
     const row=document.createElement('tr');
     for(const value of [label(r.month),number(r.offered),number(r.sold),pct(r.sale_rate_pct),number(r.avg_sold_price_thousand_jpy)]){const cell=document.createElement('td');cell.textContent=value;row.appendChild(cell);}
     body.appendChild(row);
   }
   const updated=new Date(data.checked_at_utc);
   const updatedText=Number.isNaN(updated.getTime())?'日時不明':updated.toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'});
   el('uss-status').textContent=`${mode==='cached'?'保存済みの統計を表示（オフライン・更新失敗）':'USS公式資料を自動取得'} · 最終確認 ${updatedText} · ${months.length}か月分`;
   el('uss-data').hidden=false;
   document.dispatchEvent(new CustomEvent('mdmarket:uss-data',{detail:{data,mode}}));
 }
 async function load(){
   const status=el('uss-status'),button=el('uss-reload');button.disabled=true;
   status.textContent='公式月次データを確認しています…';
   try{
     const response=await MDOffline.read('./data/uss_monthly.json?refresh='+Date.now(),{cache:'no-store'});
     if(!response.ok)throw Error('公開データがまだ生成されていません（HTTP '+response.status+'）');
     const data=validate(await response.json());render(data,navigator.onLine===false?'cached':'fresh');
     try{localStorage.setItem(fallbackKey,JSON.stringify(data))}catch(_ignored){}
   }catch(error){
     let recovered=false;
     try{const cached=localStorage.getItem(fallbackKey);if(cached){render(validate(JSON.parse(cached)),'cached');recovered=true}}catch(_ignored){}
     if(!recovered){el('uss-data').hidden=true;status.textContent='USS月次統計はまだ利用できません。自動取得処理の実行結果を確認してください。';document.dispatchEvent(new Event('mdmarket:uss-unavailable'));}
     console.warn('USS public aggregate update:',error);
   }finally{button.disabled=false;}
 }
 el('uss-reload').addEventListener('click',load);
 load();
})();