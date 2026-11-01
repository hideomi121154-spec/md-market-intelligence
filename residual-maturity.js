/* MD MARKET v3.2 — source-aware, scenario-only residual contract maturity simulator. */
(function(root){
'use strict';
const YEARS=[2021,2022,2023,2024,2025],TERMS=[3,5,7];
const norm=v=>String(v||'').normalize('NFKC').trim().toUpperCase().replace(/[\s\u3000\u2010-\u2015\u2212\u30fc\-_]/g,'');
const maker=v=>({'HONDA':'ホンダ','NISSAN':'日産','SUZUKI':'スズキ','DAIHATSU':'ダイハツ','SUBARU':'スバル'})[norm(v)]||norm(v);
const key=r=>maker(r.make)+'|'+norm(r.model);
function validateDataset(data,kind){
  const count=kind==='kei'?15:kind==='registered'?50:0;
  if(!count||data?.schema_version!==1||!Array.isArray(data.years)||data.years.length!==5)throw Error('年次データ形式が未対応です');
  for(let i=0;i<YEARS.length;i++){
    const y=data.years[i];
    if(y.year!==YEARS[i]||!Array.isArray(y.models)||y.models.length!==count)throw Error('収録年・順位表の件数が不正です');
    const host=kind==='kei'?'www.zenkeijikyo.or.jp':(i===0?'minkara.carview.co.jp':'www.jada.or.jp');
    let source;
    try{source=new URL(y.source_url);}catch(e){throw Error('年次資料の出典URLが不正です');}
    if(source.protocol!=='https:'||source.hostname!==host)throw Error('出典URLのホストが不一致です');
    if(kind==='registered'&&y.source_type!==(i===0?'secondary':'official'))throw Error('2021年の二次資料区分が不正です');
    const seen=new Set();
    for(let j=0;j<count;j++){
      const r=y.models[j];
      if(!r||r.rank!==j+1||!r.make||!r.model||!Number.isSafeInteger(r.units)||r.units<=0||r.units>1000000)throw Error('年間順位データが不正です');
      if(j>0&&y.models[j-1].units<r.units)throw Error('販売台数が順位順ではありません');
      const id=key(r);if(seen.has(id))throw Error('同一年の車種が重複しています');seen.add(id);
    }
  }
  return data.years;
}
function makers(years){
  return [...new Map(years.flatMap(y=>y.models).map(r=>[maker(r.make),maker(r.make)])).values()].sort((a,b)=>a.localeCompare(b,'ja'));
}
function models(years,manufacturer){
  const values=new Map();
  for(const y of years)for(const r of y.models)if(maker(r.make)===manufacturer&&!values.has(key(r)))values.set(key(r),{id:key(r),make:r.make,model:r.model});
  return [...values.values()].sort((a,b)=>a.model.localeCompare(b.model,'ja'));
}
function annualCohort(years,year,manufacturer,model){
  const y=years.find(r=>r.year===year);
  if(!y)return {year,units:null,reason:'収録期間外',sourceUrl:null,sourceType:null};
  const candidates=y.models.filter(r=>maker(r.make)===manufacturer&&(model==='__RANKED_MAKE__'||key(r)===model));
  if(!candidates.length)return {year,units:null,reason:model==='__RANKED_MAKE__'?'当年の順位表にメーカー記録なし':'当年の上位順位外（不明）',sourceUrl:y.source_url,sourceType:y.source_type||'official'};
  return {year,units:candidates.reduce((sum,x)=>sum+x.units,0),reason:model==='__RANKED_MAKE__'?'当年の順位収録車種のみ':'',sourceUrl:y.source_url,sourceType:y.source_type||'official',modelsCount:candidates.length};
}
function requiredRate(value,name){
  if(value===null||value===undefined||String(value).trim()==='')throw Error(name+'を0〜100で入力してください');
  const n=Number(value);
  if(!Number.isFinite(n)||n<0||n>100)throw Error(name+'は0〜100の数値が必要です');
  return n/100;
}
function forecast(years,manufacturer,model,assumptions){
  if(!Array.isArray(years)||!years.length)throw Error('年次資料がありません');
  if(!manufacturer||!model)throw Error('メーカーと車種を選択してください');
  if(!makers(years).includes(manufacturer))throw Error('メーカーが年次資料に見つかりません');
  if(model!=='__RANKED_MAKE__'&&!models(years,manufacturer).some(x=>x.id===model))throw Error('車種が年次資料に見つかりません');
  const penetration=requiredRate(assumptions.penetration,'残クレ利用率');
  const returns=requiredRate(assumptions.returnRate,'返却率');
  const auctionShare=requiredRate(assumptions.auctionShare,'AA流通比率');
  const weights=TERMS.map(n=>requiredRate(assumptions['term'+n],n+'年契約の構成比'));
  if(Math.abs(weights.reduce((a,b)=>a+b,0)-1)>0.000001)throw Error('3年・5年・7年契約の構成比は合計100％にしてください');
  const results=[];
  for(let target=2024;target<=2032;target++){
    const cohorts=[],issues=[];
    let matched=0,eligibleSales=0,matured=0,returnVehicles=0,aaVehicles=0,secondary=false;
    TERMS.forEach((n,i)=>{
      if(weights[i]===0)return;
      const c=annualCohort(years,target-n,manufacturer,model);
      if(c.units===null){issues.push(n+'年契約 '+c.year+'年：'+c.reason);cohorts.push({...c,term:n,share:weights[i],maturity:null});return;}
      const amount=c.units*penetration*weights[i];
      matched++;eligibleSales+=c.units;matured+=amount;returnVehicles+=amount*returns;aaVehicles+=amount*returns*auctionShare;
      secondary=secondary||c.sourceType==='secondary';
      cohorts.push({...c,term:n,share:weights[i],maturity:amount});
    });
    const partial=model==='__RANKED_MAKE__';
    results.push({year:target,cohorts,observedCohorts:matched,missing:issues,partial,
      complete:issues.length===0&&!partial,secondary,
      eligibleSales,matured,returned:returnVehicles,aa:aaVehicles});
  }
  return {manufacturer,model,rows:results,assumptions:{penetration,weights,returns,auctionShare},scopedToRanking:model==='__RANKED_MAKE__'};
}
const api={key,maker,validateDataset,makers,models,annualCohort,forecast};
if(typeof module==='object'&&module.exports)module.exports=api;
root.MDResidualMaturity=api;
if(typeof document==='undefined')return;
const id=x=>document.getElementById('rm-'+x),panel=id('panel');
if(!panel)return;
const fmt=n=>Math.round(n).toLocaleString('ja-JP')+'台';
const makeEl=document.createElement.bind(document);
const data={registered:null,kei:null};
const status=id('status'),view=id('results'),source=id('sources');
function node(tag,cl,txt){const e=document.createElement(tag);if(cl)e.className=cl;if(txt!==undefined)e.textContent=txt;return e;}
function opt(value,label){const e=node('option');e.value=value;e.textContent=label;return e;}
function dataset(){return data[id('class').value];}
function updateChoices(preserve){
 const ds=dataset();const manufacturer=id('make'),model=id('model');
 const oldMake=preserve?manufacturer.value:null,oldModel=preserve?model.value:null;
 manufacturer.replaceChildren();model.replaceChildren();
 if(!ds){manufacturer.append(opt('','データ未取得'));model.append(opt('','—'));return;}
 const names=makers(ds);
 names.forEach(n=>manufacturer.append(opt(n,n)));
 manufacturer.value=oldMake&&names.includes(oldMake)?oldMake:(names.includes('日産')?'日産':names[0]);
 updateModels(!!preserve,oldModel);
}
function updateModels(preserve,previous){
 const ds=dataset(),manufacturer=id('make').value,model=id('model');
 model.replaceChildren();
 if(!ds||!manufacturer){model.append(opt('','—'));return;}
 model.append(opt('__RANKED_MAKE__','このメーカーの順位収録車種合計（市場全体ではない）'));
 const listing=models(ds,manufacturer);
 listing.forEach(x=>model.append(opt(x.id,x.model)));
 const preferred=listing.find(x=>norm(x.model)===norm('ノート'))||listing[0];
 model.value=preserve&&[...model.options].some(x=>x.value===previous)?previous:(preferred?preferred.id:'__RANKED_MAKE__');
}
function assumptions(){
 return {penetration:id('penetration').value,returnRate:id('return').value,
   auctionShare:id('auction').value,term3:id('term3').value,term5:id('term5').value,term7:id('term7').value};
}
function showSources(row,kind){
 source.replaceChildren();
 source.append(node('p',null,'選択年 '+row.year+'年に関係する契約年の原典：'));
 row.cohorts.forEach(c=>{
   const wrapper=node('p','rm-source-row');
   wrapper.append(node('span',null,c.term+'年契約 → '+c.year+'年販売（'+(c.units===null?c.reason:fmt(c.units))+'） '));
   if(c.sourceUrl){const a=node('a',null,c.sourceType==='secondary'?'二次資料（公式原本未検証）':'公式年次資料');a.href=c.sourceUrl;a.rel='noopener noreferrer';a.target='_blank';wrapper.append(a);}
   source.append(wrapper);
 });
 if(kind==='registered'&&row.secondary)source.append(node('p','rm-warning','注意：2021年の登録乗用車販売数は二次資料です。自販連公式原本での直接照合は未完了です。'));
}
function render(){
 view.replaceChildren();source.replaceChildren();
 const ds=dataset();if(!ds){status.textContent='該当する年次資料が取得できません。オンラインで再取得してください。';return;}
 let result;
 try{result=forecast(ds,id('make').value,id('model').value,assumptions());}
 catch(e){status.textContent='条件を入力してください：'+e.message;return;}
 const selected=Number(id('year').value);
 const current=result.rows.find(r=>r.year===selected)||result.rows[0];
 const heading=node('div','rm-summary');
 heading.append(node('div',null,'契約満了のシナリオ試算｜'+current.year+'年'));
 const metrics=node('div','rm-summary-cards');
 [['契約満了の試算',current.matured],['返却の試算',current.returned],['AA流通の試算',current.aa]].forEach(([title,n])=>{
   const card=node('div','rm-card');card.append(node('small',null,title),node('strong',null,current.observedCohorts?fmt(n):'算出不可'));metrics.append(card);
 });
 heading.append(metrics);view.append(heading);
 const qualify=current.complete?'選択した契約期間のコホートはすべて収録':current.partial?'メーカーの上位順位収録分のみ（メーカー総販売数ではありません）':'欠測あり：表示値は取得できた販売年の仮定計算分のみ';
 view.append(node('p','rm-warning',qualify));
 if(current.missing.length)view.append(node('p','rm-warning','未収録：'+current.missing.join('／')));
 const max=Math.max(1,...result.rows.map(r=>r.aa));
 const list=node('div','rm-timeline');
 result.rows.forEach(row=>{
   const wrap=node('div','rm-year-row'+(row.year===selected?' rm-selected':''));
   const button=node('button','rm-year',String(row.year));button.type='button';
   button.addEventListener('click',()=>{id('year').value=String(row.year);render();});
   const chart=node('div','rm-rail'),bar=node('div','rm-bar');bar.style.width=Math.max(0,row.aa/max*100)+'%';chart.append(bar);
   const label=node('span','rm-value',(row.observedCohorts?fmt(row.aa):'—')+(row.complete?'':' ※'));
   wrap.append(button,chart,label);list.append(wrap);
 });
 view.append(list);
 view.append(node('p','rm-note','※：当該年に必要な販売コホートが欠測、またはメーカー上位順位収録分のみ。年次新車販売数を一律に仮定した試算で、実際の契約満了・返却・オークション出品実績ではありません。'));
 showSources(current,id('class').value);
 status.textContent='年次統計を参照。利用率・契約年数の構成・返却率・AA流通率はすべて手入力の仮定です。';
}
async function load(){
 status.textContent='2021〜2025年の新車販売記録を読み込み中…';
 const defs=[['kei','./data/kei_annual_history.json'],['registered','./data/registered_annual_history.json']];
 const loaded=await Promise.allSettled(defs.map(async ([kind,url])=>{
   if(!root.MDOffline||typeof root.MDOffline.read!=='function')throw Error('オフライン読取機能がありません');
   const r=await root.MDOffline.read(url,{cache:'no-store'});
   if(!r.ok)throw Error('HTTP '+r.status);
   return validateDataset(await r.json(),kind);
 }));
 const errors=[];
 loaded.forEach((r,i)=>{data[defs[i][0]]=r.status==='fulfilled'?r.value:null;if(r.status!=='fulfilled')errors.push(defs[i][0]+': '+r.reason.message);});
 const choices=id('class');choices.replaceChildren();
 if(data.registered)choices.append(opt('registered','登録乗用車：年別上位50車種'));
 if(data.kei)choices.append(opt('kei','軽乗用車：年別上位15車種'));
 if(!data.registered&&!data.kei){status.textContent='資料を読み込めません。'+errors.join('／');view.replaceChildren();return;}
 updateChoices(false);render();
 if(errors.length)status.textContent+='一部資料は利用できません：'+errors.join('／');
}
id('class').addEventListener('change',()=>{updateChoices(false);render()});
id('make').addEventListener('change',()=>{updateModels(false);render()});
id('model').addEventListener('change',render);
id('year').addEventListener('change',render);
['penetration','return','auction','term3','term5','term7'].forEach(n=>id(n).addEventListener('input',render));
id('example').addEventListener('click',()=>{
  const example={penetration:'40',return:'60',auction:'70',term3:'20',term5:'60',term7:'20'};
  Object.entries(example).forEach(([k,v])=>id(k).value=v);
  status.textContent='架空の仮定（40%・60%等）を入力しました。企業の実績値ではありません。';render();
});
id('reload').addEventListener('click',load);
id('use-in-gap').addEventListener('click',()=>{
 const selected=models(dataset()||[],id('make').value).find(x=>x.id===id('model').value);
 if(!selected){status.textContent='メーカー合計では転記できません。個別車種を選択してください。';return;}
 const m=document.getElementById('rr-make'),v=document.getElementById('rr-model'),to=document.getElementById('rr-panel');
 if(!m||!v||!to){status.textContent='残価乖離分析の画面が見つかりません。';return;}
 m.value=selected.make;v.value=selected.model;m.dispatchEvent(new Event('input',{bubbles:true}));v.dispatchEvent(new Event('input',{bubbles:true}));
 to.open=true;to.scrollIntoView({behavior:'smooth',block:'start'});status.textContent='残価乖離分析を開き、メーカー・車名を転記しました。保証残価とAA相場は別途入力してください。';
});
load();
})(typeof window!=='undefined'?window:globalThis);
