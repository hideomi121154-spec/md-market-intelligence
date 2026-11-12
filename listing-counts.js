/* MD MARKET: manually verified listing counts for the ranked makes/models.
   Never fetch, scrape or crawl Carsensor or Goo-net from this app.
   Records are local iPhone observations, not transactions or monthly sales. */
'use strict';
(function(root){
  const STORAGE_KEY='md-market-ranked-listing-counts-v1';
  const MAX_RECORDS=600;
  const PLATFORMS=Object.freeze({
    carsensor:{name:'カーセンサー',host:'www.carsensor.net',home:'https://www.carsensor.net/usedcar/'},
    goonet:{name:'グーネット',host:'www.goo-net.com',home:'https://www.goo-net.com/usedcar/'}
  });
  // Exact vehicle search URLs have been individually checked. Other vehicles start at official search.
  const canon=x=>String(x||'').normalize('NFKC').trim().toUpperCase()
    .replace(/[\s\u3000\u2010-\u2015\u2212\u30fc\-_]/g,'');
  const carKey=x=>canon(x.make)+'|'+canon(x.model);
  const VERIFIED_LINKS=Object.freeze(Object.fromEntries(Object.entries({
    'carsensor|ホンダ|NBOX':'https://www.carsensor.net/usedcar/bHO/s094/index.html',
    'carsensor|日産|セレナ':'https://www.carsensor.net/usedcar/bNI/s012/index.html',
    'carsensor|トヨタ|プリウス':'https://www.carsensor.net/usedcar/bTO/s122/index.html',
    'carsensor|トヨタ|アルファード':'https://www.carsensor.net/usedcar/bTO/s009/index.html',
    'carsensor|ダイハツ|タント':'https://www.carsensor.net/usedcar/bDA/s006/index.html',
    'carsensor|スズキ|スペーシア':'https://www.carsensor.net/usedcar/bSZ/s049/index.html',
    'carsensor|スズキ|ハスラー':'https://www.carsensor.net/usedcar/bSZ/s050/index.html',
    'carsensor|トヨタ|ヴォクシー':'https://www.carsensor.net/usedcar/bTO/s021/index.html',
    'carsensor|ホンダ|フリード':'https://www.carsensor.net/usedcar/bHO/s083/index.html',
    'carsensor|トヨタ|ハイエースバン':'https://www.carsensor.net/usedcar/bTO/s185/index.html',
    'goonet|トヨタ|プリウス':'https://www.goo-net.com/usedcar/brand-TOYOTA/car-PRIUS/',
    'goonet|トヨタ|アルファード':'https://www.goo-net.com/usedcar/brand-TOYOTA/car-ALPHARD/',
    'goonet|ダイハツ|タント':'https://www.goo-net.com/usedcar/brand-DAIHATSU/car-TANTO/',
    'goonet|トヨタ|ハイエースバン':'https://www.goo-net.com/usedcar/brand-TOYOTA/car-HIACE_VAN/',
    'goonet|トヨタ|ヴォクシー':'https://www.goo-net.com/usedcar/brand-TOYOTA/car-VOXY/',
    'goonet|スズキ|ジムニー':'https://www.goo-net.com/usedcar/brand-SUZUKI/car-JIMNY/',
    'goonet|ホンダ|NBOXカスタム':'https://www.goo-net.com/usedcar/brand-HONDA/car-N-BOX_CUSTOM/',
    'goonet|日産|セレナ':'https://www.goo-net.com/usedcar/brand-NISSAN/car-SERENA/',
    'goonet|MINI|MINI':'https://www.goo-net.com/usedcar/brand-MINI/car-MINI/'
  }).map(([raw,url])=>{
    const [platform,make,model]=raw.split('|');
    return [platform+'|'+carKey({make,model}),url];
  })));
  const recKey=x=>x.platform+'|'+carKey(x)+'|'+x.date+'|'+x.source_url;
  const today=()=>{const d=new Date(),p=n=>String(n).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());};
  function validDate(value){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
    const d=new Date(value+'T12:00:00Z');
    return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10)===value && value<=today();
  }
  function officialUrl(platform,url){
    try{
      const u=new URL(url);
      return u.protocol==='https:' && u.hostname===PLATFORMS[platform]?.host &&
        !u.username && !u.password && u.pathname.startsWith('/usedcar/');
    }catch{return false;}
  }
  function verifiedLink(platform,make,model){
    return VERIFIED_LINKS[platform+'|'+carKey({make,model})]||null;
  }
  function validateObservation(x){
    if(!x||!PLATFORMS[x.platform]||typeof x.make!=='string'||typeof x.model!=='string'||
       !x.make.trim()||!x.model.trim()||x.make.length>55||x.model.length>75)throw Error('メーカー・車種を確認してください');
    if(!validDate(x.date))throw Error('観測日が正しくありません（未来日不可）');
    if(!Number.isSafeInteger(x.count)||x.count<0||x.count>1000000)throw Error('掲載台数は0〜100万台の整数を入力してください');
    if(!officialUrl(x.platform,x.source_url))throw Error('該当サイトの公式中古車検索URLを入力してください');
    return {platform:x.platform,make:x.make.trim(),model:x.model.trim(),date:x.date,count:x.count,
      source_url:x.source_url,scope:'national',kind:'listing_result_count'};
  }
  function validateRows(rows){
    if(!Array.isArray(rows)||rows.length>MAX_RECORDS)throw Error('記録数上限（600件）または保存形式を確認してください');
    const out=rows.map(validateObservation),seen=new Set();
    for(const x of out){const k=recKey(x);if(seen.has(k))throw Error('観測日の重複があります');seen.add(k);}
    return out;
  }
  function mergeRows(oldRows,newRows){
    const map=new Map(validateRows(oldRows).map(x=>[recKey(x),x]));
    for(const x of validateRows(newRows))map.set(recKey(x),x);
    if(map.size>MAX_RECORDS)throw Error('記録上限600件です。バックアップして整理してください');
    return [...map.values()].sort((a,b)=>a.date.localeCompare(b.date));
  }
  function listingStats(records,platform,make,model){
    const group=validateRows(records).filter(x=>x.platform===platform&&carKey(x)===carKey({make,model}))
      .sort((a,b)=>a.date.localeCompare(b.date));
    const latest=group.at(-1)||null;
    const previous=latest?[...group].reverse().find(x=>x.date<latest.date && x.source_url===latest.source_url):null;
    return {latest,previous,delta:previous?latest.count-previous.count:null,
      pct:previous&&previous.count>0?(latest.count-previous.count)*100/previous.count:null,
      hasDifferentCondition:!!latest && group.some(x=>x.source_url!==latest.source_url)};
  }
  const API={STORAGE_KEY,MAX_RECORDS,PLATFORMS,verifiedLink,officialUrl,validateObservation,
    validateRows,mergeRows,listingStats,carKey};
  if(typeof module==='object'&&module.exports)module.exports=API;
  root.MDRankedListings=API;
  if(typeof document==='undefined')return;
  const $=id=>document.getElementById(id),panel=$('demand-signals-panel');
  if(!panel)return;
  const status=$('listing-count-status'),backup=$('listing-count-backup');
  let records=[],healthy=true;
  const node=(tag,cls,message)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(message!==undefined)el.textContent=message;return el;};
  const format=n=>n.toLocaleString('ja-JP');
  function load(){
    try{records=validateRows(JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]'));}
    catch(err){healthy=false;status.textContent='保存済み掲載数の形式に問題があります。元データは上書きしません：'+err.message;}
  }
  function save(next){
    if(!healthy)throw Error('保存領域に問題があります。バックアップを確認してください');
    const value=validateRows(next);
    localStorage.setItem(STORAGE_KEY,JSON.stringify(value));
    records=value;
  }
  function buildRow(row){
    if(row.querySelector('.listing-count-tools'))return;
    const platform=row.dataset.platform,make=row.dataset.make,model=row.dataset.model;
    if(!PLATFORMS[platform]||!make||!model)return;
    const tools=node('div','listing-count-tools');
    const display=node('div','listing-count-display');
    const actions=node('div','listing-count-actions');
    const link=node('a','listing-count-link','公式検索');
    const suggested=verifiedLink(platform,make,model);
    link.href=suggested||PLATFORMS[platform].home;
    link.target='_blank';link.rel='noopener noreferrer';
    const button=node('button','button ghost listing-count-edit','台数を記録');
    button.type='button';actions.append(link,button);
    const form=node('form','listing-count-form');
    form.hidden=true;
    const description=node('p','listing-count-help','全国・車種全体の検索結果を確認し、表示された台数とその検索URLを入力してください。年式・地域・グレードを絞った数字は混ぜないでください。');
    const countLabel=node('label',null,'掲載台数');
    const count=node('input');count.type='number';count.inputMode='numeric';count.min='0';count.max='1000000';count.step='1';count.required=true;count.placeholder='例：12000';
    countLabel.append(count);
    const dateLabel=node('label',null,'確認日');
    const date=node('input');date.type='date';date.value=today();date.max=today();date.required=true;
    dateLabel.append(date);
    const sourceLabel=node('label',null,'公式検索URL（車種別・全国）');
    const source=node('input');source.type='url';source.required=true;source.placeholder='https://www.../usedcar/...';source.autocapitalize='off';source.autocomplete='off';
    if(suggested)source.value=suggested;
    sourceLabel.append(source);
    const submit=node('button','button secondary listing-count-save','この台数を保存');
    submit.type='submit';
    const feedback=node('p','listing-count-feedback');
    form.append(description,countLabel,dateLabel,sourceLabel,submit,feedback);
    const paint=()=>{
      const s=listingStats(records,platform,make,model);
      if(!s.latest){display.textContent='掲載台数：未記録';return;}
      const diff=s.delta===null?'':(' ／ 前回比 '+(s.delta>0?'+':'')+format(s.delta)+'台'+
        (s.pct===null?'':(' ('+(s.pct>0?'+':'')+s.pct.toFixed(1)+'%)')));
      const age=Math.floor((Date.parse(today()+'T12:00:00Z')-Date.parse(s.latest.date+'T12:00:00Z'))/86400000);
      display.textContent='掲載 '+format(s.latest.count)+'台（'+s.latest.date+'）'+diff+(age>30?' ※30日超':'');
      display.title='観測日に公式検索結果で目視した件数。自動取得・成約数ではありません。'+
        (s.hasDifferentCondition?'検索URLの異なる観測は増減比較から除外。':'');
      link.href=s.latest.source_url;
      source.value=s.latest.source_url;
    };
    button.addEventListener('click',()=>{
      form.hidden=!form.hidden;
      if(!form.hidden){date.value=today();feedback.textContent='';count.focus();}
    });
    form.addEventListener('submit',event=>{
      event.preventDefault();
      try{
        if(count.value.trim()==='')throw Error('掲載台数を入力してください');
        const item=validateObservation({platform,make,model,date:date.value,count:Number(count.value),source_url:source.value.trim()});
        save(mergeRows(records,[item]));
        form.hidden=true;feedback.textContent='';paint();
        status.textContent=PLATFORMS[platform].name+' '+make+' '+model+' の掲載 '+format(item.count)+'台を端末内に保存しました。';
      }catch(err){feedback.textContent='保存できません：'+err.message;}
    });
    tools.append(display,actions,form);
    row.append(tools);
    paint();
  }
  function attach(){
    for(const name of ['carsensor','goonet']){
      const board=$('demand-top10-'+name);
      if(!board)continue;
      for(const row of board.querySelectorAll('.demand-top10-row'))buildRow(row);
    }
  }
  $('listing-count-export').addEventListener('click',()=>{
    try{
      // Preserve exact original bytes if a previous version cannot be parsed.
      backup.value=healthy?JSON.stringify({schema_version:1,kind:'ranked_listing_observations',records},null,2):
        localStorage.getItem(STORAGE_KEY)||'';
      status.textContent=records.length+'件の掲載数観測を表示しました。コピーして別途保存してください。';
    }catch(err){status.textContent='書き出せません：'+err.message;}
  });
  $('listing-count-restore').addEventListener('click',()=>{
    try{
      const input=JSON.parse(backup.value);
      if(!input||input.schema_version!==1||input.kind!=='ranked_listing_observations')
        throw Error('この掲載数ノートのバックアップではありません');
      const incoming=validateRows(input.records);
      const before=records.length;
      const merged=mergeRows(incoming,records); // Existing data wins for the same date, URL and source.
      save(merged);
      attach();
      for(const row of panel.querySelectorAll('.listing-count-tools'))row.remove();
      attach();
      status.textContent='掲載数のバックアップから'+(records.length-before)+'件を追加復元しました。';
    }catch(err){status.textContent='復元できません：'+err.message;}
  });
  load();attach();
  root.addEventListener('md-demand-rendered',attach);
})(typeof window==='undefined'?{}:window);
