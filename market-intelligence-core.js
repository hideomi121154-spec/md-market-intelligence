/* MD MARKET: auditable, source-bounded market intelligence calculations.
 * Pure functions. No claims of vehicle-level prices, trade volume or causal inference.
 */
(function(root){
'use strict';
const MONTH=/^20\d{2}-(0[1-9]|1[0-2])$/;
const norm=v=>String(v||'').normalize('NFKC').toUpperCase().replace(/[\s\u3000\u2010-\u2015\u2212\u30fc\-_]/g,'');
const round=n=>Math.round(n*10)/10;
const monthNum=m=>Number(m.slice(0,4))*12+Number(m.slice(5));
const signed=n=>(n>0?'+':'')+Number(n).toFixed(1);
function assertMonth(m){if(!MONTH.test(m))throw Error('対象年月が不正です');}
function officialUss(data){
 if(!data||data.schema_version!==1||!Array.isArray(data.months)||!data.months.length)throw Error('USS月次実績がありません');
 let last='';
 for(const row of data.months){
  if(!row||!MONTH.test(row.month)||row.month<=last||
     !Number.isFinite(row.offered)||!Number.isFinite(row.sold)||
     !Number.isFinite(row.sale_rate_pct)||!Number.isFinite(row.avg_sold_price_thousand_jpy)||
     row.offered<=0||row.sold<=0||row.sold>row.offered||
     row.sale_rate_pct<0||row.sale_rate_pct>100||row.avg_sold_price_thousand_jpy<=0||
     Math.abs(row.sold/row.offered*100-row.sale_rate_pct)>0.2)throw Error('USS公式実績の形式が不正です');
  last=row.month;
 }
 return data.months;
}
function radar(data,selected,warningApi){
 const months=officialUss(data);
 const row=months.find(x=>x.month===(selected||months[months.length-1].month));
 if(!row)throw Error('選択月は収録されていません');
 const index=months.indexOf(row),prior=months[index-1];
 const previous=prior&&monthNum(row.month)-monthNum(prior.month)===1?prior:null;
 const percent=(current,base)=>base>0?round((current/base-1)*100):null;
 const delta={
  offeredPct:previous?percent(row.offered,previous.offered):null,
  soldPct:previous?percent(row.sold,previous.sold):null,
  pricePct:previous?percent(row.avg_sold_price_thousand_jpy,previous.avg_sold_price_thousand_jpy):null,
  saleRatePoint:previous?round(row.sale_rate_pct-previous.sale_rate_pct):null
 };
 const warning=warningApi&&typeof warningApi.evaluate==='function'?warningApi.evaluate(row):{level:'unknown',reason:'警戒判定機能未接続'};
 const contradictions=[];
 if(delta.pricePct!==null&&delta.saleRatePoint!==null&&delta.pricePct>0&&delta.saleRatePoint<0)
  contradictions.push('成約率が前月より低下する一方、全体の平均成約単価が上昇しました');
 if(delta.offeredPct!==null&&delta.soldPct!==null&&delta.offeredPct-delta.soldPct>=3)
  contradictions.push('出品台数の前月増加率が成約台数の増加率を3ポイント以上上回りました');
 if(delta.pricePct!==null&&delta.saleRatePoint!==null&&delta.pricePct<0&&delta.saleRatePoint>0)
  contradictions.push('成約率が前月より上昇する一方、全体の平均成約単価が下落しました');
 return {month:row.month,previousMonth:previous?.month||null,row,delta,warning,contradictions,sourceChecked:data.checked_at_utc||null};
}
function forecastCohorts(annual,targetYear,age,rate){
 if(!Number.isInteger(targetYear)||targetYear<2024||targetYear>2035)throw Error('対象年が範囲外です');
 if(![3,5,7].includes(age))throw Error('3・5・7年経過のみ選択できます');
 const p=Number(rate);
 if(!Number.isFinite(p)||p<0||p>100||rate===null||String(rate).trim()==='')throw Error('仮定流通率は0〜100%です');
 const sourceYear=targetYear-age,vehicles=[],missing=[];
 for(const group of [{id:'kei',label:'軽乗用車',data:annual?.kei},{id:'registered',label:'登録乗用車',data:annual?.registered}]){
  if(!group.data||!Array.isArray(group.data.years)){missing.push(group.label+'：資料未取得');continue;}
  const found=group.data.years.find(x=>x.year===sourceYear);
  if(!found){missing.push(group.label+'：'+sourceYear+'年は収録期間外');continue;}
  if(!Array.isArray(found.models)||!found.models.length){missing.push(group.label+'：車種別資料が不足');continue;}
  for(const row of found.models){
   if(!row||!Number.isSafeInteger(row.units)||row.units<=0||!row.make||!row.model)continue;
   vehicles.push({classId:group.id,vehicleClass:group.label,make:row.make,model:row.model,
    year:sourceYear,units:row.units,scenario:Math.round(row.units*p/100),
    rank:row.rank,sourceType:found.source_type||'official',sourceUrl:found.source_url||null});
  }
 }
 const sorted=vehicles.sort((a,b)=>b.scenario-a.scenario||b.units-a.units);
 return {targetYear,age,sourceYear,rate:p,vehicles:sorted,missing,
  coveredModels:vehicles.length,observedSales:vehicles.reduce((s,v)=>s+v.units,0),
  scenarioTotal:vehicles.reduce((s,v)=>s+v.scenario,0),
  partial:true};
}
function regionalSignals(jobs,migration,month,basis){
 assertMonth(month);
 if(!['yoy','mom'].includes(basis))throw Error('比較期間が不正です');
 if(!jobs||!Array.isArray(jobs.months)||!migration||!Array.isArray(migration.months))throw Error('地域データが不足しています');
 const current=jobs.months.find(x=>x.month===month);
 const previousCode=monthNum(month)-(basis==='yoy'?12:1);
 const prev=jobs.months.find(x=>MONTH.test(x.month)&&monthNum(x.month)===previousCode);
 const moved=migration.months.find(x=>x.month===month);
 if(!current||!prev||!moved||!current.values||!prev.values||!moved.values)
  return {month,basis,rows:[],reason:'求人・人口移動の同月データまたは比較月が不足しています'};
 const lastMigration=migration.months.find(x=>MONTH.test(x.month)&&monthNum(x.month)===monthNum(month)-12);
 const names=Object.keys(current.values);
 if(names.length!==47||names.some(name=>!(name in prev.values)||!(name in moved.values)))
  throw Error('47都道府県のデータに欠損があります');
 const rows=names.map(name=>{
  const c=current.values[name],old=prev.values[name],move=moved.values[name];
  if(!Number.isSafeInteger(c)||!Number.isSafeInteger(old)||old<=0||
      !move||!Number.isSafeInteger(move.in)||!Number.isSafeInteger(move.out))throw Error('地域数値が不正です');
  const before=lastMigration?.values?.[name];
  const net=move.in-move.out, prevNet=before&&Number.isSafeInteger(before.in)&&Number.isSafeInteger(before.out)?before.in-before.out:null;
  const jobPct=round((c/old-1)*100);
  const category=jobPct>0&&net>0?'求人増・転入超過':jobPct>0&&net<0?'求人増・転出超過':
   jobPct<0&&net>0?'求人減・転入超過':jobPct<0&&net<0?'求人減・転出超過':'横ばいを含む';
  return {name,jobPct,net,prevNet,netChange:prevNet===null?null:net-prevNet,
   category,inbound:move.in,outbound:move.out};
 });
 return {month,basis,rows,reason:null,hasMigrationYoY:!!lastMigration,
  sorted:rows.slice().sort((a,b)=>b.jobPct-a.jobPct)};
}
function hypotheses(radarResult,regions,cohorts){
 const list=[];
 const d=radarResult?.delta;
 if(d&&d.pricePct!==null&&d.saleRatePoint!==null&&d.pricePct>0&&d.saleRatePoint<0)
  list.push({id:'composition',title:'成約率低下と平均価格上昇の併存',
   evidence:'USS：成約率 前月差'+signed(d.saleRatePoint)+'pt、平均成約単価 前月比'+signed(d.pricePct)+'%。',
   theory:'落札された車の価格帯・年式・車種構成が変化した可能性',
   alternative:'輸出需要、季節性、会場構成の変化などでも説明され得る',
   need:'車種・価格帯・年式別の出品構成と成約構成（利用許諾のある資料）',
   disproof:'車両構成を固定しても平均価格上昇が持続するかを検証'});
 if(d&&d.offeredPct!==null&&d.soldPct!==null&&d.offeredPct-d.soldPct>=3)
  list.push({id:'supply-gap',title:'出品増加に対し成約増加が追いつかない',
   evidence:'USS：出品'+signed(d.offeredPct)+'%、成約'+signed(d.soldPct)+'%（各前月比）。',
   theory:'需給バランスが変わり、在庫の滞留圧力が高まっている可能性',
   alternative:'営業日数・開催回数・季節変動で説明できる可能性',
   need:'前年同月と開催回数、継続的な成約率、車種別在庫実数',
   disproof:'開催回数・季節性を調整すると増加率差が解消するかを検証'});
 const positive=(regions?.rows||[]).filter(x=>x.jobPct>0&&x.net>0);
 if(positive.length)
  list.push({id:'regional',title:'求人増・転入超過の地域が'+positive.length+'地域',
   evidence:'新規求人数の増加と国内他県からの純流入が同時に観測されています。',
   theory:'地域の移動需要が変わる可能性',
   alternative:'住民票の移動は自動車購入と一致せず、公共交通で移動する人もいる',
   need:'年齢別の免許保有、世帯保有車数、地域別販売・中古流通台数',
   disproof:'免許保有者あたりの販売台数が上昇していないなら需要増の根拠は弱い'});
 if(cohorts&&cohorts.coveredModels)
  list.push({id:'cohort',title:String(cohorts.sourceYear)+'年販売車が'+cohorts.targetYear+'年に'+cohorts.age+'年経過',
   evidence:'収録上位'+cohorts.coveredModels+'車名の新車販売台数を年代ごとに照合。',
   theory:'車検・代替による中古車供給が増える可能性',
   alternative:'保有延長、残クレ利用率、車名の統廃合、輸出等により流通量は不明',
   need:'買い替え率・保有継続率・残クレ満了実績と正規の流通統計',
   disproof:'同世代の実際の中古車流通数に増加が観測されなければ支持されない'});
 if(!list.length)list.push({id:'needs-data',title:'現時点で仮説を作れる変化が不足',
   evidence:'収録資料に十分な連続時系列がありません。',
   theory:'追加統計の公表後に判断',alternative:'データ欠測は変化なしを意味しない',
   need:'前月・前年同月の同じ定義の実績',disproof:'追加データで変化を確認する'});
 return list;
}
function retrospective(uss,warningApi){
 const months=officialUss(uss);
 const samples=[];
 for(let i=0;i<months.length-1;i++){
  const current=months[i],next=months[i+1];
  if(monthNum(next.month)!==monthNum(current.month)+1)continue;
  const check=warningApi&&typeof warningApi.evaluate==='function'?warningApi.evaluate(current):{level:'unknown'};
  samples.push({decisionMonth:current.month,nextMonth:next.month,level:check.level,
   nextAvgPct:round((next.avg_sold_price_thousand_jpy/current.avg_sold_price_thousand_jpy-1)*100),
   hasOneMonthFollowup:true});
 }
 return {samples,comparable:samples.filter(x=>x.level!=='unknown').length,
  assessable:samples.length>=24,warningVersion:'heuristic-v1',
  reason:samples.length>=24?'探索用の事後検証。訓練・テストを分離しておらず予測性能を証明しません。':
   '連続する翌月実績が'+samples.length+'組のみ。的中率や統計的な予測性能を判定するには不足しています。'};
}
const api=Object.freeze({norm,round,signed,officialUss,radar,forecastCohorts,regionalSignals,hypotheses,retrospective});
if(typeof module==='object'&&module.exports)module.exports=api;
root.MDMarketIntelligence=api;
})(typeof window==='undefined'?globalThis:window);
