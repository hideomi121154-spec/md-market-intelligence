/* JADA official registered passenger NEW-car sales; separate from unverified used-car data. */
'use strict';
(() => {
  const $=id=>document.getElementById(id);
  const panel=$('registered-sales-panel');
  if(!panel) return;
  const grid=$('registered-sales-grid');
  const status=$('registered-sales-status');
  const period=$('registered-sales-period');
  const button=$('registered-sales-reload');
  const more=$('registered-sales-more');
  const link=$('registered-sales-source-link');
  const countFmt=n=>Number(n).toLocaleString('ja-JP');
  const clean=s=>String(s||'').normalize('NFKC').replace(/[\s\u3000]/g,'').replace(/[－ー‐−]/g,'-').toUpperCase();
  const url='./data/registered_sales.json';
  let loaded=null,expanded=false,busy=false,counts=new Map();
  const cacheKey='md-market-jada-passenger-ranking-v1';

  function validate(data) {
    if(!data || !/^20\d{2}-(0[1-9]|1[0-2])$/.test(data.month)||data.period_type!=='single_month'||
      !Array.isArray(data.models)||data.models.length!==50) throw Error('公式の月次データ形式を確認できません');
    for(let i=0;i<data.models.length;i++){
      const r=data.models[i];
      if(r.rank!==i+1 || typeof r.make!=='string' || !r.make || typeof r.model!=='string' || !r.model ||
        !Number.isInteger(r.units) || r.units<=0 || r.units>200000 ||
        !(r.yoy_pct==null || (typeof r.yoy_pct==='number'&&r.yoy_pct>0))) throw Error('公式のランキング値を確認できません');
      if(i>0 && data.models[i-1].units<r.units) throw Error('順位と台数に矛盾があります');
    }
  }
  async function localCounts(){
    counts=new Map();
    try{
      const rows=await MDStore.all();
      for(const x of rows){let k=clean(x.make)+'|'+clean(x.model);counts.set(k,(counts.get(k)||0)+1)}
    }catch(err){console.warn('Local vehicle tally failed',err)}
  }
  function makeCard(row){
    const article=document.createElement('article');article.className='model-sale-item';
    const rank=document.createElement('span');rank.className='model-sale-rank';rank.textContent=row.rank+'位';
    const title=document.createElement('div');title.className='model-sale-name';title.textContent=row.make+' '+row.model;
    const detail=document.createElement('div');detail.className='model-sale-details';
    const value=document.createElement('strong');value.textContent=countFmt(row.units)+'台';
    const yoy=document.createElement('small');yoy.textContent=row.yoy_pct==null?'前年比：未公表':'前年比 '+row.yoy_pct.toFixed(1)+'%';
    detail.append(value,yoy);
    const tally=document.createElement('p');tally.className='model-sale-sample';
    tally.textContent='iPhone内の未検証車両データ：'+(counts.get(clean(row.make)+'|'+clean(row.model))||0)+'件';
    const open=document.createElement('button');open.type='button';open.className='button secondary model-sale-open';
    open.textContent='登録済みの車両を見る';
    open.addEventListener('click',()=>{
      if($('make'))$('make').value=row.make;
      if($('model'))$('model').value=row.model;
      if($('quick-search'))$('quick-search').value='';
      $('search-button')?.click();
      location.hash='records';
    });
    article.append(rank,title,detail,tally,open);
    return article;
  }
  function renderCards(){
    if(!loaded)return;
    const display=expanded?loaded.models:loaded.models.slice(0,15);
    grid.replaceChildren(...display.map(makeCard));
    more.hidden=false;
    more.textContent=expanded?'上位15車種だけ表示':'全50車種を表示（残り35車種）';
    $('registered-sales-data').hidden=false;
  }
  async function display(data,stale){
    validate(data);
    loaded=data;
    await localCounts();
    period.textContent=data.month.replace('-','年')+'月 ・ 登録乗用車の新車販売台数 上位50車種';
    status.textContent=stale?'オフラインのため以前取得した統計です。':'自販連の公式月次ランキングです（中古車販売台数ではありません）。';
    if(link&&data.source_url&&new URL(data.source_url).hostname==='www.jada.or.jp')link.href=data.source_url;
    renderCards();
  }
  async function load(){
    if(busy)return;
    busy=true;button.disabled=true;status.textContent='自販連の公式月次ランキングを確認しています…';
    try{
      const res=await MDOffline.read(url+'?cb='+Date.now(),{cache:'no-store'});
      if(!res.ok)throw Error('HTTP '+res.status);
      const data=await res.json();
      await display(data,navigator.onLine===false);
      try{localStorage.setItem(cacheKey,JSON.stringify(data))}catch{}
    }catch(error){
      console.warn('JADA monthly stats:',error);
      try{
        const cached=localStorage.getItem(cacheKey);
        if(cached){await display(JSON.parse(cached),true);return}
      }catch{}
      status.textContent='登録乗用車の最新統計は準備中です。公式PDFの検証・保存が成功するとここに表示されます。';
    }finally{busy=false;button.disabled=false}
  }
  more.addEventListener('click',()=>{expanded=!expanded;renderCards()});
  button.addEventListener('click',load);
  load();
})();