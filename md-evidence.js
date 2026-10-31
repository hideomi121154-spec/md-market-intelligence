/* MD MARKET: read-only MD evidence desk. Indicators are not transaction recommendations. */
'use strict';
(function(root){
 const INV_KEY='md-market-inventory-snapshots-v1';
 const norm=x=>String(x||'').normalize('NFKC').trim().toUpperCase().replace(/[\s\u3000\u2010-\u2015\u2212\u30fc\-_＿]/g,'');
 const maker=x=>({'TOYOTA':'トヨタ','HONDA':'ホンダ','NISSAN':'日産','SUZUKI':'スズキ','DAIHATSU':'ダイハツ','MAZDA':'マツダ','SUBARU':'スバル'})[norm(x)]||norm(x);
 const identity=r=>maker(r.make)+'|'+norm(r.model);
 const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''))&&!Number.isNaN(Date.parse(s+'T12:00:00Z'));
 const days=(a,b)=>Math.round((Date.parse(a+'T12:00:00Z')-Date.parse(b+'T12:00:00Z'))/86400000);
 const labelSource=s=>s==='carsensor'?'カーセンサー（問い合わせ順位）':'グーネット（アクセス順位）';
 function evidenceForSeries(observations,records,reviews,ranking,seriesKey,asOf){
  const clean=MDInventory.validateRows(observations);
  if(!validDate(asOf))throw Error('基準日が不正です');
  const allSeries=clean.filter(x=>MDInventory.seriesKey(x)===seriesKey&&x.date<=asOf).sort((a,b)=>a.date.localeCompare(b.date));
  const current=allSeries.at(-1)||null,prior=allSeries.length>1?allSeries.at(-2):null;
  if(!current)return {available:false,title:'観測記録がありません',issues:['同じ検索条件の掲載台数をまず1回記録してください']};
  const age=days(asOf,current.date);
  const interval=prior?days(current.date,prior.date):null;
  const delta=prior?current.count-prior.count:null;
  const percent=prior&&prior.count>0?100*delta/prior.count:null;
  const disrupted=!!(prior&&root.MDWatch?.outageOverlap(prior.date,current.date,current.source_url));
  const supply={current:current.count,previous:prior?.count??null,delta:disrupted?null:delta,percent:disrupted?null:percent,age,interval,disrupted,
   ready:!!prior&&age>=0&&age<=30&&interval>=1&&interval<=45&&!disrupted};
  let demand=[];
  if(ranking&&Array.isArray(ranking.snapshots)){
   const months=[...new Set(ranking.snapshots.map(x=>x.month).filter(x=>/^\d{4}-(0[1-9]|1[0-2])$/.test(x)&&x<=current.date.slice(0,7)))].sort().reverse();
   for(const month of months){
    const monthEnd=month+'-'+new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0).getDate();
    const lag=days(asOf,monthEnd);
    if(lag<0||lag>65)continue;
    for(const s of ranking.snapshots){
     if(s.month!==month||s.scope!=='national'||!['carsensor','goonet'].includes(s.platform)||!Array.isArray(s.models))continue;
     const item=s.models.find(r=>identity(r)===identity(current));
     if(item&&Number.isInteger(item.rank)&&item.rank>=1&&item.rank<=10)
      demand.push({platform:s.platform,rank:item.rank,month:s.month,source:s.source_url});
    }
    // Do not substitute a different month for a missing source or count missing top-10 as rank 11.
    break;
   }
  }
  const aud=new Map((Array.isArray(reviews)?reviews:[]).map(x=>[x.id,x]));
  const exactSpecs=!!(current.grade&&current.color);
  const matching=exactSpecs && Array.isArray(records)?records.filter(r=>
   r.market_type==='retail_listing'&&r.channel==='retail'&&r.date<=asOf&&days(asOf,r.date)<=180&&
   aud.get(r.id)?.status==='user_checked'&&identity(r)===identity(current)&&
   norm(r.region)===norm(current.region)&&norm(r.grade)===norm(current.grade)&&
   norm(r.color)===norm(current.color)
  ):[];
  const evidenceUrls=new Set(matching.map(r=>r.source_url).filter(Boolean));
  const prices={checkedCount:matching.length,uniqueSourceUrls:evidenceUrls.size,ready:exactSpecs&&matching.length>=5&&evidenceUrls.size>=5,
   limitation:!exactSpecs?'掲載条件にグレードと色を明示してください':'価格が照合済みでも年式・走行距離・車両状態・価格定義を個別に揃える必要があります'};
  const issues=[];
  if(!prior)issues.push('掲載台数を同じ条件でもう1回記録する');
  else if(disrupted)issues.push('カーセンサーのサービス停止期間（2026年10月17〜22日）をまたぐ掲載台数の比較は保留。更新反映状況を確認する');
  else if(!supply.ready)issues.push(age>30?'掲載台数が30日超前のため再観測する':'観測間隔を確認して台数を再測定する');
  if(demand.length===0)issues.push('同一車種の需要根拠を追加確認する（順位未収録は不人気の証拠ではない）');
  if(!prices.ready)issues.push('同一仕様の照合済み掲載価格と販売見込価格を集める');
  issues.push('実売・AA成約価格と売約率、競合店舗、陸送・整備費を別途確認する');
  return {available:true,vehicle:current.make+' '+current.model,region:current.region,
   grade:current.grade,color:current.color,conditions:current.conditions,sourceUrl:current.source_url,
   latestDate:current.date,observations:allSeries.length,supply,demand,prices,issues,
   verdict:'仕入れ判断は保留',reason:'掲載数・全国順位・自己照合済み小売掲載価格だけでは入札上限や販売速度を推定できません。'};
 }
 const API={INV_KEY,evidenceForSeries,identity};
 if(typeof module==='object'&&module.exports)module.exports=API;
 if(typeof document==='undefined')return;
 const $=id=>document.getElementById(id),panel=$('md-evidence-panel');
 if(!panel)return;
 const picker=$('md-evidence-series'),status=$('md-evidence-status');
 let rankCache=null,rankError='',valid=true,selected='';
 function node(tag,content,cls){
  const el=document.createElement(tag);if(cls)el.className=cls;if(content!==undefined)el.textContent=content;return el;
 }
 function set(id,value){$(id).textContent=value;}
 function empty(message){set('md-evidence-verdict','検証待ち');set('md-evidence-supply','—');set('md-evidence-demand','—');set('md-evidence-price','—');$('md-evidence-tasks').replaceChildren(node('li',message));}
 function getObservations(){
  let data;try{data=JSON.parse(localStorage.getItem(INV_KEY)||'[]');return MDInventory.validateRows(data)}
  catch(err){valid=false;throw Error('保存済み観測情報を読めません。既存データは変更せず、バックアップを確認してください：'+err.message);}
 }
 function today(){const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');}
 async function refresh(){
  if(!valid)return;
  try{
   const obs=getObservations(),groups=new Map();
   for(const x of obs){const k=MDInventory.seriesKey(x);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(x);}
   const previously=selected||picker.value;
   picker.replaceChildren();
   for(const [key,entries] of groups){
    const item=entries.at(-1);const opt=node('option',item.make+' '+item.model+' / '+item.region+' / '+item.grade+' '+item.color+' / '+entries.length+'回');
    opt.value=key;picker.append(opt);
   }
   picker.disabled=groups.size===0;
   if(groups.has(previously))picker.value=previously;
   selected=picker.value;
   if(!groups.size){empty('まだ観測記録がありません。上の在庫観測ノートで掲載台数を記録してください。');status.textContent='読み取り専用。車両データと在庫観測データは変更していません。';return}
   const [records,reviews]=await Promise.all([MDStore.all(),MDStore.getReviews()]);
   const result=evidenceForSeries(obs,records,reviews,rankCache,selected,today());
   if(!result.available){empty('観測記録がありません。');return}
   set('md-evidence-verdict',result.verdict);
   set('md-evidence-supply',result.supply.disrupted?'カーセンサー停止期間をまたぐため比較保留（最新 '+result.supply.current.toLocaleString('ja-JP')+'台）':result.supply.previous===null
      ?'最新 '+result.supply.current.toLocaleString('ja-JP')+'台（比較データなし）'
      :'最新 '+result.supply.current.toLocaleString('ja-JP')+'台 / '+(result.supply.delta>=0?'+':'')+result.supply.delta.toLocaleString('ja-JP')+'台'+
       (result.supply.percent===null?'（前回0台・率は計算不可）':'（'+(result.supply.percent>=0?'+':'')+result.supply.percent.toFixed(1)+'%）'));
   set('md-evidence-demand',result.demand.length?result.demand.map(x=>labelSource(x.platform)+' '+x.rank+'位（'+x.month+'・全国）').join(' / '):'該当車種の収録順位なし（圏外・不人気とは判定不可）');
   set('md-evidence-price',result.prices.checkedCount+'件（自己照合済みの小売掲載情報・同一地域/色/グレード）');
   const tasks=$('md-evidence-tasks');tasks.replaceChildren();
   for(const issue of result.issues)tasks.append(node('li',issue));
   set('md-evidence-scope',result.vehicle+' / '+result.region+' / '+(result.grade||'グレード未指定')+' / '+(result.color||'色未指定')+' ／ 最新観測 '+result.latestDate);
   $('md-evidence-source').href=result.sourceUrl;
   $('md-evidence-source').hidden=false;
   status.textContent='需要順位は全国の一部車種だけを収録。価格は利用者による原本照合記録で、成約・独立検証ではありません。'+
     (rankError?' 需要順位を読み込めません：'+rankError:'');
  }catch(err){empty('データが読めません。削除や再登録をせず、バックアップを確認してください。');status.textContent=err.message;console.warn('MD evidence desk',err);}
 }
 async function loadRanking(){
  try{
   const response=await MDOffline.read('./data/demand_rankings.json',{cache:'no-store'});
   if(!response.ok)throw Error('HTTP '+response.status);
   const r=await response.json();
   if(r.schema_version!==1||!Array.isArray(r.snapshots))throw Error('需要順位の保存形式が異なります');
   rankCache=r;rankError='';
  }catch(err){rankError=err.message;}
 }
 picker.addEventListener('change',()=>{selected=picker.value;refresh();});
 $('md-evidence-jump')?.addEventListener('click',()=>panel.scrollIntoView({behavior:'smooth',block:'start'}));
 $('md-evidence-refresh').addEventListener('click',async()=>{await loadRanking();await refresh()});
 window.addEventListener('md-inventory-updated',refresh);
 // Wait for the browser to settle; data stays local and is only read.
 (async()=>{await loadRanking();await refresh()})();
})(typeof window==='undefined'?{}:window);
