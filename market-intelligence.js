/* Five-stage intelligence cockpit: live public files; no user-data mutation. */
(function(root){
'use strict';
const api=root.MDMarketIntelligence,$=id=>document.getElementById(id);
const panel=$('mi-panel');
if(!panel||!api)return;
const warning=root.MDMarketWarning||null;
const datasets={uss:null,kei:null,registered:null,jobs:null,migration:null};
const status=$('mi-status'),sources=$('mi-sources');
const names={uss:'USS月次市場統計',kei:'軽乗用車の年次新車販売',registered:'登録乗用車の年次新車販売',
 jobs:'都道府県別新規求人数',migration:'国内他県間人口移動'};
const paths={uss:'uss_monthly.json',kei:'kei_annual_history.json',registered:'registered_annual_history.json',
 jobs:'prefecture_jobs.json',migration:'prefecture_migration.json'};
const errors={};
let loading=false,lastLoaded=0,selectedHypothesis=0,stage='radar';
const comma=n=>Number(n).toLocaleString('ja-JP');
const signed=n=>(n>0?'+':'')+Number(n).toFixed(1);
function element(tag,clazz,txt){
 const x=document.createElement(tag);
 if(clazz)x.className=clazz;
 if(txt!==undefined)x.textContent=String(txt);
 return x;
}
function add(parent,tag,clazz,text){const x=element(tag,clazz,text);parent.append(x);return x;}
function option(value,title){const o=element('option',null,title);o.value=String(value);return o;}
function textLine(parent,label,value){
 const row=add(parent,'div','mi-metric');
 add(row,'small',null,label);add(row,'strong',null,value);return row;
}
function setOptions(id,values,preferred){
 const target=$(id),old=target.value;target.replaceChildren();
 for(const [value,label] of values)target.append(option(value,label));
 const valid=values.some(x=>String(x[0])===old);
 target.value=valid?old:preferred!==undefined?String(preferred):values.length?String(values[0][0]):'';
}
function setStage(value){
 stage=value;
 for(const button of panel.querySelectorAll('[data-mi-stage]')){
  const active=button.getAttribute('data-mi-stage')===value;
  button.classList.toggle('mi-active',active);
  button.setAttribute('aria-pressed',active?'true':'false');
 }
 for(const section of panel.querySelectorAll('[data-mi-content]')){
  section.hidden=section.getAttribute('data-mi-content')!==value;
 }
 render();
}
function currentRadar(){
 if(!datasets.uss)return null;
 return api.radar(datasets.uss,$('mi-month').value||null,warning);
}
function currentSupply(){
 return api.forecastCohorts({kei:datasets.kei,registered:datasets.registered},
  Number($('mi-supply-year').value),Number($('mi-supply-age').value),$('mi-supply-share').value);
}
function currentRegion(){
 if(!datasets.jobs||!datasets.migration)return null;
 return api.regionalSignals(datasets.jobs,datasets.migration,$('mi-region-month').value,$('mi-region-basis').value);
}
function renderRadar(){
 const out=$('mi-radar-result');out.replaceChildren();
 if(!datasets.uss){add(out,'p','mi-empty','USS公式資料が未取得です。更新状態と通信を確認してください。');return;}
 let d;try{d=currentRadar();}catch(e){add(out,'p','mi-empty',e.message);return;}
 const group=add(out,'div','mi-metrics');
 textLine(group,'出品台数',comma(d.row.offered)+'台');
 textLine(group,'成約台数',comma(d.row.sold)+'台');
 textLine(group,'成約率',d.row.sale_rate_pct.toFixed(1)+'%');
 textLine(group,'平均成約価格',(d.row.avg_sold_price_thousand_jpy/10).toFixed(1)+'万円');
 const metrics=add(out,'p','mi-caption',d.previousMonth?
  '前月 '+d.previousMonth+' 比：出品'+signed(d.delta.offeredPct)+'% ／ 成約'+signed(d.delta.soldPct)+'% ／ 成約率'+signed(d.delta.saleRatePoint)+'pt ／ 単価'+signed(d.delta.pricePct)+'%。':
  '連続する前月のデータがありません。前月比は算出しません。');
 const tag=add(out,'p','mi-verdict','既存の早期警戒ルール：'+({high:'警戒・高',watch:'警戒・注意',low:'該当条件なし',unknown:'判定保留'}[d.warning.level]||'判定保留'));
 tag.dataset.level=d.warning.level;
 if(d.contradictions.length){
  const h=add(out,'h4',null,'自動検出した変化の組合せ');
  const list=add(out,'ul','mi-bullets');
  d.contradictions.forEach(x=>add(list,'li',null,x));
 }else add(out,'p','mi-empty','設定した相反・乖離条件には該当しませんでした。異変がないことを証明するものではありません。');
 add(out,'p','mi-caption','この警戒ルールは仮の閾値による探索目的です。全車種平均の構成変化を調整していません。翌月の情報は現在月の判定には使用しません。');
}
function renderSupply(){
 const out=$('mi-supply-result');out.replaceChildren();
 let d;try{d=currentSupply();}catch(e){add(out,'p','mi-empty',e.message);return;}
 $('mi-supply-share-label').textContent=d.rate+'%（実績ではない仮定）';
 if(!d.coveredModels){add(out,'p','mi-empty',d.sourceYear+'年のランキングは未収録です。0台と扱いません。');return;}
 const intro=add(out,'div','mi-supply-summary');
 textLine(intro,'対象となる新車販売年',d.sourceYear+'年');
 textLine(intro,'収録された車種数',d.coveredModels+'車種');
 textLine(intro,'上位収録車種の新車台数',comma(d.observedSales)+'台');
 textLine(intro,'仮定の流通対象台数',comma(d.scenarioTotal)+'台');
 add(out,'p','mi-caption',d.targetYear+'年に'+d.age+'年経過する'+d.sourceYear+'年の新車販売ランキングを使用。販売台数×仮定流通率であり、買取・AA出品・残クレ返却の実績ではありません。上位ランキング圏外の販売台数は含みません。');
 const max=d.vehicles[0].units;
 const top=add(out,'div','mi-ranked');
 for(const item of d.vehicles.slice(0,12)){
  const row=add(top,'div','mi-rank-row');
  const head=add(row,'div','mi-rank-head');
  add(head,'span',null,item.vehicleClass+'｜'+item.make+' '+item.model);
  add(head,'strong',null,comma(item.scenario)+'台※');
  const rail=add(row,'div','mi-rail');
  const fill=add(rail,'span','mi-fill');
  fill.style.width=Math.min(100,item.units/max*100).toFixed(2)+'%';
  add(row,'small','mi-caption','新車販売'+comma(item.units)+'台'+(item.sourceType==='secondary'?' · 二次資料（原本未照合）':' · 公式年間順位'));
 }
 if(d.missing.length)add(out,'p','mi-warning',d.missing.join(' ／ '));
 add(out,'p','mi-caption','※仮定率を掛けただけのシナリオ。仕入れ推奨台数でも予測実績でもありません。');
}
function renderRegion(){
 const out=$('mi-region-result');out.replaceChildren();
 if(!datasets.jobs||!datasets.migration){add(out,'p','mi-empty','求人・人口移動の双方が取得できるまで判定を保留します。');return;}
 let d;try{d=currentRegion();}catch(e){add(out,'p','mi-empty',e.message);return;}
 if(d.reason){add(out,'p','mi-empty',d.reason);return;}
 const count=d.rows.filter(x=>x.jobPct>0&&x.net>0).length;
 add(out,'p','mi-verdict','求人増・国内転入超過の地域：'+count+'/47');
 const sort=$('mi-region-order').value;
 const sorted=d.rows.slice().sort(sort==='netChange'?
  (a,b)=>(b.netChange??-Infinity)-(a.netChange??-Infinity):
  sort==='net'?(a,b)=>b.net-a.net:(a,b)=>b.jobPct-a.jobPct);
 const grid=add(out,'div','mi-region-table');
 const header=add(grid,'div','mi-region-grid mi-region-th');
 ['都道府県','求人変化率','転入−転出','純移動前年差'].forEach(x=>add(header,'span',null,x));
 for(const item of sorted.slice(0,12)){
  const row=add(grid,'div','mi-region-grid');
  add(row,'strong',null,item.name);add(row,'span',null,signed(item.jobPct)+'%');
  add(row,'span',null,(item.net>=0?'+':'')+comma(item.net));
  add(row,'span',null,item.netChange===null?'—':(item.netChange>=0?'+':'')+comma(item.netChange));
 }
 add(out,'p','mi-caption','求人はハローワーク受理地別の新規求人数（'+(d.basis==='yoy'?'前年同月比':'前月比')+'）、人口は他都道府県との国内移動（同月）です。順位は自動車需要順位ではありません。純移動前年差は前年同月の人口資料がある場合のみ表示。');
}
function renderHypotheses(){
 const rootEl=$('mi-hypothesis-result');rootEl.replaceChildren();
 let radarResult=null,region=null,cohorts=null;
 try{radarResult=currentRadar();}catch(_){}
 try{region=currentRegion();}catch(_){}
 try{cohorts=currentSupply();}catch(_){}
 const cases=api.hypotheses(radarResult,region,cohorts);
 if(selectedHypothesis>=cases.length)selectedHypothesis=0;
 const select=add(rootEl,'div','mi-hyp-list');
 cases.forEach((h,i)=>{
  const b=add(select,'button','button secondary'+(selectedHypothesis===i?' mi-selected':''),String(i+1)+'｜'+h.title);
  b.type='button';b.setAttribute('aria-pressed',selectedHypothesis===i?'true':'false');
  b.addEventListener('click',()=>{selectedHypothesis=i;renderHypotheses();});
 });
 const h=cases[selectedHypothesis];
 const detail=add(rootEl,'article','mi-hyp-detail');
 for(const [label,value] of [['現状の観測根拠',h.evidence],['原因の仮説（未検証）',h.theory],
   ['別の説明の可能性',h.alternative],['不足しているデータ',h.need],['反証・確認する方法',h.disproof]]){
   add(detail,'h4',null,label);add(detail,'p',null,value);
 }
 add(detail,'p','mi-caption','これはルールベースの仮説生成です。AIが自律調査して因果を証明した結果ではありません。収録データ以外の新しい市場事実は追加していません。');
}
function renderBacktest(){
 const out=$('mi-backtest-result');out.replaceChildren();
 if(!datasets.uss){add(out,'p','mi-empty','USSデータが未取得です。');return;}
 const stats=api.retrospective(datasets.uss,warning);
 add(out,'p','mi-verdict','事後比較：'+stats.comparable+'組（公式の連続月のみ）');
 add(out,'p','mi-caption',stats.reason);
 const table=add(out,'div','mi-region-table');
 const head=add(table,'div','mi-test-grid mi-region-th');
 ['判定した月','当月の警戒判定','翌月','翌月の単価前月比'].forEach(x=>add(head,'span',null,x));
 for(const s of stats.samples.slice().reverse()){
  const row=add(table,'div','mi-test-grid');
  add(row,'span',null,s.decisionMonth);add(row,'span',null,({high:'高',watch:'注意',low:'条件なし',unknown:'不明'}[s.level]||'不明'));
  add(row,'span',null,s.nextMonth);add(row,'strong',null,signed(s.nextAvgPct)+'%');
 }
 add(out,'p','mi-caption','判定は各月の同月統計のみから計算し、その後に翌月の価格結果を付けています。将来情報の混入なし。ただし全車種の平均値で車種構成未調整。独立した検証期間が十分にないため「的中率」は表示しません。');
}
function render(){
 if(stage==='radar')renderRadar();
 if(stage==='supply')renderSupply();
 if(stage==='regional')renderRegion();
 if(stage==='hypotheses')renderHypotheses();
 if(stage==='backtest')renderBacktest();
}
function refreshChoices(){
 if(datasets.uss)setOptions('mi-month',datasets.uss.months.slice().reverse().map(x=>[x.month,x.month+'月']),datasets.uss.months.at(-1).month);
 const jobs=datasets.jobs?.months||[],migration=datasets.migration?.months||[];
 const intersects=jobs.filter(j=>migration.some(m=>m.month===j.month)).map(x=>x.month).sort().reverse();
 setOptions('mi-region-month',intersects.map(x=>[x,x]),intersects[0]);
}
async function load(){
 if(loading)return;
 loading=true;$('mi-reload').disabled=true;status.textContent='公式公開データを確認しています…';
 const entries=Object.entries(paths);
 const results=await Promise.allSettled(entries.map(async ([key,file])=>{
  const reader=root.MDOffline&&root.MDOffline.read?root.MDOffline.read:fetch;
  const response=await reader('./data/'+file+'?v='+Date.now(),{cache:'no-store'});
  if(!response.ok)throw Error('HTTP '+response.status);
  const data=await response.json();
  if(key==='uss')api.officialUss(data);
  if(['kei','registered'].includes(key)){
   if(!root.MDResidualMaturity)throw Error('年次統計の検証機能がありません');
   root.MDResidualMaturity.validateDataset(data,key);
  }
  if(key==='jobs'){
   if(!root.MDPrefectureJobs)throw Error('求人統計の検証機能がありません');
   root.MDPrefectureJobs.validate(data);
  }
  if(key==='migration'){
   if(!root.MDPopulationMigration)throw Error('人口移動の検証機能がありません');
   root.MDPopulationMigration.validate(data);
  }
  return data;
 }));
 results.forEach((v,i)=>{
  const key=entries[i][0];
  if(v.status==='fulfilled'){datasets[key]=v.value;delete errors[key];}
  else {delete datasets[key];datasets[key]=null;errors[key]=String(v.reason?.message||'取得できません').slice(0,140);}
 });
 const available=Object.values(datasets).filter(Boolean).length;
 status.textContent='公開資料 '+available+'/5系統を読み込みました'+(navigator.onLine===false?'（オフライン保存版）':'')+'。取得失敗は既存の端末記録を変更しません。';
 sources.replaceChildren();
 for(const key of Object.keys(paths)){
  add(sources,'span','mi-source '+(datasets[key]?'mi-ok':'mi-missing'),names[key]+(datasets[key]?' ✓':'：'+errors[key]));
 }
 refreshChoices();loading=false;lastLoaded=Date.now();$('mi-reload').disabled=false;render();
}
for(const b of panel.querySelectorAll('[data-mi-stage]'))b.addEventListener('click',()=>setStage(b.getAttribute('data-mi-stage')));
for(const id of ['mi-month','mi-supply-year','mi-supply-age','mi-supply-share','mi-region-month','mi-region-basis','mi-region-order'])
 $(id).addEventListener(id==='mi-supply-share'?'input':'change',()=>{
  if(id.startsWith('mi-supply')||id==='mi-month'||id.startsWith('mi-region'))selectedHypothesis=0;
  render();
 });
$('mi-reload').addEventListener('click',load);
$('mi-advanced').addEventListener('click',()=>{const target=$('rm-panel');if(target){target.open=true;target.scrollIntoView({behavior:'smooth',block:'start'});}});
root.addEventListener('online',()=>{if(Date.now()-lastLoaded>60*1000)load();});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&Date.now()-lastLoaded>20*60*1000)load();});
setStage('radar');load();
})(window);
