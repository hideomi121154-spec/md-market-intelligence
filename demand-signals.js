/* MD MARKET v1.7 – hand-checked public rank snapshots + user-entered observation notebook.
   Ranks from different sites are NOT conversion, inquiry/access counts, or causal evidence. */
'use strict';
(function(root) {
  const SOURCES=Object.freeze({
    carsensor:{label:'カーセンサー',measure:'問い合わせを基にした順位',url:'https://www.carsensor.net/ranking/index.html'},
    goonet:{label:'グーネット',measure:'アクセス数を基にした順位',url:'https://www.goo-net.com/ranking/'}
  });
  const STORAGE_KEY='md-market-demand-entries-v1';
  const MAX_MANUAL=300;
  const validMonth=x=>/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(String(x||''));
  const normalize=s=>String(s||'').normalize('NFKC').trim().toUpperCase().replace(/[\s\u3000\u2010-\u2015\u2212\u30fc\-＿_]/g,'');
  const makerKey=x=>({'TOYOTA':'トヨタ','HONDA':'ホンダ','NISSAN':'日産','DAIHATSU':'ダイハツ','SUZUKI':'スズキ','MAZDA':'マツダ','SUBARU':'スバル'})[normalize(x)]||normalize(x);
  const key=x=>makerKey(x.make)+'|'+normalize(x.model);
  function validateRow(row){
    if(!row||typeof row.make!=='string'||typeof row.model!=='string'||!row.make.trim()||!row.model.trim()||row.make.length>55||row.model.length>75||!Number.isInteger(row.rank)||row.rank<1||row.rank>100)throw Error('順位・メーカー・車名の形式が正しくありません');
    return {rank:row.rank,make:row.make.trim(),model:row.model.trim()};
  }
  function validateSnapshot(s){
    if(!s||!SOURCES[s.platform]||!validMonth(s.month)||s.scope!=='national'||!Array.isArray(s.models)||s.models.length<1||s.models.length>100)throw Error('需要ランキングの形式が正しくありません');
    if(s.metric!==(s.platform==='carsensor'?'inquiry_ranking':'access_ranking'))throw Error('サイトとランキングの指標が一致しません');
    const allowedURL=SOURCES[s.platform].url;
    if(s.source_url!==allowedURL)throw Error('参照元URLを確認できません');
    const names=new Set(),ranks=new Set();
    const models=s.models.map(x=>{const m=validateRow(x),k=key(m);if(names.has(k)||ranks.has(m.rank))throw Error('同じ車名または順位が重複しています');names.add(k);ranks.add(m.rank);return m;});
    return {...s,models:models.sort((a,b)=>a.rank-b.rank)};
  }
  function validateData(data){
    if(!data||data.schema_version!==1||!Array.isArray(data.snapshots)||data.snapshots.length<1||data.snapshots.length>36)throw Error('登録された需要指標の形式が異なります');
    const pair=new Set();
    return data.snapshots.map(s=>{const value=validateSnapshot(s),k=value.month+':'+value.platform;if(pair.has(k))throw Error('同じ月・サイトの重複');pair.add(k);return value;});
  }
  function manualEntry(entry){
    if(!entry||!SOURCES[entry.platform]||!validMonth(entry.month))throw Error('月とデータ提供元を選択してください');
    return {platform:entry.platform,month:entry.month,...validateRow(entry)};
  }
  function compare(snapshots,month,local=[]){
    if(!validMonth(month)||!Array.isArray(snapshots)||!Array.isArray(local))throw Error('比較条件が不正です');
    const byPlatform={carsensor:new Map(),goonet:new Map()};
    for(const source of ['carsensor','goonet']){
      const base=snapshots.find(s=>s.month===month&&s.platform===source);
      for(const r of base?.models||[])byPlatform[source].set(key(r),{...r,local:false});
      for(const r of local){if(r.month===month&&r.platform===source){const v=manualEntry(r);byPlatform[source].set(key(v),{...v,local:true});}}
    }
    const union=new Map();
    for(const platform of ['carsensor','goonet'])for(const [k,row] of byPlatform[platform]){
      const item=union.get(k)||{key:k,make:row.make,model:row.model,carsensor:null,goonet:null};
      item[platform]={rank:row.rank,local:row.local};union.set(k,item);
    }
    return [...union.values()].sort((a,b)=>{
      const commonA=!!(a.carsensor&&a.goonet),commonB=!!(b.carsensor&&b.goonet);
      if(commonA!==commonB)return commonB-commonA;
      return Math.min(a.carsensor?.rank??101,a.goonet?.rank??101)-Math.min(b.carsensor?.rank??101,b.goonet?.rank??101);
    });
  }
  const API={SOURCES,STORAGE_KEY,MAX_MANUAL,validateData,validateSnapshot,manualEntry,compare,key};
  if(typeof module==='object'&&module.exports)module.exports=API;
  if(typeof document==='undefined')return;
  const $=id=>document.getElementById(id);
  const panel=$('demand-signals-panel');if(!panel)return;
  const list=$('demand-list'),status=$('demand-status'),monthSelect=$('demand-month'),manualStatus=$('demand-manual-status');
  let snapshots=[],locals=[],busy=false;
  const textNode=(parent,tag,content,className)=>{const el=document.createElement(tag);if(className)el.className=className;el.textContent=content;parent.appendChild(el);return el};
  const openLink=(url)=>{const link=document.createElement('a');link.href=url;link.textContent='公式ランキングを見る';link.target='_blank';link.rel='noopener noreferrer';return link};
  function loadLocal(){
    try{
      const array=JSON.parse(localStorage.getItem(STORAGE_KEY)||'[]');
      if(!Array.isArray(array)||array.length>MAX_MANUAL)throw Error('件数制限');
      return array.map(manualEntry);
    }catch(err){manualStatus.textContent='端末内の手入力履歴を読み取れません。元の履歴は削除していません。';return [];}
  }
  function saveLocal(){localStorage.setItem(STORAGE_KEY,JSON.stringify(locals));}
  function updateMonths(){
    const before=monthSelect.value;
    const months=[...new Set([...snapshots.map(s=>s.month),...locals.map(s=>s.month)])].sort().reverse();
    monthSelect.replaceChildren();
    for(const m of months){const option=document.createElement('option');option.value=m;option.textContent=m.replace('-','年')+'月';monthSelect.appendChild(option)}
    monthSelect.value=months.includes(before)?before:months[0]||'';
  }
  function render(){
    const m=monthSelect.value,items=compare(snapshots,m,locals),onlyBoth=$('demand-common-only').checked;
    list.replaceChildren();
    const visible=onlyBoth?items.filter(r=>r.carsensor&&r.goonet):items;
    $('demand-overlap').textContent=items.filter(r=>r.carsensor&&r.goonet).length.toLocaleString('ja-JP')+'車種';
    $('demand-covered').textContent=`${items.length}車種（確認済みの範囲＋端末入力）`;
    $('demand-period').textContent=m?m.replace('-','年')+'月・全国ランキング':'集計月未選択';
    for(const source of ['carsensor','goonet']){
      const slot=$('demand-source-'+source);slot.replaceChildren();
      const snap=snapshots.find(s=>s.month===m&&s.platform===source),count=locals.filter(x=>x.month===m&&x.platform===source).length;
      textNode(slot,'span',SOURCES[source].label+': '+(snap?`公式ページで確認した${snap.models.length}順位`:'初期記録なし')+(count?`、端末追記${count}件`:''),'demand-source-count');
      slot.appendChild(openLink(SOURCES[source].url));
    }
    for(const item of visible){
      const card=document.createElement('article');card.className='demand-row';
      textNode(card,'strong',item.make+' '+item.model,'demand-name');
      const ranks=document.createElement('div');ranks.className='demand-ranks';
      for(const [src,label] of [['carsensor','問い合わせ'],['goonet','閲覧']]){
        const cell=document.createElement('div');cell.className='demand-rank';
        textNode(cell,'small',label);
        textNode(cell,'b',item[src]?item[src].rank+'位':'未収録');
        if(item[src]?.local)textNode(cell,'small','端末の手入力');
        ranks.appendChild(cell);
      }
      card.appendChild(ranks);
      const meaning=(item.carsensor&&item.goonet)?'両サイトに掲載（単純な順位差から購入率は判断不可）':'片方の収録範囲でのみ確認（他方での圏外を意味しません）';
      textNode(card,'p',meaning,'demand-interpretation');
      const userRecords=locals.filter(r=>r.month===m&&API.key(r)===item.key);
      if(userRecords.length){
        const row=document.createElement('div');row.className='demand-remove-buttons';
        for(const rec of userRecords){const button=document.createElement('button');button.type='button';button.className='button ghost';button.textContent=SOURCES[rec.platform].label+'の手入力を削除';button.addEventListener('click',()=>{
          if(!confirm('この手入力の順位を削除しますか？公開ページの初期記録は消えません。'))return;
          locals=locals.filter(x=>!(x.month===rec.month&&x.platform===rec.platform&&API.key(x)===API.key(rec)));
          try{saveLocal();updateMonths();render();}catch(err){manualStatus.textContent='削除を保存できません：'+err.message}
        });row.appendChild(button)}card.appendChild(row);
      }
      list.appendChild(card);
    }
    if(!visible.length)textNode(list,'p','該当する車種がありません。両方のサイトで記録した順位を確認してください。','demand-interpretation');
    status.textContent='公開ページを照合して選んだ一部の順位と、この端末で追記した観測記録です。自動収集・購買転換率の計算はしていません。';
  }
  async function start(){
    if(busy)return;busy=true;
    status.textContent='保存済みランキングを確認しています…';
    try{
      const response=await fetch('./data/demand_rankings.json',{cache:'no-store'});
      if(!response.ok)throw Error('HTTP '+response.status);
      snapshots=validateData(await response.json());locals=loadLocal();updateMonths();render();
    }catch(err){
      status.textContent='初期ランキングを読み込めません。接続を確認して再読み込みしてください（'+err.message+'）。';
    }finally{busy=false}
  }
  $('demand-refresh').addEventListener('click',start);
  $('demand-common-only').addEventListener('change',render);
  monthSelect.addEventListener('change',render);
  $('demand-add').addEventListener('click',()=>{
    try{
      const input=manualEntry({month:$('demand-entry-month').value,platform:$('demand-entry-platform').value,rank:Number($('demand-entry-rank').value),make:$('demand-entry-make').value,model:$('demand-entry-model').value});
      if(locals.length>=MAX_MANUAL)throw Error('端末の記録は300件までです');
      const duplicate=locals.find(x=>x.month===input.month&&x.platform===input.platform&&x.rank===input.rank&&API.key(x)!==API.key(input));
      if(duplicate)throw Error('同じ月・同じサイトの順位がすでに他の車種に割り当てられています');
      locals=locals.filter(x=>!(x.month===input.month&&x.platform===input.platform&&(x.rank===input.rank||API.key(x)===API.key(input))));
      locals.push(input);saveLocal();updateMonths();monthSelect.value=input.month;render();
      manualStatus.textContent=`${input.month}の${SOURCES[input.platform].label} ${input.rank}位を、この端末に保存しました。原本の順位と比較してください。`;
    }catch(err){manualStatus.textContent='登録できません：'+err.message;}
  });
  $('demand-entry-month').value='2026-09';
  start();
})(typeof window==='undefined'?{}:window);