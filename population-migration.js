/* MD MARKET | Prefectural new job offers x registered interprefectural migration.
   Two independent indicators. Never infer car sales or economic causation. */
'use strict';
(function(root){
  const JOB=root.MDPrefectureJobs;
  const PREF=JOB?JOB.PREF:'北海道 青森県 岩手県 宮城県 秋田県 山形県 福島県 茨城県 栃木県 群馬県 埼玉県 千葉県 東京都 神奈川県 新潟県 富山県 石川県 福井県 山梨県 長野県 岐阜県 静岡県 愛知県 三重県 滋賀県 京都府 大阪府 兵庫県 奈良県 和歌山県 鳥取県 島根県 岡山県 広島県 山口県 徳島県 香川県 愛媛県 高知県 福岡県 佐賀県 長崎県 熊本県 大分県 宮崎県 鹿児島県 沖縄県'.split(' ');
  const SOURCE='https://www.stat.go.jp/data/idou/sokuhou/tsuki/';
  const KEY='md-market-prefecture-migration-user-import-v1';
  const MONTH=/^20\d{2}-(0[1-9]|1[0-2])$/;
  const DATE=/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  const number=v=>Number.isSafeInteger(v)&&v>=0&&v<=10000000;
  function validate(raw,allowPending=false){
    if(!raw||raw.schema_version!==1||raw.dataset!=='interprefecture_migration_total'||
        raw.geography!=='prefecture'||raw.measure!=='monthly_in_out_domestic_moves'||
        raw.source_url!==SOURCE||raw.source_table!=='stat_go_jp_table_2'||
        !Array.isArray(raw.months)||raw.months.length>36)throw Error('人口移動データの形式・出典が不正です');
    if(raw.available===false&&allowPending&&raw.months.length===0)return raw;
    if(raw.available!==true||!DATE.test(raw.published_on||'')||raw.months.length===0)
      throw Error('公表日と月次人口移動の実数が必要です');
    if(!['stat_go_jp_xlsx_verified','user_import_unverified'].includes(raw.source_type))
      throw Error('出典区分が不正です');
    if(raw.source_type==='stat_go_jp_xlsx_verified'&&
       (!/^https:\/\/www\.stat\.go\.jp\/data\/idou\//.test(raw.source_file_url||'')||
        !/^[a-f0-9]{64}$/.test(raw.source_sha256||'')))
      throw Error('公式Excelの取得元とSHA256が不正です');
    let previous='';
    for(const m of raw.months){
      if(!m||!MONTH.test(m.month)||m.month<=previous||!m.values||
         Array.isArray(m.values)||Object.keys(m.values).length!==47)
        throw Error('人口移動の月・47都道府県が不完全です');
      previous=m.month;
      let inbound=0,outbound=0;
      for(const name of PREF){
        if(!Object.prototype.hasOwnProperty.call(m.values,name))throw Error('県別データ欠損：'+name);
        const v=m.values[name];
        if(!v||!number(v.in)||!number(v.out)||Object.keys(v).length!==2)
          throw Error('転入／転出は0以上の整数で必要です：'+name);
        inbound+=v.in;outbound+=v.out;
      }
      if(inbound!==outbound)throw Error('47都道府県の転入総数と転出総数が一致しません');
    }
    if(raw.published_on.slice(0,7)<previous)throw Error('公表日が観測月より前です');
    return raw;
  }
  function combined(jobs,migration,month,basis='mom'){
    const j=JOB?JOB.validate(jobs):jobs;
    const m=validate(migration);
    const current=j.months.find(x=>x.month===month);
    const prevNum=Number(month.slice(0,4))*12+Number(month.slice(5))-(basis==='yoy'?12:1);
    const base=j.months.find(x=>Number(x.month.slice(0,4))*12+Number(x.month.slice(5))===prevNum);
    const move=m.months.find(x=>x.month===month);
    if(!current||!base||!move)return {status:'unavailable',month,reason:!move?'同月の公式人口移動データがありません':'同月の求人数または比較月がありません',rows:[]};
    const rows=PREF.map(name=>{
      const cur=current.values[name],old=base.values[name],inbound=move.values[name].in,outbound=move.values[name].out;
      const jobPct=old===0?null:Math.round((cur-old)/old*1000)/10;
      const net=inbound-outbound;
      const signal=jobPct===null?'判定保留':jobPct>0&&net>0?'求人増・転入超過':jobPct>0&&net<0?'求人増・転出超過':jobPct<0&&net>0?'求人減・転入超過':jobPct<0&&net<0?'求人減・転出超過':'横ばいを含む';
      return {name,jobs:cur,jobPct,inbound,outbound,net,signal};
    });
    return {status:'ready',month,comparedTo:base.month,rows};
  }
  const API=Object.freeze({PREF,SOURCE,KEY,validate,combined});
  if(typeof module==='object'&&module.exports)module.exports=API;
  root.MDPopulationMigration=API;
  if(typeof document==='undefined')return;
  const $=id=>document.getElementById(id),panel=$('migration-jobs-panel');
  if(!panel)return;
  const pref=$('migration-pref'),month=$('migration-month'),basis=$('migration-basis'),
    status=$('migration-status'),detail=$('migration-detail'),rows=$('migration-rows'),
    cards=$('migration-cards'),source=$('migration-source'),mode=$('migration-mode');
  const fmt=v=>Number(v).toLocaleString('ja-JP');
  const signed=v=>(v>0?'+':'')+fmt(v);
  const el=(tag,value)=>{const e=document.createElement(tag);if(value!==undefined)e.textContent=value;return e;};
  let jobs=null,official=null,local=null;
  function loadLocal(){
    try{
      const v=localStorage.getItem(KEY);
      if(v){const data=JSON.parse(v);data.source_type='user_import_unverified';local=validate(data);}
    }catch(e){status.textContent='保存済み人口移動JSONは不正です。端末の元データは削除しません。';}
  }
  function available(){return mode.value==='user'?local:official;}
  function setCard(label,value,extra){
    const card=el('div');card.className='migration-kpi';
    const title=el('small',label),strong=el('strong',value),sub=el('small',extra||'');
    card.append(title,strong,sub);cards.append(card);
  }
  function redraw(){
    const ds=available();
    const selected=pref.value;
    rows.replaceChildren();cards.replaceChildren();
    if(!jobs||!jobs.available){
      status.textContent='公式求人データを取得できません。';detail.textContent='同月の比較ができるまで判定保留です。';return;
    }
    const jm=jobs.months.find(m=>m.month===month.value);
    if(!jm){detail.textContent='選択した月の求人データがありません。';return;}
    const baseN=Number(month.value.slice(0,4))*12+Number(month.value.slice(5))-(basis.value==='yoy'?12:1);
    const jb=jobs.months.find(m=>Number(m.month.slice(0,4))*12+Number(m.month.slice(5))===baseN);
    const jNow=jm.values[selected],jBase=jb&&jb.values[selected];
    const pct=jBase>0?Math.round((jNow-jBase)/jBase*1000)/10:null;
    setCard('新規求人数',fmt(jNow)+'人分',pct===null?'比較月不足':(pct>0?'+':'')+pct.toFixed(1)+'% '+(basis.value==='mom'?'前月比':'前年同月比'));
    const match=ds&&ds.available&&ds.months.find(m=>m.month===month.value);
    if(!match){
      setCard('転入者数','—','公式人口移動の未収録');
      setCard('転出者数','—','公式人口移動の未収録');
      setCard('転入－転出','—','不明を0人とは扱いません');
      detail.textContent=selected+'：人口移動の公表月次実数が未収録のため、求人と人口の関係は判定保留です。';
      source.textContent='総務省「住民基本台帳人口移動報告」都道府県間移動・全移動者。公式原本を確認しない値は表示しません。';
      status.textContent='求人データは表示中です。人口移動データはまだ検証済みの47都道府県実数がありません。';
      return;
    }
    const v=match.values[selected],net=v.in-v.out;
    setCard('他県から転入',fmt(v.in)+'人','国内の都道府県間移動');
    setCard('他県へ転出',fmt(v.out)+'人','国内の都道府県間移動');
    setCard('転入－転出',signed(net)+'人',net>0?'転入超過':net<0?'転出超過':'差引ゼロ');
    let combo;
    try{combo=combined(jobs,ds,month.value,basis.value);}
    catch(err){detail.textContent='データ検証に失敗しました：'+err.message;return;}
    if(combo.status!=='ready'){detail.textContent=combo.reason+'。不足値は補完しません。';return;}
    const selectedRow=combo.rows.find(x=>x.name===selected);
    detail.textContent=selected+'：'+selectedRow.signal+'。求人はハローワーク受理地別、人口は住民票に基づく国内他県間の移動です。中古車需要や採用の因果関係は示しません。';
    const ranked=combo.rows.slice().sort((a,b)=>b.net-a.net);
    for(const r of ranked){
      const li=el('li');li.className='migration-row';
      const n=el('span',r.name);
      const job=el('span',r.jobPct===null?'求人比較不可':(r.jobPct>0?'+':'')+r.jobPct.toFixed(1)+'%');
      job.dataset.change=r.jobPct>0?'up':r.jobPct<0?'down':'flat';
      const movement=el('strong',signed(r.net)+'人');movement.dataset.change=r.net>0?'up':r.net<0?'down':'flat';
      li.append(n,job,movement);rows.append(li);
    }
    source.textContent=(ds===local?'端末取込・未照合':'公式Excel原本検証済み')+'｜'+ds.published_on+'公表｜国内都道府県間の転入・転出｜求人は別統計（同じ対象月のみ結合）';
    status.textContent='47都道府県の求人と人口移動を同月で比較しています。';
  }
  function selectMonths(){
    const old=month.value;month.replaceChildren();
    if(jobs&&jobs.available){
      for(const m of jobs.months){const opt=el('option',m.month.replace('-','年')+'月');opt.value=m.month;month.append(opt);}
      month.value=jobs.months.some(m=>m.month===old)?old:jobs.months.at(-1).month;
    }
    redraw();
  }
  async function reload(){
    status.textContent='公表データの保存版を確認しています…';
    try{
      const responses=await Promise.all([
        MDOffline.read('./data/prefecture_jobs.json?refresh='+Date.now(),{cache:'no-store'}),
        MDOffline.read('./data/prefecture_migration.json?refresh='+Date.now(),{cache:'no-store'})
      ]);
      if(!responses[0].ok)throw Error('求人ファイルを取得できません');
      jobs=JOB.validate(await responses[0].json(),true);
      if(responses[1].ok){const x=validate(await responses[1].json(),true);official=x.available?x:null;}
      else official=null;
    }catch(e){console.warn('Migration/jobs:',e);status.textContent='公式統計の確認に失敗：'+e.message;}
    mode.querySelector('[value="official"]').disabled=!official;
    mode.querySelector('[value="user"]').disabled=!local;
    if(mode.value==='user'&&!local)mode.value='official';
    else if(mode.value==='official'&&!official&&local)mode.value='user';
    selectMonths();
  }
  for(const name of PREF){const o=el('option',name);o.value=name;pref.append(o);}
  pref.value='島根県';
  month.addEventListener('change',redraw);
  pref.addEventListener('change',redraw);
  basis.addEventListener('change',redraw);
  mode.addEventListener('change',redraw);
  $('migration-reload').addEventListener('click',reload);
  $('migration-import').addEventListener('change',async event=>{
    const file=event.target.files&&event.target.files[0];if(!file)return;
    try{
      if(file.size>1500000)throw Error('1.5MBを超えています');
      const obj=JSON.parse(await file.text());obj.source_type='user_import_unverified';
      const checked=validate(obj);
      localStorage.setItem(KEY,JSON.stringify(checked));
      local=checked;mode.value='user';mode.querySelector('[value="user"]').disabled=false;
      redraw();status.textContent='端末取込データ（原本未照合）を表示しています。';
    }catch(e){status.textContent='人口移動ファイル取込失敗：'+e.message;}
    event.target.value='';
  });
  $('migration-clear').addEventListener('click',()=>{
    try{localStorage.removeItem(KEY);local=null;mode.value='official';mode.querySelector('[value="user"]').disabled=true;redraw();}
    catch(e){status.textContent='取込データ解除に失敗：'+e.message;}
  });
  const linked=$('prefecture-jobs-pref');
  if(linked)linked.addEventListener('change',()=>{
    if(PREF.includes(linked.value)){pref.value=linked.value;redraw();}
  });
  loadLocal();reload();
})(typeof window==='undefined'?globalThis:window);
