/* MD MARKET v4.0 — Russia / Toyota Yaris export monitor.
 * Published aggregate data, domestic nameplate context and manually entered
 * unverified model evidence are deliberately separated. Nothing is scraped.
 */
'use strict';
(function(root){
  const DATA='./data/russia-yaris-sources.json';
  const EXPORTS='./data/overseas-export-snapshot.json';
  const ANNUAL='./data/registered_annual_history.json';
  const NOTES_KEY='md-market-crossborder-model-notes-v1';
  const num=v=>Number(v).toLocaleString('ja-JP');
  const validUrl=s=>{try{const u=new URL(s);return u.protocol==='https:'&&!u.username&&!u.password}catch{return false}};
  function verifySource(raw){
    if(!raw||raw.schema_version!==1||raw.subject?.destination!=='ロシア'||
      raw.subject?.make!=='トヨタ'||raw.subject?.model!=='ヤリス'||
      !/^\d{4}-\d{2}-\d{2}$/.test(raw.checked_at))throw Error('監視対象または確認日の形式が不正です');
    if(!Array.isArray(raw.observations)||raw.observations.length<2||!Array.isArray(raw.direct_model_exports)||
      !Array.isArray(raw.source_links))throw Error('証拠の区分を確認できません');
    const ids=new Set();
    for(const x of raw.observations){
      if(ids.has(x.id)||!['all_models','brand_all_models'].includes(x.scope)||
         !['JP_to_RU','RU_domestic_sales'].includes(x.geography)||
         !['official_republication','official_republication_of_industry_data'].includes(x.grade)||
         !/^\d{4}$/.test(x.period)||!Number.isSafeInteger(x.value)||x.value<0||
         x.unit!=='台'||!validUrl(x.source_url)||!x.source_name||!x.note)throw Error('出典・数値の検証に失敗');
      ids.add(x.id);
    }
    for(const x of raw.direct_model_exports){
      // No model level count is certified by this app. New official source
      // integration requires a new reviewed schema and corresponding tests.
      throw Error('未検証の車種別輸出台数を公式実測として登録できません');
    }
    for(const s of raw.source_links){if(!s.label||!validUrl(s.url))throw Error('参考リンクが不正です')}
    return raw;
  }
  function verifyExport(raw){
    if(!raw||raw.schema_version!==1||
       !/^\d{4}-\d{2}$/.test(raw.latest_period)||
       !Array.isArray(raw.country_ytd?.countries))throw Error('国別輸出統計の形式が不正です');
    const row=raw.country_ytd.countries.find(r=>r.country==='ロシア');
    if(!row||!Number.isSafeInteger(row.count)||row.count<0||
       !Number.isFinite(row.yoy_pct)||!validUrl(raw.country_ytd.source_url))throw Error('ロシアの集計がありません');
    if(!String(raw.country_ytd.period).includes(raw.latest_period))throw Error('集計月が一致していません');
    return {count:row.count,yoy:row.yoy_pct,period:raw.country_ytd.period,
       source_url:raw.country_ytd.source_url,grade:'secondary',scope:'all_used_vehicle_categories'};
  }
  function yarisHistory(raw){
    if(!raw||raw.schema_version!==1||!Array.isArray(raw.years))throw Error('国内新車販売統計の形式が不正です');
    const years=[];
    for(const yr of raw.years){
      if(!Number.isInteger(yr.year)||!['official','secondary'].includes(yr.source_type)||
         !validUrl(yr.source_url)||!Array.isArray(yr.models))throw Error('年次資料の出典を確認できません');
      const row=yr.models.find(x=>x.make==='トヨタ'&&x.model==='ヤリス');
      if(!row)continue;
      if(!Number.isSafeInteger(row.units)||row.units<0)throw Error('ヤリス新車販売数が不正です');
      years.push({year:yr.year,value:row.units,source_type:yr.source_type,source_url:yr.source_url});
    }
    return years.sort((a,b)=>a.year-b.year);
  }
  function userModelNotes(stored){
    if(!stored)return [];
    let parsed;
    try{parsed=JSON.parse(stored)}catch{return []}
    if(parsed?.schema_version!==1||parsed.kind!=='md_market_crossborder_notes'||
       !Array.isArray(parsed.records))return [];
    // Reuse the original module's validators; text is not a verified observation.
    if(!root.MDCrossover?.validateNotes)return [];
    let notes;
    try{notes=root.MDCrossover.validateNotes(parsed.records)}catch{return []}
    return notes.filter(r=>root.MDCrossover.identity(r)==='トヨタ|ヤリス'&&r.country==='ロシア')
      .sort((a,b)=>b.period.localeCompare(a.period));
  }
  function buildView(source,exportSnapshot,annual,rawNotes){
    const p=verifySource(source);
    return {subject:p.subject,verified_as_of:p.checked_at,observations:p.observations,
      links:p.source_links,macro:verifyExport(exportSnapshot),
      japanNewSales:yarisHistory(annual),directModelCount:null,
      directModelStatus:'未取得',manualNotes:userModelNotes(rawNotes)};
  }
  const API={DATA,EXPORTS,ANNUAL,NOTES_KEY,verifySource,verifyExport,yarisHistory,userModelNotes,buildView};
  if(typeof module==='object'&&module.exports)module.exports=API;
  root.MDRussiaYaris=API;
  if(typeof document==='undefined')return;
  const $=id=>document.getElementById(id),host=$('russia-yaris-results');
  if(!host)return;
  const make=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el};
  const addLink=(parent,text,url)=>{
    const a=make('a',text);a.href=url;a.target='_blank';a.rel='noopener noreferrer';parent.append(a);
  };
  function metric(label,value,desc,kind){
    const card=make('div',undefined,'ry-metric');
    card.append(make('small',label),make('strong',value),make('span',desc));
    card.dataset.kind=kind;
    return card;
  }
  function paint(view){
    host.replaceChildren();
    const meta=make('p','取得基準：'+view.verified_as_of+'。公表時点と取得時点は異なります。','ry-muted');
    host.append(meta);
    const grid=make('div',undefined,'ry-metrics');
    const annual=view.observations.find(x=>x.id==='jp-ru-used-passenger-2025');
    const toyota=view.observations.find(x=>x.id==='ru-toyota-used-sales-2025');
    grid.append(
      metric('公表値｜日本→ロシア 中古乗用車 '+annual.period,num(annual.value)+'台','JETRO掲載の財務省貿易統計／全車種','official'),
      metric('二次集計｜ロシア向け中古車 '+view.macro.period,num(view.macro.count)+'台','JUMV.NETのe-Stat加工集計／車種非限定','secondary'),
      metric('ロシア国内 トヨタ中古車 '+toyota.period,num(toyota.value)+'台','JETRO掲載のAUTOSTAT調査／全トヨタ車','industry'),
      metric('ロシア向けヤリス実輸出台数','未取得','国別統計・トヨタ全体の数字から推計しません','missing')
    );
    host.append(grid);
    const note=make('p','注意：上の3つの台数は、国別輸出／ロシア国内ブランド販売など、集計母集団が違います。足し算・比率の計算・ヤリスへの配分はできません。','ry-warning');
    host.append(note);
    const report=make('div',undefined,'ry-links');
    const a=make('p','公表値の原資料：');addLink(a,'JETRO 2025年輸出・ロシア販売',annual.source_url);report.append(a);
    const b=make('p','2026年の二次集計：');addLink(b,'国別中古車輸出統計',view.macro.source_url);report.append(b);
    host.append(report);
    host.append(make('h4','国内のヤリス新車登録台数（参考：将来の中古車供給母数）'));
    host.append(make('p','日本国内の新車販売です。ロシアのヤリス中古車需要、輸出、買取価格を表すものではありません。車名は派生モデルを含む場合があります。','ry-muted'));
    const history=make('div',undefined,'ry-history');
    const max=Math.max(1,...view.japanNewSales.map(x=>x.value));
    for(const y of view.japanNewSales){
      const item=make('div',undefined,'ry-year');
      item.append(make('span',String(y.year)+'年'),make('div',undefined,'ry-track'));
      const bar=make('div',undefined,'ry-fill');bar.style.width=(100*y.value/max).toFixed(1)+'%';
      item.children[1].append(bar);
      const end=make('span',num(y.value)+'台 '+(y.source_type==='official'?'公式原典':'二次資料'));
      item.append(end);history.append(item);
    }
    host.append(history);
    const refs=make('p','年次データの出典：','ry-muted');
    view.japanNewSales.forEach(y=>{addLink(refs,String(y.year)+'年',y.source_url);refs.append(document.createTextNode('　'))});
    host.append(refs);
    host.append(make('h4','ロシア × ヤリス｜車種別需要の確認状況'));
    if(view.manualNotes.length===0){
      host.append(make('p','輸出台数の車種別確定値は取得していません。利用許諾の確認できた車種別数値も未登録です。国別の増加からヤリスが人気と判定しません。','ry-warning'));
    }else{
      host.append(make('p','以下は端末内の本人入力記録（未検証）。公的な車種別統計に昇格させません。','ry-warning'));
      view.manualNotes.slice(0,8).forEach(n=>{
        const line=make('p',n.period+'　'+num(n.current)+'台／前年同月 '+num(n.previous)+'台　［'+n.scope+'］　','ry-note');
        addLink(line,'原典を開く',n.source_url);host.append(line);
      });
    }
    host.append(make('h4','公的統計・規制の参照先'));
    const links=make('ul',undefined,'ry-source-list');
    for(const s of view.links){const li=make('li');addLink(li,s.label,s.url);links.append(li)}
    host.append(links);
    host.append(make('p','1,900cc超のガソリン／ディーゼル車、HV、PHEV、EV等には対ロ輸出規制があります。ヤリスでもエンジン方式・仕様・取引条件により該非が異なります。輸出可否は現行法令で個別確認してください。','ry-muted'));
  }
  async function readJson(url){
    const response=await(root.MDOffline?.read?root.MDOffline.read(url,{cache:'no-store'}):fetch(url,{cache:'no-store'}));
    if(!response.ok)throw Error('HTTP '+response.status+': '+url);
    return response.json();
  }
  async function refresh(){
    const status=$('russia-yaris-status');
    status.textContent='統計ソースを確認中…';
    try{
      const [a,b,c]=await Promise.all([readJson(DATA),readJson(EXPORTS),readJson(ANNUAL)]);
      let raw='';
      try{raw=localStorage.getItem(NOTES_KEY)||''}catch{raw=''}
      const view=buildView(a,b,c,raw);paint(view);
      status.textContent='取得済みの公表資料と端末記録を表示しました。ヤリスの対ロ実輸出台数は未取得です。';
    }catch(err){status.textContent='データを取得できません：'+err.message+'。原典リンクを確認してください。'}
  }
  $('russia-yaris-refresh').addEventListener('click',refresh);
  $('russia-yaris-add-note').addEventListener('click',()=>{
    const panel=$('crossborder-panel');
    panel.open=true;
    const entry=panel.querySelector('details');if(entry)entry.open=true;
    $('crossborder-note-make').value='トヨタ';
    $('crossborder-note-model').value='ヤリス';
    $('crossborder-note-country').value='ロシア';
    panel.scrollIntoView({behavior:'smooth',block:'start'});
  });
  refresh();
})(typeof window==='undefined'?globalThis:window);
