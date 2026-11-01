/* MD MARKET v3.4 — five-year sales trend. Actual reported NEW-car counts only.
   Never interpolate missing top-N values or treat missing rankings as zero. */
'use strict';
(function(root){
 const NS='http://www.w3.org/2000/svg';
 const validCount=n=>Number.isSafeInteger(n)&&n>=0;
 function toSeries(points){
   if(!Array.isArray(points)||points.length!==5)throw Error('5年間の年次統計が必要です');
   const years=points.map(p=>p&&p.year);
   if(years.join(',')!=='2021,2022,2023,2024,2025')throw Error('対象年が不一致です');
   return points.map(p=>({year:p.year,value:validCount(p.row?.units)?p.row.units:null}));
 }
 function splitSegments(series){
   const segments=[];let current=[];
   for(const p of series){
     if(p.value===null){
       if(current.length)segments.push(current);
       current=[];
     }else current.push(p);
   }
   if(current.length)segments.push(current);
   return segments;
 }
 function scaleMax(series){
   const vals=series.flat().map(p=>p.value).filter(validCount);
   return Math.max(1,...vals)*1.1;
 }
 const api=Object.freeze({toSeries,splitSegments,scaleMax});
 if(typeof module==='object'&&module.exports)module.exports=api;
 root.MDSalesTrend=api;
 if(typeof document==='undefined')return;
 const svgEl=(tag,attrs={},value)=>{
   const n=document.createElementNS(NS,tag);
   for(const [k,v] of Object.entries(attrs))n.setAttribute(k,String(v));
   if(value!==undefined)n.textContent=String(value);
   return n;
 };
 function render(container,primaryPoints,secondaryPoints,primaryLabel,secondaryLabel){
   const primary=toSeries(primaryPoints);
   const secondary=secondaryPoints?toSeries(secondaryPoints):null;
   const available=[primary,...(secondary?[secondary]:[])];
   const max=scaleMax(available);
   const w=640,h=228,left=62,right=16,top=22,bottom=48,innerW=w-left-right,innerH=h-top-bottom;
   const x=p=>left+(p.year-2021)*innerW/4;
   const y=p=>top+(1-p.value/max)*innerH;
   container.replaceChildren();
   const legend=document.createElement('div');
   legend.className='history-trend-legend';
   for(const [label,clazz] of [[primaryLabel,'primary'],...(secondary?[[secondaryLabel,'secondary']]:[])]){
     const item=document.createElement('span');item.className='history-trend-legend-item';
     const sample=document.createElement('i');sample.className='history-trend-legend-dot '+clazz;sample.setAttribute('aria-hidden','true');
     item.append(sample,document.createTextNode(label));legend.append(item);
   }
   container.append(legend);
   const svg=svgEl('svg',{viewBox:'0 0 '+w+' '+h,role:'img','aria-label':'2021〜2025年の車種別新車販売台数。未掲載の年は線をつなげません。',class:'history-trend-svg'});
   svg.append(svgEl('title',{},'過去5年間の新車販売推移'));
   const lineColor='#344e6e',textColor='#b9cbe2';
   for(const f of [0,.5,1]){
     const v=max*f,py=top+(1-f)*innerH;
     svg.append(svgEl('line',{x1:left,y1:py,x2:w-right,y2:py,stroke:lineColor,'stroke-width':1}));
     svg.append(svgEl('text',{x:left-9,y:py+4,'text-anchor':'end',fill:textColor,'font-size':12},(v/10000).toLocaleString('ja-JP',{maximumFractionDigits:1})+'万'));
   }
   for(let year=2021;year<=2025;year++){
     svg.append(svgEl('text',{x:left+(year-2021)*innerW/4,y:h-15,'text-anchor':'middle',fill:textColor,'font-size':13},String(year)));
   }
   const colors=['#49d5c2','#84aaff'];
   available.forEach((data,index)=>{
     const color=colors[index],label=index===0?primaryLabel:secondaryLabel;
     for(const segment of splitSegments(data)){
       if(segment.length>1){
         svg.append(svgEl('polyline',{points:segment.map(p=>x(p).toFixed(2)+','+y(p).toFixed(2)).join(' '),stroke:color,'stroke-width':3,fill:'none','stroke-linecap':'round','stroke-linejoin':'round'}));
       }
       for(const p of segment){
         const circle=svgEl('circle',{cx:x(p),cy:y(p),r:5,fill:color,stroke:'#0d1b2e','stroke-width':2});
         circle.append(svgEl('title',{},label+'：'+p.year+'年 '+p.value.toLocaleString('ja-JP')+'台'));
         svg.append(circle);
       }
     }
   });
   container.append(svg);
   const note=document.createElement('p');
   note.className='history-trend-note';
   note.textContent='各点はその年の公表ランキングに掲載された台数です。未掲載の年は欠測として線を途切れさせます。下の棒グラフで年ごとの数値と出典を確認できます。';
   container.append(note);
 }
 root.MDSalesTrendView=Object.freeze({render});
})(typeof window==='undefined'?globalThis:window);
