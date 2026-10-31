/* MD MARKET v2.4.0 — read-only source quality gate for inventory observations.
   No inferred sales, automated scraping, or modification of stored records. */
'use strict';
(function(root){
const INV_KEY='md-market-inventory-snapshots-v1';
const OUTAGE={start:'2026-10-17',end:'2026-10-22',notice:'https://www.carsensor.net/'};
const ALTERNATIVES=Object.freeze([
 {name:'グーネット 全国人気中古車ランキング',url:'https://www.goo-net.com/ranking/',definition:'全国・月間アクセス数に基づく順位。売約台数ではありません。'},
 {name:'carview! 人気中古車ランキング',url:'https://ucar.carview.yahoo.co.jp/ranking/body/ALL/',definition:'掲載車両へのアクセス順位・平均車両本体価格。成約価格・支払総額ではありません。'}
]);
const days=(a,b)=>Math.round((Date.parse(a+'T12:00:00Z')-Date.parse(b+'T12:00:00Z'))/86400000);
const canon=s=>String(s||'').normalize('NFKC').trim().toUpperCase().replace(/[\s\u3000\u2010-\u2015\u2212\u30fc＿_\-]/g,'');
const maker=m=>({'NISSAN':'日産','TOYOTA':'トヨタ','HONDA':'ホンダ','SUZUKI':'スズキ','DAIHATSU':'ダイハツ','MAZDA':'マツダ','SUBARU':'スバル'})[canon(m)]||canon(m);
function carsensorUrl(url){
 try{const host=new URL(url).hostname.toLowerCase();return host==='carsensor.net'||host.endsWith('.carsensor.net')}
 catch{return false}
}
function outageOverlap(previous,latest,source){
 return carsensorUrl(source)&&!!previous&&previous<=OUTAGE.end&&latest>=OUTAGE.start;
}
function rankingReference(snapshotData,entry,asOf){
 if(!snapshotData||!Array.isArray(snapshotData.snapshots))return [];
 const months=[...new Set(snapshotData.snapshots.map(s=>s.month)
  .filter(m=>/^20\d{2}-(0[1-9]|1[0-2])$/.test(m)&&m<=asOf.slice(0,7)))].sort().reverse();
 const month=months[0];if(!month)return [];
 const last=month+'-'+new Date(Number(month.slice(0,4)),Number(month.slice(5)),0).getDate();
 if(days(asOf,last)>65||days(asOf,last)<0)return [];
 return snapshotData.snapshots.filter(s=>s.month===month&&s.scope==='national'&&Array.isArray(s.models)
   &&['carsensor','goonet'].includes(s.platform)).flatMap(s=>{
    const item=s.models.find(m=>maker(m.make)===maker(entry.make)&&canon(m.model)===canon(entry.model));
    return item&&Number.isInteger(item.rank)&&item.rank>=1&&item.rank<=10?
     [{platform:s.platform,rank:item.rank,month,source:s.source_url}]:[];
 });
}
function assess(observations,snapshotData,asOf){
 if(!root.MDInventory)throw Error('在庫観測の検証処理が見つかりません');
 if(!root.MDInventory.validDate(asOf))throw Error('確認日が不正です');
 const rows=root.MDInventory.validateRows(observations),groups=new Map();
 for(const x of rows){
  if(x.date>asOf)continue;
  const key=root.MDInventory.seriesKey(x);
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(x);
 }
 const result=[];
 for(const [key,group] of groups){
  const sorted=group.slice().sort((a,b)=>a.date.localeCompare(b.date));
  const last=sorted.at(-1),prev=sorted.at(-2)||null,age=days(asOf,last.date),gap=prev?days(last.date,prev.date):null;
  const interrupted=outageOverlap(prev?.date,last.date,last.source_url);
  const stale=age>30,tooFar=gap!==null&&gap>45;
  const postDisruption=carsensorUrl(last.source_url)&&last.date>OUTAGE.end;
  let status='比較可能',reason='同じメーカー・車種・地域・グレード・色・検索条件・参照URLの観測のみを比較';
  if(!prev){status='追加観測待ち';reason='同一条件の2回目の観測がない';}
  else if(stale){status='再観測が必要';reason='最終観測から30日以上が経過';}
  else if(tooFar){status='再観測が必要';reason='観測間隔が45日超で、短期変化を判断できない';}
  else if(interrupted){status='停止期間をまたぐ比較不可';reason='カーセンサーの2026年10月17〜22日の停止期間を観測期間が横断。掲載情報の更新遅延も考慮';}
  else if(postDisruption){status='掲載更新の再確認';reason='再開後も掲載在庫・価格の反映遅延があり得る。原サイトでデータ更新状況を確認';}
  const percent=prev&&prev.count>0?100*(last.count-prev.count)/prev.count:null;
  const numericAllowed=!!prev&&!stale&&!tooFar&&!interrupted&&gap>=1;
  const demand=rankingReference(snapshotData,last,asOf);
  result.push({key,make:last.make,model:last.model,region:last.region,grade:last.grade,color:last.color,
    conditions:last.conditions,sourceUrl:last.source_url,count:last.count,date:last.date,previousCount:prev?.count??null,
    previousDate:prev?.date??null,age,gap,delta:numericAllowed?last.count-prev.count:null,
    percent:numericAllowed?percent:null,status,reason,interrupted,postDisruption,demand,observationCount:sorted.length,
    isComparable:status==='比較可能'&&numericAllowed});
 }
 const priority={'停止期間をまたぐ比較不可':0,'再観測が必要':1,'掲載更新の再確認':2,'追加観測待ち':3,'比較可能':4};
 result.sort((a,b)=>(priority[a.status]-priority[b.status])||b.date.localeCompare(a.date)||a.model.localeCompare(b.model,'ja'));
 return result;
}
const API={INV_KEY,OUTAGE,ALTERNATIVES,carsensorUrl,outageOverlap,rankingReference,assess};
if(typeof module==='object'&&module.exports)module.exports=API;
root.MDWatch=API;
if(typeof document==='undefined')return;
const $=id=>document.getElementById(id),panel=$('observation-watch-panel');
if(!panel)return;
const table=$('observation-watch-rows'),summary=$('observation-watch-summary'),status=$('observation-watch-status');
const select=$('observation-watch-filter');let ranking=null,rankError='';
const dateToday=()=>{const d=new Date(),p=x=>String(x).padStart(2,'0');return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());};
function el(tag,text){const x=document.createElement(tag);if(text!==undefined)x.textContent=text;return x;}
function link(label,url){const a=el('a',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}
async function loadRanking(){
 try{const res=await root.MDOffline.read('./data/demand_rankings.json',{cache:'no-store'});
  if(!res.ok)throw Error('HTTP '+res.status);
  const obj=await res.json();if(obj.schema_version!==1||!Array.isArray(obj.snapshots))throw Error('不正な順位形式');
  ranking=obj;rankError='';
 }catch(e){ranking=null;rankError=e.message;}
}
function render(){
 try{
  const raw=localStorage.getItem(INV_KEY)||'[]',data=JSON.parse(raw);
  const all=assess(data,ranking,dateToday()),rows=select.value==='all'?all:all.filter(x=>x.status!=='比較可能');
  summary.textContent=all.length+'条件のうち、確認・追加観測が必要：'+all.filter(x=>x.status!=='比較可能').length+'条件、比較可能：'+all.filter(x=>x.isComparable).length+'条件。順位は全国指標の参考で、販売台数ではありません。';
  table.replaceChildren();
  if(!rows.length){const tr=el('tr'),td=el('td',all.length?'表示対象はありません。':'観測記録がありません。上の掲載台数ノートに同じ条件で2回記録してください。');td.colSpan=5;tr.append(td);table.append(tr);}
  for(const r of rows){
   const tr=el('tr'),name=el('td'),title=el('strong',r.make+' '+r.model);
   name.append(title,el('div',r.region+' / '+(r.grade||'グレード未指定')+' / '+(r.color||'色未指定')),
      el('div',r.date+' / '+r.count.toLocaleString('ja-JP')+'台'),link('観測元',r.sourceUrl));
   const badge=el('td',r.status);
   const move=el('td',r.delta===null?'比較保留':(r.delta>=0?'+':'')+r.delta.toLocaleString('ja-JP')+'台'+(r.percent===null?'（前回0台）':' / '+(r.percent>=0?'+':'')+r.percent.toFixed(1)+'%'));
   const demand=el('td',r.demand.length?r.demand.map(x=>(x.platform==='carsensor'?'カーセンサー':'グーネット')+'全国'+x.rank+'位（'+x.month+'）').join('、'):'該当する最近の全国順位は未収録');
   const why=el('td',r.reason);
   tr.append(name,badge,move,demand,why);table.append(tr);
  }
  status.textContent=rankError?'ランキングは取得できませんでした。掲載台数の点検だけを表示：'+rankError
   :'端末の観測記録を読み取って表示。自動スクレイピング、データ削除、仕入れ推奨は行いません。';
 }catch(err){
  table.replaceChildren();summary.textContent='観測データを安全に読み取れません。';
  status.textContent='記録の内容を確認してください。元の保存データは変更していません：'+err.message;
 }
}
const alternatives=$('observation-watch-alternatives');
for(const a of ALTERNATIVES){const li=el('li');li.append(link(a.name,a.url),el('div',a.definition));alternatives.append(li);}
select.addEventListener('change',render);
$('observation-watch-refresh').addEventListener('click',async()=>{await loadRanking();render();});
window.addEventListener('md-inventory-updated',render);
(async()=>{await loadRanking();render();})();
})(typeof window==='undefined'?globalThis:window);
