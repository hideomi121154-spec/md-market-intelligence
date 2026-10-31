/* MD MARKET v3.1 | Hello Work 47-prefecture NEW JOB OFFERS, not job advertisements.
   Strict source/provenance and no fabricated data. */
'use strict';
(function(root){
  const PREF='北海道 青森県 岩手県 宮城県 秋田県 山形県 福島県 茨城県 栃木県 群馬県 埼玉県 千葉県 東京都 神奈川県 新潟県 富山県 石川県 福井県 山梨県 長野県 岐阜県 静岡県 愛知県 三重県 滋賀県 京都府 大阪府 兵庫県 奈良県 和歌山県 鳥取県 島根県 岡山県 広島県 山口県 徳島県 香川県 愛媛県 高知県 福岡県 佐賀県 長崎県 熊本県 大分県 宮崎県 鹿児島県 沖縄県'.split(' ');
  const SOURCE='https://www.e-stat.go.jp/stat-search/files?cycle=1&layout=dataset&page=1&toukei=00450222&tstat=000001020327';
  const KEY='md-market-prefecture-jobs-user-import-v1';
  const MONTH=/^20\d{2}-(0[1-9]|1[0-2])$/;
  const DATE=/^20\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
  const monthNum=m=>Number(m.slice(0,4))*12+Number(m.slice(5));
  function validate(raw,allowPending=false){
    if(!raw||raw.schema_version!==1||raw.dataset!=='hello_work_prefecture_new_offers'||
       raw.geography!=='accepted_at_prefecture'||raw.measure!=='monthly_new_job_offers_original_count'||
       raw.source_table!=='long_term_table_12'||raw.source_url!==SOURCE||
       !Array.isArray(raw.months)||raw.months.length>36)throw Error('都道府県別統計の形式・出典が不正です');
    if(raw.available===false && allowPending && raw.months.length===0)return raw;
    if(raw.available!==true||!DATE.test(raw.published_on||'')||raw.months.length<1)
      throw Error('原典の公表日と月次実績が必要です');
    if(!['e_stat_file_verified','user_import_unverified'].includes(raw.source_type))throw Error('出典区分が不正です');
    if(raw.source_type==='e_stat_file_verified' && !/^https:\/\/www\.e-stat\.go\.jp\/stat-search\/files\?/.test(raw.source_url))
      throw Error('e-Stat出典が不正です');
    let last='';
    for(const m of raw.months){
      if(!m||!MONTH.test(m.month)||m.month<=last||
         !m.values||Array.isArray(m.values)||typeof m.values!=='object'||
         Object.keys(m.values).length!==PREF.length)throw Error('月または47都道府県の収録が不足しています');
      last=m.month;
      for(const p of PREF){
        if(!Object.prototype.hasOwnProperty.call(m.values,p)||
           !Number.isSafeInteger(m.values[p])||m.values[p]<0||m.values[p]>2000000)throw Error('不正な求人数：'+p);
      }
    }
    if(raw.published_on.slice(0,7)<last)throw Error('公表日が対象月より前です');
    return raw;
  }
  function compare(data,month,basis='yoy'){
    validate(data);
    const now=data.months.find(x=>x.month===month);
    if(!now)return {status:'unavailable',reason:'選択月がありません',rows:[]};
    const previous=monthNum(month)-(basis==='mom'?1:12);
    const ref=data.months.find(x=>monthNum(x.month)===previous);
    if(!ref)return {status:'unavailable',reason:(basis==='mom'?'前月':'前年同月')+'の47都道府県データがありません',rows:[],month};
    const rows=PREF.map(name=>{
      const current=now.values[name],base=ref.values[name];
      const difference=current-base,changePct=base===0?null:Math.round(difference/base*1000)/10;
      return {name,current,base,difference,changePct};
    });
    rows.sort((a,b)=>a.changePct===null?1:b.changePct===null?-1:b.changePct-a.changePct||a.name.localeCompare(b.name,'ja'));
    return {status:'ready',month,comparedTo:ref.month,rows,
      rising:rows.filter(x=>x.difference>0).length,falling:rows.filter(x=>x.difference<0).length,
      flat:rows.filter(x=>x.difference===0).length};
  }
  const API=Object.freeze({PREF,SOURCE,KEY,validate,compare});
  if(typeof module==='object'&&module.exports)module.exports=API;
  root.MDPrefectureJobs=API;
  if(typeof document==='undefined')return;
  const $=id=>document.getElementById(id),panel=$('prefecture-jobs-panel');
  if(!panel)return;
  let official=null,local=null,current=null;
  const monthSelect=$('prefecture-jobs-month'),basis=$('prefecture-jobs-basis'),pref=$('prefecture-jobs-pref');
  const rows=$('prefecture-jobs-rows'),status=$('prefecture-jobs-status'),source=$('prefecture-jobs-source');
  const detail=$('prefecture-jobs-selected'),counts=$('prefecture-jobs-counts');
  const fmt=n=>Number(n).toLocaleString('ja-JP');
  const signed=n=>(n>0?'+':'')+n.toFixed(1)+'%';
  const monthLabel=m=>m.slice(0,4)+'年'+Number(m.slice(5))+'月';
  function node(tag,text,className){
    const el=document.createElement(tag);
    if(text!==undefined)el.textContent=text;
    if(className)el.className=className;
    return el;
  }
  function loadLocal(){
    try{
      const saved=localStorage.getItem(KEY);
      if(!saved)return;
      const x=JSON.parse(saved);
      x.source_type='user_import_unverified'; // Never promote user-supplied JSON to verified.
      local=validate(x);
    }catch(e){
      status.textContent='端末内の取込データが不正です。自動削除は行いません。原本を確認してください。';
    }
  }
  function render(){
    current=local||official;
    rows.replaceChildren();monthSelect.replaceChildren();
    if(!current||current.available!==true){
      monthSelect.disabled=true;basis.disabled=true;pref.disabled=true;
      counts.textContent='47都道府県｜数値は未取得';
      detail.textContent='公表済みの原数値を取り込むまで増減率を表示しません。';
      source.textContent='e-Stat表12は2026年9月分まで公開されていますが、アプリ内の47都道府県データは未検証・未収録です。';
      return;
    }
    monthSelect.disabled=false;basis.disabled=false;pref.disabled=false;
    const old=monthSelect.value;
    for(const m of current.months){const option=node('option',monthLabel(m.month));option.value=m.month;monthSelect.append(option);}
    monthSelect.value=current.months.some(m=>m.month===old)?old:current.months[current.months.length-1].month;
    draw();
  }
  function draw(){
    if(!current||current.available!==true)return;
    const result=compare(current,monthSelect.value,basis.value);
    const context=local?'ユーザー取込・原本未照合':'公式ファイル検証済み';
    source.textContent=context+' · '+monthLabel(monthSelect.value)+' · 公表日 '+current.published_on+
      ' · 統計定義：ハローワーク受理地別の新規求人数（原数値）。';
    rows.replaceChildren();
    if(result.status!=='ready'){
      counts.textContent='比較データ不足';detail.textContent=result.reason+'。数値を0として補完しません。';
      const m=current.months.find(x=>x.month===monthSelect.value);
      if(m)detail.textContent+=' '+pref.value+'：'+fmt(m.values[pref.value])+'人分（新規求人数）。';
      return;
    }
    counts.textContent='増加 '+result.rising+'県 ／ 減少 '+result.falling+'県 ／ 横ばい '+result.flat+'県';
    const selected=result.rows.find(r=>r.name===pref.value);
    detail.textContent=selected.name+'：'+fmt(selected.current)+'人分（'+monthLabel(result.month)+'）、'
      +monthLabel(result.comparedTo)+'の'+fmt(selected.base)+'人分に対し '
      +(selected.changePct===null?'基準月0のため増減率算出不可':signed(selected.changePct))
      +'。実際の就職人数・就業地別募集人数ではありません。';
    const max=Math.max(1,...result.rows.map(r=>Math.abs(r.changePct===null?0:r.changePct)));
    for(const r of result.rows){
      const item=node('li',undefined,'prefecture-job-row');
      const name=node('span',r.name);
      const barArea=node('span',undefined,'prefecture-job-bar-area');
      const bar=node('span',undefined,'prefecture-job-bar');
      bar.dataset.direction=r.difference>0?'up':r.difference<0?'down':'flat';
      bar.style.width=Math.max(1,Math.abs(r.changePct===null?0:r.changePct)/max*100)+'%';
      barArea.append(bar);
      const value=node('strong',r.changePct===null?'比較不可':signed(r.changePct));
      value.dataset.direction=bar.dataset.direction;
      const amount=node('small',fmt(r.current)+'人分');
      item.append(name,barArea,value,amount);rows.append(item);
    }
  }
  async function loadOfficial(){
    try{
      const res=await MDOffline.read('./data/prefecture_jobs.json?refresh='+Date.now(),{cache:'no-store'});
      if(!res.ok)throw Error('未取得');
      const parsed=validate(await res.json(),true);
      official=parsed.available?parsed:null;
    }catch(e){official=null;console.warn('Prefecture e-Stat:',e);}
    render();
  }
  for(const name of PREF){const option=node('option',name);option.value=name;pref.append(option);}
  pref.value='愛知県';
  monthSelect.addEventListener('change',draw);
  basis.addEventListener('change',draw);
  pref.addEventListener('change',draw);
  $('prefecture-jobs-reload').addEventListener('click',loadOfficial);
  $('prefecture-jobs-file').addEventListener('change',async(event)=>{
    const file=event.target.files&&event.target.files[0];
    if(!file)return;
    try{
      if(file.size>800000)throw Error('800KBまでのJSONにしてください');
      const raw=JSON.parse(await file.text());
      raw.source_type='user_import_unverified';
      const checked=validate(raw);
      local=checked;
      localStorage.setItem(KEY,JSON.stringify(checked));
      render();status.textContent='47都道府県データを端末内だけに保存しました。原典の数字と一致するかは未検証です。';
    }catch(e){status.textContent='取込失敗：'+e.message+'。既存データは変更していません。';}
    event.target.value='';
  });
  $('prefecture-jobs-reset').addEventListener('click',()=>{
    try{localStorage.removeItem(KEY);local=null;render();status.textContent='端末内に追加した求人統計だけを解除しました。';}
    catch(e){status.textContent='端末データの解除に失敗しました：'+e.message;}
  });
  loadLocal();loadOfficial();
})(typeof window==='undefined'?globalThis:window);
