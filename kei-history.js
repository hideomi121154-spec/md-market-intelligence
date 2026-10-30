/* v1.8: Historical annual NEW kei passenger registrations, NOT used-car supply. */
'use strict';
(function(root){
  const normalize=x=>String(x||'').normalize('NFKC').trim().toUpperCase().replace(/[\s\u3000\u2010-\u2015\u2212\u30fc\-_]/g,'');
  const canonicalMaker=x=>({'HONDA':'ホンダ','NISSAN':'日産','SUZUKI':'スズキ','DAIHATSU':'ダイハツ','SUBARU':'スバル'})[normalize(x)]||normalize(x);
  const key=r=>canonicalMaker(r.make)+'|'+normalize(r.model);
  function validate(data){
    if(data?.schema_version!==1||!Array.isArray(data.years)||data.years.length!==5)throw Error('年別統計の件数が正しくありません');
    const years=data.years.map(v=>v.year);
    if(years.join(',')!=='2021,2022,2023,2024,2025')throw Error('2021〜2025年の年間データが揃っていません');
    for(const year of data.years){
      if(!Array.isArray(year.models)||year.models.length!==15||
        typeof year.source_url!=='string'||!/^https:\/\/www\.zenkeijikyo\.or\.jp\/statistics\/tushokaku-\d+$/.test(year.source_url))throw Error('年間の出典または15車種に不整合があります');
      const names=new Set();
      for(let i=0;i<year.models.length;i++){
        const row=year.models[i];
        if(!row||row.rank!==i+1||!row.make||!row.model||!Number.isSafeInteger(row.units)||row.units<100||row.units>500000||
          (i>0&&year.models[i-1].units<row.units)||names.has(key(row)))throw Error('車種の順位または販売台数に不整合があります');
        names.add(key(row));
      }
    }
    return data.years;
  }
  function findVehicle(years,target){
    return years.map(y=>({year:y.year,source_url:y.source_url,row:y.models.find(m=>key(m)===key(target))||null}));
  }
  function listModels(years){
    const map=new Map();
    for(const y of [...years].reverse())for(const m of y.models){
      if(!map.has(key(m)))map.set(key(m),{make:m.make,model:m.model,lookup:key(m)});
    }
    return [...map.values()].sort((a,b)=>a.make.localeCompare(b.make,'ja')||a.model.localeCompare(b.model,'ja'));
  }
  const API={key,validate,findVehicle,listModels};
  if(typeof module==='object'&&module.exports)module.exports=API;
  if(typeof document==='undefined')return;
  const $=id=>document.getElementById(id),fmt=n=>n.toLocaleString('ja-JP')+'台';
  const panel=$('kei-history-panel');if(!panel)return;
  const status=$('kei-history-status'),select=$('kei-history-model'),compare=$('kei-history-compare'),chart=$('kei-history-chart');
  let years=[],loading=false;
  function option(text,value){const el=document.createElement('option');el.value=value;el.textContent=text;return el}
  function el(tag,cl,content){const n=document.createElement(tag);if(cl)n.className=cl;if(content!==undefined)n.textContent=content;return n}
  function sourceLink(year){const a=document.createElement('a');a.href=year.source_url;a.target='_blank';a.rel='noopener noreferrer';a.textContent=String(year.year)+'年の公式統計';return a}
  function render(){
    if(!years.length)return;
    const models=listModels(years),primary=models.find(m=>m.lookup===select.value),secondary=models.find(m=>m.lookup===compare.value);
    if(!primary)return;
    const points=findVehicle(years,primary),secondaryPts=secondary&&secondary.lookup!==primary.lookup?findVehicle(years,secondary):null;
    chart.replaceChildren();
    const header=el('div','kei-history-legend');
    header.append(el('strong',null,primary.make+' '+primary.model));
    if(secondaryPts)header.append(el('span',null,'比較：'+secondary.make+' '+secondary.model));
    chart.appendChild(header);
    const max=Math.max(1,...points.map(p=>p.row?.units||0),...(secondaryPts||[]).map(p=>p.row?.units||0));
    for(let i=0;i<points.length;i++){
      const p=points[i],sec=secondaryPts?.[i];
      const item=el('div','kei-history-year');
      item.append(el('div','kei-history-year-label',p.year+'年'));
      const bars=el('div','kei-history-bars');
      const addBar=(v,clazz,name)=>{
        const line=el('div','kei-history-bar-line');
        const rail=el('div','kei-history-rail');
        if(v){const fill=el('div','kei-history-fill '+clazz);fill.style.width=Math.max(2,v.units/max*100)+'%';rail.appendChild(fill)}
        const label=el('div','kei-history-count',v?fmt(v.units):'—（上位15外・不明）');
        label.title=name;
        line.append(rail,label);bars.appendChild(line);
      };
      addBar(p.row,'kei-history-fill-primary',primary.model);
      if(secondaryPts)addBar(sec.row,'kei-history-fill-secondary',secondary.model);
      item.appendChild(bars);
      chart.appendChild(item);
    }
    const cohort=points.filter(p=>p.year>=2021&&p.year<=2023);
    const complete=cohort.every(p=>p.row!==null);
    $('kei-history-early-sum').textContent=complete?fmt(cohort.reduce((a,p)=>a+p.row.units,0)):'—';
    $('kei-history-early-caption').textContent=complete?'2021〜2023年の新車販売合計（3年分・車名合算）':'2021〜2023年のいずれかが上位15外。合計不可';
    const recent=points.at(-1);
    $('kei-history-latest').textContent=recent.row?fmt(recent.row.units):'上位15外';
    $('kei-history-latest-caption').textContent=recent.year+'年の新車販売（トップ15収録のみ）';
    const sources=$('kei-history-sources');sources.replaceChildren();
    years.forEach((y,i)=>{if(i)sources.append(el('span',null,' ・ '));sources.appendChild(sourceLink(y))});
    status.textContent='公式発表の軽乗用車・年間新車販売ランキングを表示しています。これは現在の中古車市場への供給台数ではありません。';
  }
  async function start(){
    if(loading)return;loading=true;
    status.textContent='年別の新車販売統計を読み込み中…';
    try{
      const r=await MDOffline.read('./data/kei_annual_history.json',{cache:'no-store'});
      if(!r.ok)throw Error('HTTP '+r.status);
      years=validate(await r.json());
      const models=listModels(years),oldPrimary=select.value,oldSecond=compare.value;
      select.replaceChildren();compare.replaceChildren();
      compare.append(option('比較なし',''));
      for(const m of models){const text=m.make+' '+m.model;select.append(option(text,m.lookup));compare.append(option(text,m.lookup))}
      const days=models.find(m=>m.make==='日産'&&normalize(m.model)===normalize('デイズ'));
      const nbox=models.find(m=>m.make==='ホンダ'&&normalize(m.model)===normalize('N-BOX'));
      select.value=models.some(m=>m.lookup===oldPrimary)?oldPrimary:(days?.lookup||models[0].lookup);
      compare.value=models.some(m=>m.lookup===oldSecond)?oldSecond:(nbox?.lookup||'');
      render();
    }catch(err){status.textContent='年別統計を取得できません。公式ファイルの生成・配信状況を確認してください：'+err.message}
    finally{loading=false}
  }
  select.addEventListener('change',render);
  compare.addEventListener('change',render);
  $('kei-history-refresh').addEventListener('click',start);
  start();
})(typeof window==='undefined'?{}:window);