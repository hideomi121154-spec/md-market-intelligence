/* MD MARKET v3.7: repair/maintenance evidence -> illustrative MD bid ceiling.
   No IDOM internal data, personal records or actual incidence data is embedded. */
'use strict';
(function(root){
const KEY='md-market-repair-cohorts-v1',KIND='md_market_repair_cohorts',MAX=200;
const clean=v=>String(v??'').normalize('NFKC').trim().replace(/\s+/g,' ');
const normalized=v=>clean(v).toLowerCase().replace(/[ 　・‐−－-]/g,'');
const modelCode=v=>clean(v).toUpperCase().replace(/\s/g,'').replace(/^[A-Z0-9]{2,4}-/,'');
function amount(value,label,max,allowEmpty=false){
 if(allowEmpty&&(value===''||value===null||value===undefined))return null;
 if(value===''||value===null||value===undefined||typeof value==='boolean'||
    !Number.isSafeInteger(Number(value))||Number(value)<0||Number(value)>max)
  throw Error(label+'は0〜'+max.toLocaleString('ja-JP')+'の整数を入力してください');
 return Number(value);
}
function href(text){
 const value=clean(text);if(!value)return '';
 try{const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||!u.hostname)throw Error();
  return u.href;}catch{throw Error('出典URLは有効なHTTP/HTTPS形式にしてください');}
}
function dateValid(s){
 return /^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+'T12:00:00Z'))&&
 new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
}
function validateRow(raw){
 if(!raw||typeof raw!=='object')throw Error('記録の形式が不正です');
 const r={
  id:clean(raw.id),make:clean(raw.make),model:clean(raw.model),code:modelCode(raw.code),
  year_min:amount(raw.year_min,'年式開始',2100),year_max:amount(raw.year_max,'年式終了',2100),
  mileage_min:amount(raw.mileage_min,'走行距離下限',2000000),
  mileage_max:amount(raw.mileage_max,'走行距離上限',2000000),
  component:clean(raw.component),evidence_type:clean(raw.evidence_type),
  inspected:amount(raw.inspected,'対象車両数',1000000,true),
  affected:amount(raw.affected,'故障確認車両数',1000000,true),
  assumed_rate_pct:raw.assumed_rate_pct===''||raw.assumed_rate_pct==null?null:Number(raw.assumed_rate_pct),
  repair_cost_jpy:amount(raw.repair_cost_jpy,'1件あたり追加整備費',5000000),
  source_label:clean(raw.source_label),source_url:href(raw.source_url),
  as_of:clean(raw.as_of),notes:clean(raw.notes)
 };
 if(!r.id||r.id.length>100||!r.make||r.make.length>50||!r.model||r.model.length>80)throw Error('ID・メーカー・車種を確認してください');
 if(!r.code||r.code.length>30||!/^[A-Z0-9-]+$/.test(r.code))throw Error('型式を入力してください（E12とHE12は別扱い）');
 if(r.year_min<1980||r.year_min>r.year_max)throw Error('対象年式の範囲が不正です');
 if(r.mileage_min>r.mileage_max)throw Error('走行距離の範囲が不正です');
 if(!r.component||r.component.length>100||!r.source_label||r.source_label.length>160||r.notes.length>500)throw Error('故障部位・情報源・メモを確認してください');
 if(!dateValid(r.as_of))throw Error('集計日を実在する日付で入力してください');
 if(!['cohort','assumption'].includes(r.evidence_type))throw Error('根拠の区分が不正です');
 if(r.evidence_type==='cohort'){
  if(!r.inspected||r.affected===null||r.affected>r.inspected)throw Error('集計は対象車両数と故障確認車両数を入力してください');
  if(r.assumed_rate_pct!==null)throw Error('実績集計に仮定の確率を混ぜないでください');
 }else{
  if(r.inspected!==null||r.affected!==null)throw Error('仮定シナリオに実績の母数を混ぜないでください');
  if(r.assumed_rate_pct===null||!Number.isFinite(r.assumed_rate_pct)||r.assumed_rate_pct<0||r.assumed_rate_pct>100)
   throw Error('仮定の発生割合は0〜100%で入力してください');
 }
 return r;
}
function validate(rows){
 if(!Array.isArray(rows)||rows.length>MAX)throw Error('修理根拠データは最大200件です');
 const ids=new Set();
 return rows.map(raw=>{const r=validateRow(raw);if(ids.has(r.id))throw Error('記録IDの重複があります');ids.add(r.id);return r});
}
function backup(rows){return JSON.stringify({kind:KIND,schema_version:1,rows:validate(rows)},null,2)}
function parseBackup(raw){
 let doc;
 try{doc=JSON.parse(raw)}catch{throw Error('JSON形式を確認してください')}
 if(!doc||doc.kind!==KIND||doc.schema_version!==1)throw Error('修理根拠データのJSONではありません');
 return validate(doc.rows);
}
function merge(old,added){
 const a=validate(old),b=validate(added),map=new Map(a.map(x=>[x.id,x]));
 for(const r of b){const prev=map.get(r.id);if(prev&&JSON.stringify(prev)!==JSON.stringify(r))throw Error('同一IDで内容が異なる記録は上書きしません');
  if(!prev)map.set(r.id,r);
 }
 return validate([...map.values()]);
}
function vehicleInput(v){
 if(!v)throw Error('対象車両を入力してください');
 const make=clean(v.make),model=clean(v.model),code=modelCode(v.code);
 const year=amount(v.year,'対象年式',2100),mileage=amount(v.mileage,'対象走行距離',2000000);
 if(!make||!model||!code||year<1980)throw Error('メーカー・車名・型式・年式を入力してください');
 return {make,model,code,year,mileage};
}
function match(row,v){
 return normalized(row.make)===normalized(v.make)&&normalized(row.model)===normalized(v.model)&&
 row.code===v.code&&v.year>=row.year_min&&v.year<=row.year_max&&v.mileage>=row.mileage_min&&v.mileage<=row.mileage_max;
}
function study(rows,vehicle,coveredBudget,valuation,calculateValues){
 const v=vehicleInput(vehicle),safe=validate(rows);
 if(!valuation||typeof calculateValues!=='function')throw Error('仕入れ上限計算の入力が不足しています');
 const base=calculateValues(valuation);
 const covered=amount(coveredBudget,'既に計上した整備費',5000000);
 if(covered>Number(valuation.recondition)+Number(valuation.reserve))throw Error('既に計上した整備費が、元の整備費＋リスク予備費を超えています');
 const matching=safe.filter(r=>match(r,v));
 const taken=new Set(),lines=[];let raw=0;
 for(const r of matching){
  const k=normalized(r.component);
  if(taken.has(k))throw Error('同じ故障部位に複数の該当記録があります。重複計上を避けるため対象範囲を整理してください：'+r.component);
  taken.add(k);
  const rate=r.evidence_type==='cohort'?r.affected/r.inspected:r.assumed_rate_pct/100;
  const expected=rate*r.repair_cost_jpy;
  raw+=expected;
  lines.push({...r,rate,expected,warning:r.evidence_type==='assumption'?'発生割合は入力者の仮定です':r.inspected<30?'母数が30台未満の参考集計です':'対象母数と診断件数は入力者の申告です'});
 }
 const gross=Math.ceil(raw),additional=Math.max(0,gross-covered);
 return {vehicle:v,matching:lines,unadjustedCeiling:base.conservativeCeiling,
  adjustedCeiling:base.conservativeCeiling-additional,
  baseCeiling:base.baseCeiling,rawExpectedCost:gross,coveredBudget:covered,additionalCost:additional,
  revisedProfitAtBid:base.expectedProfitAtBid-additional,
  targetProfit:valuation.profit,bid:valuation.bid,
  hasData:lines.length>0,
  containsAssumptions:lines.some(x=>x.evidence_type==='assumption'),
  qualifies:lines.length>0&&lines.every(x=>x.evidence_type==='cohort'&&x.inspected>=30)};
}
const API={KEY,KIND,MAX,modelCode,validateRow,validate,merge,backup,parseBackup,vehicleInput,match,study};
if(typeof module==='object'&&module.exports)module.exports=API;
root.MDRepair=API;
if(typeof document==='undefined')return;
const $=id=>document.getElementById(id),panel=$('repair-md-panel');
if(!panel)return;
let rows=[],storageHealthy=true;
const status=$('repair-md-status'),table=$('repair-md-records'),currency=n=>Math.round(n).toLocaleString('ja-JP')+'円';
const el=(tag,cls,txt)=>{const x=document.createElement(tag);if(cls)x.className=cls;if(txt!==undefined)x.textContent=txt;return x};
const message=txt=>{status.textContent=txt};
function load(){
 try{const raw=localStorage.getItem(KEY);rows=raw?parseBackup(raw):[]}
 catch(e){storageHealthy=false;rows=[];message('既存保存データを読み取れません。上書きを防止するため保存と復元を停止しました：'+e.message)}
 if(!storageHealthy){$('repair-md-save').disabled=true;$('repair-md-import').disabled=true;$('repair-md-example').disabled=true}
}
function persist(next){
 if(!storageHealthy)throw Error('保存領域が不正なため書き込みを停止しています');
 const valid=validate(next);
 localStorage.setItem(KEY,backup(valid));
 rows=valid;renderRecords();renderStudy();
}
function rowFromForm(){
 const val=id=>$(id).value;
 return validateRow({id:typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random(),
  make:val('repair-md-make'),model:val('repair-md-model'),code:val('repair-md-code'),
  year_min:val('repair-md-year-min'),year_max:val('repair-md-year-max'),
  mileage_min:val('repair-md-mile-min'),mileage_max:val('repair-md-mile-max'),
  component:val('repair-md-component'),evidence_type:val('repair-md-kind'),
  inspected:val('repair-md-kind')==='cohort'?val('repair-md-inspected'):'',
  affected:val('repair-md-kind')==='cohort'?val('repair-md-affected'):'',
  assumed_rate_pct:val('repair-md-kind')==='assumption'?val('repair-md-rate'):'',
  repair_cost_jpy:val('repair-md-cost'),source_label:val('repair-md-source'),
  source_url:val('repair-md-url'),as_of:val('repair-md-date'),notes:val('repair-md-notes')
 });
}
function renderRecords(){
 table.replaceChildren();
 $('repair-md-count').textContent='端末内の根拠データ：'+rows.length+'件（最大200件）';
 if(!rows.length){table.append(el('p','repair-md-muted','まだ根拠データはありません。架空の入力例も自動保存されません。'));return}
 for(const r of rows.slice().reverse()){
  const card=el('article','repair-md-record');
  card.append(el('strong',null,r.make+' '+r.model+' / '+r.code+'｜'+r.component));
  card.append(el('p','repair-md-muted',r.year_min+'〜'+r.year_max+'年式・'+r.mileage_min.toLocaleString('ja-JP')+'〜'+r.mileage_max.toLocaleString('ja-JP')+'km'));
  card.append(el('p','repair-md-muted',r.evidence_type==='cohort'?'実績集計（自己申告）：'+r.affected+'/'+r.inspected+'台':'仮定シナリオ：'+r.assumed_rate_pct+'%'));
  card.append(el('p','repair-md-muted','1件あたり追加修理費 '+currency(r.repair_cost_jpy)+'／情報源：'+r.source_label+'／集計日：'+r.as_of));
  if(r.notes)card.append(el('p','repair-md-muted',r.notes));
  if(r.source_url){const a=el('a','fault-link','入力された出典を開く');a.href=r.source_url;a.target='_blank';a.rel='noopener noreferrer';card.append(a)}
  const b=el('button','button ghost','この記録を削除');b.type='button';
  b.addEventListener('click',()=>{if(!confirm('この修理根拠データを1件削除しますか？'))return;
   try{persist(rows.filter(x=>x.id!==r.id));message('1件削除しました')}catch(e){message(e.message)}});
  card.append(b);table.append(card);
 }
}
function readValuation(){
 const out={};for(const k of Object.keys(root.MDValuation?.DEFAULTS||{})){
  const node=$('valuation-'+k);if(!node||node.value==='')throw Error('上の仕入れ上限入力をすべて記入してください');
  out[k]=Number(node.value);
 }return out;
}
function renderStudy(){
 const target=$('repair-md-analysis'),out=$('repair-md-output');
 try{
  const res=study(rows,{make:$('repair-md-filter-make').value,model:$('repair-md-filter-model').value,
   code:$('repair-md-filter-code').value,year:$('repair-md-filter-year').value,
   mileage:$('repair-md-filter-mileage').value},$('repair-md-coverage').value,readValuation(),root.MDValuation?.calculateValues);
  target.hidden=false;out.replaceChildren();
  const grid=el('div','repair-md-metrics');
  const metric=(label,value)=>{const c=el('div','repair-md-metric');c.append(el('small',null,label),el('strong',null,value));return c};
  grid.append(metric('現行の慎重仕入れ上限',currency(res.unadjustedCeiling)),
   metric('追加修理リスク（未計上分）',currency(res.additionalCost)),
   metric('修理リスクを加味した計算上の上限',currency(res.adjustedCeiling)),
   metric('候補入札額での想定利益',currency(res.revisedProfitAtBid)));
  out.append(grid);
  if(!res.hasData){
   out.append(el('p','repair-md-alert','該当する型式・年式・距離の集計はありません。上の数値は追加修理リスクを0円と仮置きしたもので、整備リスクがゼロという意味ではありません。'));
  }else{
   const ul=el('ul','repair-md-list');
   for(const a of res.matching){
    const li=el('li',null,a.component+'：'+(a.rate*100).toFixed(1)+'% × '+currency(a.repair_cost_jpy)
      +' ＝ '+currency(a.expected)+'／'+a.warning);ul.append(li)
   }
   out.append(ul);
   out.append(el('p','repair-md-muted','期待費用合計 '+currency(res.rawExpectedCost)+' − 既存の整備・予備費のうち対応済み '+currency(res.coveredBudget)+' ＝ 追加リスク '+currency(res.additionalCost)+'。'));
   if(!res.qualifies)out.append(el('p','repair-md-alert','仮定データまたは母数が小さい集計を含みます。実績に基づく発生率の予測や仕入れ承認には使わないでください。'));
   else out.append(el('p','repair-md-muted','母数30台以上の実績集計として入力されています。ただし入力者の主張を独立検証したものではありません。'));
  }
  out.append(el('p','repair-md-muted','故障率は車種全体の故障率ではなく、入力された対象範囲・期間・部位の自己申告値です。すでに計上した費用の重複控除、複数部位の重複費用、保障・税・実車状態は別途確認してください。既存の仕入れ計算欄は変更しません。'));
 }catch(e){
  target.hidden=false;out.replaceChildren(el('p','repair-md-alert','試算できません：'+e.message));
 }
}
function toggleEvidence(){
 const isCohort=$('repair-md-kind').value==='cohort';
 $('repair-md-cohort-fields').hidden=!isCohort;$('repair-md-assumption-fields').hidden=isCohort;
}
load();renderRecords();toggleEvidence();renderStudy();
$('repair-md-kind').addEventListener('change',toggleEvidence);
$('repair-md-form').addEventListener('submit',e=>{e.preventDefault();try{persist(merge(rows,[rowFromForm()]));message('根拠データ1件を端末内に保存しました。実績の事実確認は入力者の責任です。')}
 catch(err){message('保存できません：'+err.message)}});
for(const id of ['repair-md-filter-make','repair-md-filter-model','repair-md-filter-code','repair-md-filter-year','repair-md-filter-mileage','repair-md-coverage',...Object.keys(root.MDValuation?.DEFAULTS||{}).map(x=>'valuation-'+x)]){
 $(id)?.addEventListener('input',renderStudy);
}
$('valuation-reset')?.addEventListener('click',()=>queueMicrotask(renderStudy));
$('repair-md-example').addEventListener('click',()=>{
 $('repair-md-make').value='トヨタ';$('repair-md-model').value='ヤリス';$('repair-md-code').value='KSP210';
 $('repair-md-year-min').value='2022';$('repair-md-year-max').value='2025';
 $('repair-md-mile-min').value='0';$('repair-md-mile-max').value='80000';
 $('repair-md-component').value='エアコン';$('repair-md-kind').value='assumption';toggleEvidence();
 $('repair-md-inspected').value='';$('repair-md-affected').value='';$('repair-md-rate').value='8';
 $('repair-md-cost').value='60000';$('repair-md-source').value='仮定のテストデータ（実績ではありません）';
 $('repair-md-url').value='';$('repair-md-date').value='2026-11-01';
 $('repair-md-notes').value='説明用の架空値。実車の故障率や車種固有の弱点を示すものではありません。';
 $('repair-md-filter-make').value='トヨタ';$('repair-md-filter-model').value='ヤリス';
 $('repair-md-filter-code').value='KSP210';$('repair-md-filter-year').value='2024';$('repair-md-filter-mileage').value='30000';
 renderStudy();message('架空のヤリスの入力例を表示しました。保存していません。');
});
$('repair-md-export').addEventListener('click',()=>{
 $('repair-md-json').value=backup(rows);$('repair-md-json').focus();$('repair-md-json').select();
 message(rows.length+'件のJSONを表示しました。コピーして外部に保管してください。自動で共有・送信はしません。');
});
$('repair-md-import').addEventListener('click',()=>{
 try{const added=parseBackup($('repair-md-json').value),before=rows.length;persist(merge(rows,added));
 message('追加復元：'+(rows.length-before)+'件。既存の異なるIDは上書きしていません。');}
 catch(e){message('復元失敗：'+e.message)}
});
})(typeof window==='undefined'?globalThis:window);
