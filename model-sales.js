/* Official NEW-car nameplate registrations — separate from local used vehicle data. */
'use strict';
(() => {
  const el=id=>document.getElementById(id);
  const fmt=x=>Number(x).toLocaleString('ja-JP');
  const name=x=>String(x || '').normalize('NFKC').toUpperCase().replace(/\s+/g,'').replace(/[ー－‐−]/g,'-');
  const original=()=>`./data/model_sales.json?cb=${Date.now()}`;
  const modelGrid=el('model-sales-grid');
  const status=el('model-sales-status');
  const panel=el('model-sales-panel');
  const freshness=el('model-sales-period');
  const reload=el('model-sales-reload');
  if(!panel || !modelGrid || !reload)return;
  let loading=false;
  async function render(data,stale){
    if(!/^20\d\d-(0[1-9]|1[0-2])$/.test(data.month)||!Array.isArray(data.models)||data.models.length<12||data.models.length>15||
       data.models.some(x=>!x.make||!x.model||!Number.isInteger(x.units)||x.units<1))throw Error('車種別の統計形式を検証できません');
    modelGrid.replaceChildren();
    freshness.textContent=`${data.month.replace('-','年')}月 ・ 軽乗用車の新車販売台数 上位${data.models.length}車種`;
    status.textContent=stale?'通信できないため、以前に読み込んだ統計を表示しています。':'全軽自協が公開した新車販売台数です（中古車の成約件数・売れ行きではありません）。';
    let local=[];
    try {local=await MDStore.all()}catch(e){console.warn('Local price data read:',e)}
    const counter=new Map();
    for(const r of local){const k=name(r.model);counter.set(k,(counter.get(k)||0)+1)}
    data.models.forEach((row,i)=>{
      const article=document.createElement('article');article.className='model-sale-item';
      const rank=document.createElement('span');rank.className='model-sale-rank';rank.textContent=`${i+1}位`;
      const title=document.createElement('div');title.className='model-sale-name';title.textContent=`${row.make} ${row.model}`;
      const details=document.createElement('div');details.className='model-sale-details';
      const qty=document.createElement('strong');qty.textContent=`${fmt(row.units)}台`;
      const yoy=document.createElement('small');yoy.textContent=row.yoy_pct==null?'前年比：未公表':`前年比 ${row.yoy_pct.toFixed(1)}%`;
      details.append(qty,yoy);
      const sample=document.createElement('p');sample.className='model-sale-sample';sample.textContent=`iPhone内の未検証車両データ：${counter.get(name(row.model))||0}件`;
      article.append(rank,title,details,sample);
      const open=document.createElement('button');open.type='button';open.className='button secondary model-sale-open';open.textContent='登録済みの車両を見る';
      open.addEventListener('click',()=>{
        const f=el('model');if(f)f.value=row.model;
        const m=el('make');if(m)m.value=row.make;
        const s=el('quick-search');if(s)s.value='';
        const search=el('search-button');if(search)search.click();
        window.location.hash='records';
      });
      article.appendChild(open);
      modelGrid.appendChild(article);
    });
    el('model-sales-data').hidden=false;
  }
  async function load(){
    if(loading)return;loading=true;reload.disabled=true;
    status.textContent='公式公開データを確認しています…';
    try {
      const resp=await MDOffline.read(original(),{cache:'no-store'});
      if(!resp.ok)throw Error('HTTP '+resp.status);
      const data=await resp.json();
      await render(data,navigator.onLine===false);
      try{localStorage.setItem('md-market-newcar-stats-v1',JSON.stringify(data))}catch{}
    } catch(err){
      console.warn('Model sales source unavailable:',err);
      try { const cache=localStorage.getItem('md-market-newcar-stats-v1');if(cache){await render(JSON.parse(cache),true);return} }catch{}
      status.textContent='車種別新車統計はまだ取得できていません。GitHub Actionsが更新するまで数値は表示しません。';
    } finally{loading=false;reload.disabled=false}
  }
  reload.addEventListener('click',load);
  load();
})();