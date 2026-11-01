/* MD MARKET v4.4 — country-by-model evidence comparison desk.
 * Comparing country-wide exports DOES NOT rank model-specific export demand.
 * User notes and CarSensor retail listing averages remain unverified context.
 */
'use strict';
(function(root){
 const PRICE_KEY='md-market-model-price-monthly-v1';
 const LIMIT=200;
 const fmt=n=>Number(n).toLocaleString('ja-JP');
 const canonicalCountry=s=>root.MDGlobalModelExport?.normalizeCountry(s)||String(s||'').trim();
 const key=(make,model)=>{
  if(!root.MDGlobalModelExport?.identity)throw Error('車種照合処理がありません');
  return root.MDGlobalModelExport.identity(make,model);
 };
 function compareCountries(catalog,snapshot,official,rawNotes,make,model){
  const M=root.MDGlobalModelExport;
  if(!M?.verifyCatalog||!root.MDEstatExports?.officialData||!root.MDOverseas?.verifySnapshot)
   throw Error('照合に必要な既存統計の検証処理がありません');
  M.verifyCatalog(catalog);root.MDOverseas.verifySnapshot(snapshot);root.MDEstatExports.officialData(official);
  if(!catalog.makes.some(x=>x.make===make&&x.models.includes(model)))throw Error('対象のメーカー・車種を確認してください');
  const notes=M.readNotes(rawNotes);
  const countries=M.countryOptions(catalog,snapshot,official,notes);
  if(countries.length>LIMIT)throw Error('比較対象の国が多すぎます');
  const id=key(make,model),byCountry=new Map();
  for(const n of notes.records){
   if(key(n.make,n.model)!==id)continue;
   const c=canonicalCountry(n.country),arr=byCountry.get(c)||[];
   arr.push(n);byCountry.set(c,arr);
  }
  const totals=new Map(snapshot.country_ytd.countries.map(x=>[canonicalCountry(x.country),x]));
  const rankings=new Map();
  for(const group of snapshot.type_rankings.categories){
   for(const row of group.rows){
    const c=canonicalCountry(row[0]),arr=rankings.get(c)||[];
    arr.push({type:group.title,units:row[1]});rankings.set(c,arr);
   }
  }
  const officialStates=new Map();
  if(official.status==='available'){
   for(const r of official.rows){
    const c=canonicalCountry(r.country),x=officialStates.get(c)||{count:0,periods:new Set()};
    x.count++;x.periods.add(r.period);officialStates.set(c,x);
   }
  }
  const rows=countries.map(entry=>{
   const c=entry.name,aggregate=totals.get(c)||null,types=rankings.get(c)||[];
   const records=(byCountry.get(c)||[]).sort((a,b)=>b.period.localeCompare(a.period)||a.id.localeCompare(b.id));
   const latest=records[0]||null;
   const conflicting=!!(latest&&records.some(x=>x.period===latest.period&&
     (x.scope!==latest.scope||x.current!==latest.current||x.previous!==latest.previous)));
   return {
    country:c,allVehicles:aggregate?.count??null,allVehiclesYoy:aggregate?.yoy_pct??null,
    aggregatePeriod:snapshot.country_ytd.period,aggregateSource:snapshot.country_ytd.source_url,
    typeTopFive:types,categoryPeriod:snapshot.type_rankings.period,
    officialHS:officialStates.get(c)?.count||0,
    modelRecord:latest,modelRecordCount:records.length,modelRecordConflict:conflicting,
    modelCountOfficial:null,modelCountStatus:'未取得'
   };
  });
  // Sort strictly by COUNTRY-wide aggregate; never by model demand.
  rows.sort((a,b)=>(b.allVehicles??-1)-(a.allVehicles??-1)||a.country.localeCompare(b.country,'ja'));
  return {make,model,rows,modelCountries:rows.filter(x=>x.modelRecord).length,
    macroCountries:rows.filter(x=>x.allVehicles!==null).length,
    typeCountries:rows.filter(x=>x.typeTopFive.length>0).length,
    officialCountries:rows.filter(x=>x.officialHS>0).length,
    notesError:notes.error,
    sourcePeriod:snapshot.country_ytd.period,categoryPeriod:snapshot.type_rankings.period,
    officialIsConfigured:official.status==='available'};
 }
 function priceContext(stored,make,model){
  if(!stored)return {series:[],error:null};
  const P=root.MDModelPrice;if(!P?.validateRows)throw Error('国内参考価格の検証処理がありません');
  let parsed;
  try{parsed=JSON.parse(stored);}
  catch{return {series:[],error:'国内の保存済み価格記録を読み取れません（原本は保持しています）'};}
  let checked;
  try{checked=P.validateRows(parsed);}
  catch{return {series:[],error:'国内の保存済み価格記録の形式を検証できません（原本は保持しています）'};}
  const id=key(make,model),byScope=new Map();
  for(const row of checked){
   if(key(row.make,row.model)!==id)continue;
   const k=P.seriesKey(row),arr=byScope.get(k)||[];
   arr.push(row);byScope.set(k,arr);
  }
  const series=[];
  for(const list of byScope.values()){
   list.sort((a,b)=>a.month.localeCompare(b.month));
   const latest=list.at(-1),prev=list.length>1?list.at(-2):null;
   const gap=prev?(Number(latest.month.slice(0,4))*12+Number(latest.month.slice(5))-
                     Number(prev.month.slice(0,4))*12-Number(prev.month.slice(5))):null;
   series.push({scope:latest.model_scope,latestMonth:latest.month,
     averageTotal:latest.average_total_yen,extendedListings:latest.extended_listings,
     source:latest.source_url,sourcePDF:latest.source_pdf_url||null,checkedOn:latest.checked_on,
     deltaYen:prev&&gap===1?latest.average_total_yen-prev.average_total_yen:null,
     comparable:!!(prev&&gap===1)});
  }
  series.sort((a,b)=>b.latestMonth.localeCompare(a.latestMonth)||a.scope.localeCompare(b.scope,'ja'));
  return {series,error:null};
 }
 const API={PRICE_KEY,compareCountries,priceContext};
 if(typeof module==='object'&&module.exports)module.exports=API;
 root.MDExportEvidence=API;
 if(typeof document==='undefined')return;
 const $=id=>document.getElementById(id),target=$('export-evidence-results');
 if(!target)return;
 const create=(tag,value,cls)=>{
  const e=document.createElement(tag);if(value!==undefined)e.textContent=value;
  if(cls)e.className=cls;return e;
 };
 function link(holder,label,url){
  if(!url)return;
  try{
   const u=new URL(url);
   if(u.protocol!=='https:'||u.username||u.password)return;
   const a=create('a',label);a.href=u.href;a.target='_blank';a.rel='noopener noreferrer';holder.append(a);
  }catch{/* invalid evidence source: do not create a link */}
 }
 let latest=null,price=null;
 function render(){
  if(!latest)return;
  target.replaceChildren();
  const selector=$('export-evidence-mode');
  const rows=selector.value==='recorded'?latest.rows.filter(x=>x.modelRecord):
   selector.value==='all'?latest.rows:latest.rows.slice(0,10);
  const count=create('p','国別全車種の累計値がある国：'+latest.macroCountries+'か国／分類別トップ5掲載：'+latest.typeCountries+'か国／選択車種の本人記録：'+latest.modelCountries+'か国','gm-description');
  target.append(count);
  const warning=create('p','以下の順位は「輸出先国の全車種合計」順であり、'+latest.make+' '+latest.model+'の人気順位ではありません。車種別の公的実輸出台数は未取得です。','ry-warning');
  target.append(warning);
  if(latest.notesError)target.append(create('p',latest.notesError,'ry-warning'));
  if(!rows.length){target.append(create('p','この車種について原典付き本人記録はありません。国や車種を変えるか、既存の記録フォームから追加してください。','gm-description'));}
  else{
   const scroll=create('div',undefined,'gm-compare-scroll'),table=create('table',undefined,'gm-compare-table');
   const head=create('thead'),tr=create('tr');
   ['輸出先','国全体の輸出台数','車両タイプ別の収録','選択車種の本人記録','切替'].forEach(s=>tr.append(create('th',s)));
   head.append(tr);table.append(head);
   const body=create('tbody');
   for(const row of rows){
    const tr=create('tr');
    tr.append(create('td',row.country));
    const countCell=create('td',row.allVehicles===null?'未収録':fmt(row.allVehicles)+'台');
    if(row.allVehicles!==null){countCell.append(create('small',row.aggregatePeriod+'／前年比'+row.allVehiclesYoy+'%'));}
    tr.append(countCell);
    tr.append(create('td',row.typeTopFive.length?row.typeTopFive.map(x=>x.type).join('・'):'未収録'));
    const note=create('td');
    if(row.modelRecord){
     const n=row.modelRecord;
     note.append(create('span',n.period+' 当期'+fmt(n.current)+'台（本人転記・未検証）'));
     if(row.modelRecordConflict)note.append(create('strong',' 同月の根拠が競合'));
     const line=create('div');link(line,'出典',n.source_url);note.append(line);
    }else note.append(create('span','車種別実数未取得'));
    tr.append(note);
    const cell=create('td'),button=create('button','選択','button ghost');
    button.type='button';
    button.addEventListener('click',()=>{
     const select=$('export-model-country');
     if(!select)return;
     const valid=[...select.options].some(x=>x.value===row.country);
     if(!valid)return;
     select.value=row.country;
     select.dispatchEvent(new Event('change',{bubbles:true}));
     $('export-model-panel')?.scrollIntoView({behavior:'smooth',block:'start'});
    });
    cell.append(button);tr.append(cell);body.append(tr);
   }
   table.append(body);scroll.append(table);target.append(scroll);
  }
  target.append(create('p',latest.sourcePeriod+'の全車種・国別累計と'+latest.categoryPeriod+'の車両分類ランキングは期間と母集団が異なります。表内の本人記録は出典を利用者が入力したものであり、政府の輸出実績ではありません。','gm-description'));
  const domestic=create('div',undefined,'gm-price-context');
  domestic.append(create('h4',latest.make+' '+latest.model+'｜国内の中古車掲載価格（参考）'));
  domestic.append(create('p','カーセンサー公表のモデル別「平均支払総額」と「月間延べ掲載台数」を本人が転記した記録です。オークション落札・買取・成約額ではなく、海外の車種別需要も意味しません。世代・モデル区分の異なる値は混ぜません。','gm-description'));
  if(price?.error)domestic.append(create('p',price.error,'ry-warning'));
  if(!price?.series?.length)domestic.append(create('p','この車種の国内掲載価格はまだ記録されていません。既存の「車種別月次価格」画面で原典付き登録ができます。','gm-description'));
  for(const r of price?.series||[]){
   const box=create('article',undefined,'gm-price-row');
   box.append(create('strong',r.scope+'｜'+r.latestMonth),
    create('span','平均支払総額 '+fmt(r.averageTotal)+'円 ／ 月間延べ掲載 '+fmt(r.extendedListings)+'台'));
   if(r.comparable){
    const sign=r.deltaYen>0?'+':'';
    box.append(create('small','同じ区分の前月差 '+sign+fmt(r.deltaYen)+'円（掲載価格の差・売買価格ではありません）'));
   }else box.append(create('small','連続した前月との比較は未取得／不可'));
   const refs=create('div','確認日：'+r.checkedOn+'　');link(refs,'データ元',r.source);
   if(r.sourcePDF){refs.append(document.createTextNode(' ／ '));link(refs,'参照したPDF',r.sourcePDF)}
   box.append(refs);domestic.append(box);
  }
  target.append(domestic);
 }
 function safeStorage(key){try{return localStorage.getItem(key)||''}catch{return ''}}
 function refresh(view,snapshot,official){
  if(!view||!snapshot)return;
  const result=compareCountries(view.catalog,snapshot,
   official,
   safeStorage(root.MDGlobalModelExport.NOTES_KEY),
   view.make,view.model);
  // Official e-Stat remains a separate data series; the table never
  // converts HS totals to model-specific counts.
  latest=result;
  price=priceContext(safeStorage(PRICE_KEY),view.make,view.model);
  render();
 }
 const mode=$('export-evidence-mode');
 mode.addEventListener('change',render);
 root.MDExportEvidence.refresh=refresh;
})(typeof window==='undefined'?globalThis:window);
