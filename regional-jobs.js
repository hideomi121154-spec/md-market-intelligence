/* MD MARKET v3.0 | Published regional job-ad change, not hiring or vehicle demand.
   Public summary percentages only; no scraping of job boards. */
'use strict';
(function(root){
  const SOURCE='https://www.zenkyukyo.or.jp/outline/research/';
  const MACRO=['北海道・東北','関東・甲信越','中部・北陸','近畿','中四国','九州・沖縄'];
  const PREF='北海道 青森県 岩手県 宮城県 秋田県 山形県 福島県 茨城県 栃木県 群馬県 埼玉県 千葉県 東京都 神奈川県 新潟県 富山県 石川県 福井県 山梨県 長野県 岐阜県 静岡県 愛知県 三重県 滋賀県 京都府 大阪府 兵庫県 奈良県 和歌山県 鳥取県 島根県 岡山県 広島県 山口県 徳島県 香川県 愛媛県 高知県 福岡県 佐賀県 長崎県 熊本県 大分県 宮崎県 鹿児島県 沖縄県'.split(' ');
  const MONTH=/^20\d{2}-(0[1-9]|1[0-2])$/;
  const isNumber=v=>typeof v==='number'&&Number.isFinite(v)&&v>=-100&&v<=1000;
  function validate(data){
    if(!data||data.schema_version!==1||data.dataset!=='regional_job_ad_public_summary'||
       data.source_url!==SOURCE||!MONTH.test(data.month)||
       !/^\d{4}-\d{2}-\d{2}$/.test(data.published_on||'')||
       !['six_macroregions','prefectures'].includes(data.geography_level)||
       !Array.isArray(data.regions))throw Error('地域別求人広告データの形式が不正です');
    const names=data.geography_level==='six_macroregions'?MACRO:PREF;
    const seen=new Set();
    if(data.regions.length!==names.length)throw Error('地域数が不足しています');
    for(const row of data.regions){
      if(!row||!names.includes(row.name)||seen.has(row.name)||
         !isNumber(row.mom_pct)||!isNumber(row.yoy_pct))throw Error('地域名・増減率が不正です');
      seen.add(row.name);
    }
    if(seen.size!==names.length)throw Error('必要な地域を確認できません');
    return data;
  }
  function summarize(data,basis){
    const dataset=validate(data),key=basis==='yoy'?'yoy_pct':'mom_pct';
    const rows=dataset.regions.map(x=>({name:x.name,value:x[key]}))
      .sort((a,b)=>b.value-a.value||a.name.localeCompare(b.name,'ja'));
    return {
      rows,
      rising:rows.filter(r=>r.value>0).length,
      falling:rows.filter(r=>r.value<0).length,
      unchanged:rows.filter(r=>r.value===0).length,
      leader:rows[0],
      laggard:rows[rows.length-1]
    };
  }
  const API=Object.freeze({validate,summarize,MACRO,PREF});
  if(typeof module==='object'&&module.exports)module.exports=API;
  root.MDRegionalJobs=API;
  if(typeof document==='undefined')return;
  const $=id=>document.getElementById(id);
  if(!$('regional-jobs-panel'))return;
  const status=$('regional-jobs-status');
  const rows=$('regional-jobs-rows');
  const date=$('regional-jobs-period');
  const select=$('regional-jobs-basis');
  const inc=$('regional-jobs-rising'),dec=$('regional-jobs-falling'),note=$('regional-jobs-summary');
  let current=null;
  function signed(n){return (n>0?'+':'')+n.toFixed(1)+'%';}
  function repaint(){
    if(!current)return;
    const s=summarize(current,select.value);
    const max=Math.max(1,...s.rows.map(r=>Math.abs(r.value)));
    rows.replaceChildren();
    for(const r of s.rows){
      const li=document.createElement('li');
      li.className='regional-job-row';
      const name=document.createElement('span');name.className='regional-job-name';name.textContent=r.name;
      const chart=document.createElement('span');chart.className='regional-job-bar-area';
      const bar=document.createElement('span');bar.className='regional-job-bar';
      bar.dataset.direction=r.value>0?'up':r.value<0?'down':'flat';
      bar.style.width=Math.max(1,Math.abs(r.value)/max*100).toFixed(1)+'%';
      chart.append(bar);
      const val=document.createElement('strong');val.className='regional-job-change';
      val.dataset.direction=bar.dataset.direction;val.textContent=signed(r.value);
      li.append(name,chart,val);rows.append(li);
    }
    inc.textContent=s.rising+'地域';dec.textContent=s.falling+'地域';
    const label=select.value==='yoy'?'前年同月比':'前月比';
    note.textContent=label+'で最も増加した地域：'+s.leader.name+' '+signed(s.leader.value)+'。'
      +(s.falling===0?'この月の公表6地域では減少した地域はありません。':'減少した地域は'+s.falling+'地域です。')
      +' 求人広告の件数変化であり、採用人数や中古車販売の増減ではありません。';
  }
  async function load(){
    status.textContent='公表済みの地域別求人広告統計を確認しています…';
    $('regional-jobs-reload').disabled=true;
    try{
      const response=await MDOffline.read('./data/regional_job_ads.json?refresh='+Date.now(),{cache:'no-store'});
      if(!response.ok)throw Error('統計ファイルを取得できません');
      current=validate(await response.json());
      date.textContent=current.month.slice(0,4)+'年'+Number(current.month.slice(5))+'月分 · '+(current.geography_level==='six_macroregions'?'6地域':'47都道府県');
      status.textContent='出典：全国求人情報協会（'+current.published_on+'公表）'
        +(navigator.onLine===false?'／オフライン保存済み':'／公表情報の保存済みスナップショット')+'。自動取得ではありません。';
      repaint();
    }catch(err){
      current=null;rows.replaceChildren();inc.textContent='—';dec.textContent='—';
      note.textContent='未取得データを0件・増減なしとはみなしません。';
      status.textContent='地域別求人広告統計を読み込めません。オンライン接続または公開ファイルを確認してください。';
      console.warn('Regional job ads:',err);
    }finally{$('regional-jobs-reload').disabled=false;}
  }
  select.addEventListener('change',repaint);
  $('regional-jobs-reload').addEventListener('click',load);
  load();
})(typeof window==='undefined'?globalThis:window);
