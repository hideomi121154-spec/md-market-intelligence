/* MD MARKET v3.1 — independent, local-only residual/auction gap notebook. */
(function(root){
  'use strict';
  const KEY='md-market-residual-auction-gap-v1';
  const MAX=200;
  function numberOf(value){
    if(value===null||value===undefined||String(value).trim()==='')return NaN;
    const n=Number(value);
    return Number.isFinite(n)?n:NaN;
  }
  function evaluate(input){
    const residual=numberOf(input&&input.residual);
    const auction=numberOf(input&&input.auction);
    const expenses=numberOf(input&&input.expenses);
    const rTax=input&&input.residualTax;
    const aTax=input&&input.auctionTax;
    if(!(residual>0&&residual<=100000))return {valid:false,reason:'契約満了時の保証残価を正の数値で入力してください。'};
    if(!(auction>0&&auction<=100000))return {valid:false,reason:'比較可能な業者間AA価格を入力してください。'};
    if(!(expenses>=0&&expenses<=100000))return {valid:false,reason:'控除額を0以上で入力してください。'};
    if(expenses>auction)return {valid:false,reason:'控除額がAA価格を超えています。条件を見直してください。'};
    if(!['tax_in','tax_out'].includes(rTax)||!['tax_in','tax_out'].includes(aTax))
      return {valid:false,reason:'残価とAA価格の税込・税抜区分をそれぞれ選んでください。'};
    if(rTax!==aTax)return {valid:false,reason:'残価とAA相場で税込・税抜が異なります。同条件に換算してから比較してください。'};
    const trade=auction-expenses;
    const gap=trade-residual;
    return {
      valid:true, residual,auction,expenses,trade,
      gap, gapPct:gap/residual*100,
      rawGapPct:(auction-residual)/residual*100,
      auctionBreakEven:residual+expenses,
      signal:gap<0?'return_advantage':gap>0?'trade_advantage':'even'
    };
  }
  function safeText(s,max){
    return String(s==null?'':s).trim().slice(0,max||120);
  }
  function urlSafe(url){
    if(!url)return true;
    try{const u=new URL(url);return u.protocol==='https:'&&!!u.hostname;}catch(e){return false;}
  }
  function normalize(item){
    if(!item||typeof item!=='object'||Array.isArray(item))throw Error('記録形式が不正です。');
    const x={
      id:safeText(item.id,90),make:safeText(item.make,80),model:safeText(item.model,80),
      grade:safeText(item.grade,100),modelYear:safeText(item.modelYear,8),
      residual:numberOf(item.residual),auction:numberOf(item.auction),expenses:numberOf(item.expenses),
      residualTax:safeText(item.residualTax,20),auctionTax:safeText(item.auctionTax,20),
      sourceType:safeText(item.sourceType,20),sourceUrl:safeText(item.sourceUrl,500),
      observedAt:safeText(item.observedAt,10),note:safeText(item.note,500),
      createdAt:safeText(item.createdAt,35)
    };
    if(!x.id||!x.make||!x.model)throw Error('メーカー・車種・記録IDが必要です。');
    if(!['scenario','checked'].includes(x.sourceType))throw Error('根拠区分が不正です。');
    if(!urlSafe(x.sourceUrl))throw Error('出典はhttpsのURLのみ使用できます。');
    if(x.sourceType==='checked'&&(!x.sourceUrl||!x.observedAt))throw Error('自己照合にはhttps出典URLと確認日が必要です。');
    if(x.observedAt&&!/^\d{4}-\d{2}-\d{2}$/.test(x.observedAt))throw Error('日付形式が不正です。');
    const calculated=evaluate(x);
    if(!calculated.valid)throw Error(calculated.reason);
    return x;
  }
  const api={evaluate,normalize,storageKey:KEY};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  root.MDResidualGap=api;
  if(typeof document==='undefined')return;
  const byId=id=>document.getElementById(id);
  const panel=byId('rr-panel');
  if(!panel)return;
  const fields=['make','model','grade','modelYear','residual','auction','expenses','residualTax','auctionTax','sourceType','sourceUrl','observedAt','note'];
  const field=id=>byId('rr-'+id);
  const val=id=>field(id).value;
  const output=byId('rr-out'),status=byId('rr-status'),history=byId('rr-history');
  function yen(x){return Number(x).toLocaleString('ja-JP',{maximumFractionDigits:1})+'万円';}
  function percentage(x){return (x>0?'+':'')+x.toFixed(2)+'%';}
  function current(){
    const r={};fields.forEach(k=>r[k]=val(k));
    return r;
  }
  function read(){
    try{
      const raw=root.localStorage.getItem(KEY);
      if(!raw)return [];
      const data=JSON.parse(raw);
      if(!Array.isArray(data)||data.length>MAX)throw Error('保存件数か形式が不正です。');
      return data.map(normalize);
    }catch(e){status.textContent='保存データの読み込みに失敗しました：'+e.message+'。既存データは削除しません。';return null;}
  }
  function persist(items){
    root.localStorage.setItem(KEY,JSON.stringify(items));
  }
  function display(){
    const data=current(),r=evaluate(data);
    output.replaceChildren();
    if(!r.valid){output.textContent=r.reason;output.className='rr-result rr-missing';return r;}
    output.className='rr-result '+(r.signal==='return_advantage'?'rr-down':r.signal==='trade_advantage'?'rr-up':'rr-even');
    const headline=document.createElement('strong');
    headline.textContent=r.signal==='return_advantage'?'返却が経済的に有利になりやすい':r.signal==='trade_advantage'?'売却・下取りが有利になりやすい':'金銭面ではほぼ同条件';
    const details=document.createElement('div');
    details.className='rr-result-grid';
    [
      ['推定下取り額（AA−控除）',yen(r.trade)],
      ['下取り額−保証残価',(r.gap>0?'+':'')+yen(r.gap)],
      ['残価乖離率',percentage(r.gapPct)],
      ['損益分岐AA価格',yen(r.auctionBreakEven)]
    ].forEach(([name,value])=>{
      const span=document.createElement('span'),small=document.createElement('small'),b=document.createElement('b');
      small.textContent=name;b.textContent=value;span.append(small,b);details.append(span);
    });
    const caution=document.createElement('p');
    caution.textContent='契約満了・車両返却条件を満たす場合の経済比較です。実際の返却率や仕入れ推奨ではありません。';
    output.append(headline,details,caution);
    return r;
  }
  function drawHistory(){
    history.replaceChildren();
    const entries=read();
    if(entries===null)return;
    if(!entries.length){history.textContent='保存した比較はまだありません。';return;}
    entries.slice().reverse().forEach(x=>{
      const calc=evaluate(x),row=document.createElement('div');
      row.className='rr-record';
      const title=document.createElement('strong');
      title.textContent=x.make+' '+x.model+(x.grade?' / '+x.grade:'')+(x.modelYear?' / '+x.modelYear+'年式':'');
      const info=document.createElement('p');
      info.textContent='乖離率 '+percentage(calc.gapPct)+'　/　差額 '+yen(calc.gap)+'　/　'+(x.sourceType==='checked'?'出典自己照合':'仮定入力')+(x.observedAt?'　'+x.observedAt:'');
      row.append(title,info);
      if(x.sourceUrl){
        const a=document.createElement('a');a.href=x.sourceUrl;a.textContent='記録した出典';a.target='_blank';a.rel='noopener noreferrer';row.append(a);
      }
      const controls=document.createElement('div');controls.className='rr-record-actions';
      const load=document.createElement('button');load.type='button';load.textContent='入力欄に呼び出す';load.className='button secondary';
      load.addEventListener('click',()=>{fields.forEach(k=>{field(k).value=x[k]==null?'':x[k];});display();panel.scrollIntoView({behavior:'smooth',block:'start'});});
      const del=document.createElement('button');del.type='button';del.textContent='削除';del.className='button secondary';
      del.addEventListener('click',()=>{
        if(!root.confirm('この分析メモ1件を削除しますか？'))return;
        try{const latest=read();if(latest===null)return;persist(latest.filter(y=>y.id!==x.id));status.textContent='分析メモを削除しました。';drawHistory();}
        catch(e){status.textContent='削除に失敗しました：'+e.message;}
      });
      controls.append(load,del);row.append(controls);history.append(row);
    });
  }
  fields.forEach(k=>field(k).addEventListener('input',display));
  byId('rr-example').addEventListener('click',()=>{
    const demo={make:'架空メーカー',model:'架空車種（例）',grade:'架空グレード',
      modelYear:'2022',residual:'150',auction:'160',expenses:'15',
      residualTax:'tax_in',auctionTax:'tax_in',sourceType:'scenario',
      sourceUrl:'',observedAt:'',note:'数字はすべて架空の計算例'};
    fields.forEach(k=>{field(k).value=demo[k]||'';});
    status.textContent='架空の数字を読み込みました。実際の相場ではありません。';display();
  });
  byId('rr-save').addEventListener('click',()=>{
    try{
      const r=current(),test=evaluate(r);if(!test.valid)throw Error(test.reason);
      if(!r.make.trim()||!r.model.trim())throw Error('保存にはメーカーと車種が必要です。');
      if(r.sourceType==='checked'&&(!r.sourceUrl||!r.observedAt))throw Error('自己照合には原典URLと確認日が必要です。');
      const saved=read();if(saved===null)return;
      if(saved.length>=MAX)throw Error('保存上限200件です。バックアップ後に不要な記録を整理してください。');
      const entry=normalize({...r,id:'rr-'+Date.now()+'-'+Math.random().toString(36).slice(2,9),createdAt:new Date().toISOString()});
      persist(saved.concat(entry));
      status.textContent='この端末だけに分析メモを保存しました（実証済み返却率ではありません）。';
      drawHistory();
    }catch(e){status.textContent='保存できません：'+e.message;}
  });
  byId('rr-export').addEventListener('click',()=>{
    const entries=read();if(entries===null)return;
    field('backup').value=JSON.stringify({schema_version:1,kind:'mdmarket_residual_gap',entries},null,2);
    status.textContent='下のバックアップJSONをコピーして安全に保管してください（個人情報・メモを含む可能性があります）。';
  });
  byId('rr-import').addEventListener('click',()=>{
    try{
      const backup=JSON.parse(val('backup'));
      if(!backup||backup.kind!=='mdmarket_residual_gap'||backup.schema_version!==1||!Array.isArray(backup.entries)||backup.entries.length>MAX)
        throw Error('対応する残価分析バックアップではありません。');
      const inbound=backup.entries.map(normalize);
      const old=read();if(old===null)return;
      const known=new Set(old.map(x=>x.id));
      const fresh=inbound.filter(x=>!known.has(x.id));
      if(old.length+fresh.length>MAX)throw Error('保存上限200件を超えます。');
      if(!root.confirm('新しい'+fresh.length+'件を追加復元しますか？既存記録は上書きしません。'))return;
      persist(old.concat(fresh));status.textContent='新規'+fresh.length+'件を追加復元しました。既存の分析メモは保持しました。';drawHistory();
    }catch(e){status.textContent='復元できません：'+e.message;}
  });
  display();drawHistory();
})(typeof window!=='undefined'?window:globalThis);
