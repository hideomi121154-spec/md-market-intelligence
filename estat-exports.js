/* MD MARKET v4.2 — optional OFFICIAL e-Stat 2026 country×HS breakdown.
 * Never turn missing rows into zero or mix with JUMV rankings/user notes.
 */
'use strict';
(function(root){
  const PATH='./data/estat_used_vehicle_exports.json';
  const GROUPS=[
   {id:'petrol',label:'ガソリン車',match:c=>/^87032/.test(c)},
   {id:'diesel',label:'ディーゼル車',match:c=>/^87033/.test(c)},
   {id:'hv',label:'ハイブリッド車',match:c=>/^8703(40|50)/.test(c)},
   {id:'phev',label:'プラグインHV',match:c=>/^8703(60|70)/.test(c)},
   {id:'ev',label:'電気自動車',match:c=>/^870380/.test(c)},
   {id:'other',label:'その他',match:c=>/^870390/.test(c)}
  ];
  const clean=s=>String(s??'').normalize('NFKC').trim();
  function officialData(source){
    if(!source||source.schema_version!==1||source.year!==2026||!['not_configured','available'].includes(source.status))throw Error('公式統計の形式が異なります');
    if(!Array.isArray(source.rows)||!Array.isArray(source.months)||!source.hs_labels||typeof source.hs_labels!=='object')throw Error('公式統計の配列が不足しています');
    if(source.status==='not_configured'){
      if(source.rows.length||source.months.length||source.updated_at!==null)throw Error('未設定の統計に実績値が含まれています');
      return source;
    }
    if(!/^\d{10}$/.test(String(source.stats_data_id))||!/^https:\/\/www\.e-stat\.go\.jp\//.test(source.source_url)||
       !/^\d{4}-\d{2}-\d{2}T/.test(source.updated_at)||!source.months.length||!source.rows.length)throw Error('公式APIの出典・更新時刻が不正です');
    const months=new Set();
    for(const m of source.months){
      if(!/^2026-(0[1-9]|1[0-2])$/.test(m)||months.has(m))throw Error('月コードが不正です');
      months.add(m);
    }
    const codes=Object.keys(source.hs_labels);
    if(codes.length<12||codes.length>25||codes.some(c=>!/^8703\d{5}$/.test(c)))throw Error('HS分類コードが不正です');
    const seen=new Set();
    for(const r of source.rows){
      if(!months.has(r.period)||typeof r.country!=='string'||!clean(r.country)||r.country.length>75||
       !/^\d{5}$/.test(r.area_code)||!codes.includes(r.hs_code)||
       !Number.isSafeInteger(r.units)||r.units<0||r.units>5000000)throw Error('公式APIの集計値が不正です');
      const id=r.period+'|'+r.area_code+'|'+r.hs_code;
      if(seen.has(id))throw Error('同一公式セルが重複しています');seen.add(id);
    }
    return source;
  }
  function figures(data,name,month){
    const verified=officialData(data);
    if(verified.status!=='available')return {status:'not_configured',records:[],byGroup:[],country:name,month};
    if(!verified.months.includes(month))return {status:'missing_month',records:[],byGroup:[],country:name,month};
    const rows=verified.rows.filter(r=>r.country===name&&r.period===month);
    return {status:rows.length?'available':'missing_country',records:rows,byGroup:GROUPS.map(g=>{
       const found=rows.filter(x=>g.match(x.hs_code));
       return {id:g.id,label:g.label,reported:found.length,units:found.length?found.reduce((a,x)=>a+x.units,0):null};
    }),country:name,month};
  }
  const API={PATH,GROUPS,officialData,figures};
  if(typeof module==='object'&&module.exports)module.exports=API;
  root.MDEstatExports=API;
  if(typeof document==='undefined')return;
  const $=id=>document.getElementById(id);
  if(!$('estat-export-panel'))return;
  const make=(tag,value,cls)=>{const el=document.createElement(tag);if(cls)el.className=cls;if(value!==undefined)el.textContent=value;return el};
  let source=null;
  const number=v=>Number(v).toLocaleString('ja-JP');
  function update(){
    const result=$('estat-export-results');result.replaceChildren();
    if(!source)return;
    if(source.status==='not_configured'){
      result.append(make('p','公式e-Stat自動取得は未設定です。GitHub Actions Secretsに ESTAT_APP_ID を設定して更新ワークフローを実行すると、ここに公式の国別×排気量・動力別データが表示されます。','cm-warning'));
      return;
    }
    const name=$('estat-export-country').value,period=$('estat-export-month').value;
    const selection=figures(source,name,period);
    if(selection.status!=='available'){
      result.append(make('p',selection.status==='missing_month'?'この月はまだ公式統計に収録されていません。':'この国・月には対象HS番号の収録行がありません（0台とは限りません）。','cm-warning'));
      return;
    }
    const summary=make('div',undefined,'cm-kpis');
    for(const g of selection.byGroup){
      const card=make('article',undefined,'cm-kpi');
      card.append(make('small',g.label),make('strong',g.units===null?'未収録':number(g.units)+'台'),
        make('span',g.reported+'件のHS行を合算／該当区分の完全収録は保証しません'));
      summary.append(card);
    }
    result.append(summary);
    result.append(make('p','公的統計の数量1（NO＝台）を使った掲載済みHS行の小計です。未掲載のHS・国・月を0台としません。車種名・新車/中古車以外の価格等は不明です。','cm-warning'));
    const wrap=make('div',undefined,'cm-scroll'),table=make('table',undefined,'cm-table'),thead=make('thead'),tr=make('tr');
    ['2026年HS番号','中古乗用車の区分','輸出台数'].forEach(v=>tr.append(make('th',v)));
    thead.append(tr);table.append(thead);
    const tbody=make('tbody');
    selection.records.sort((a,b)=>a.hs_code.localeCompare(b.hs_code)).forEach(r=>{
      const row=make('tr');
      row.append(make('td',r.hs_code),make('td',source.hs_labels[r.hs_code]),make('td',number(r.units)+'台'));
      tbody.append(row);
    });
    table.append(tbody);wrap.append(table);result.append(wrap);
  }
  async function initialize(){
    const status=$('estat-export-status');
    try{
      const req=root.MDOffline?.read?root.MDOffline.read(PATH,{cache:'no-store'}):fetch(PATH,{cache:'no-store'});
      const response=await req;if(!response.ok)throw Error('データファイルの取得に失敗しました');
      source=officialData(await response.json());
      const select=$('estat-export-country'),month=$('estat-export-month');
      select.replaceChildren();month.replaceChildren();
      if(source.status==='available'){
        const countries=[...new Set(source.rows.map(r=>r.country))].sort((a,b)=>a.localeCompare(b,'ja'));
        countries.forEach(name=>{const op=make('option',name);op.value=name;select.append(op)});
        source.months.slice().sort().reverse().forEach(m=>{const op=make('option',m);op.value=m;month.append(op)});
        select.value=countries.includes('ロシア')?'ロシア':countries[0];
        select.addEventListener('change',update);month.addEventListener('change',update);
        status.textContent='公式e-Stat統計表ID '+source.stats_data_id+' ／ 最終データ更新 '+source.updated_at+' ／ 対象 '+source.rows.length.toLocaleString('ja-JP')+'セル。';
      }else{
        status.textContent='未設定：公式e-Stat API連携はまだ有効化されていません。';
      }
      update();
    }catch(e){
      status.textContent='公式統計を検証できません：'+e.message+'。以前の公開ランキングとは別のデータです。';
    }
  }
  initialize();
})(typeof window==='undefined'?globalThis:window);
