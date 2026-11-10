/* Public-source health display; read-only and safe for the iPhone's stored records. */
(function(root){
'use strict';
const $=id=>document.getElementById(id),panel=$('public-refresh');
if(!panel)return;
const list=$('public-refresh-list'),summary=$('public-refresh-summary'),button=$('public-refresh-check');
const labels={ok:'取得成功',available:'保存済み',delayed:'更新遅れ',failed:'取得失敗',unavailable:'未取得',setup_required:'API設定待ち',manual:'手動管理',unknown:'日時不明'};
const colors={ok:'healthy',available:'healthy',delayed:'warning',failed:'error',unavailable:'warning',setup_required:'warning',manual:'manual',unknown:'manual'};
let lastCheck=0,loading=false;
function japan(value){
 if(typeof value!=='string')return '記録なし';
 const dt=new Date(value);
 return Number.isFinite(dt.getTime())?dt.toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}):'記録なし';
}
function render(data,offline){
 if(!data||data.schema_version!==1||!Array.isArray(data.sources))throw Error('更新管理データが不正です');
 list.replaceChildren();
 const automatic=data.sources.filter(x=>x.mode==='automatic');
 const issues=automatic.filter(x=>['delayed','failed','unavailable','setup_required'].includes(x.state));
 summary.textContent=automatic.length+'系統を自動監視 · 注意事項 '+issues.length+'件 · 手動管理 '+(data.sources.length-automatic.length)+'件。'+
   (data.generated_at_utc?'最終集計：'+japan(data.generated_at_utc):'自動巡回は初回実行待ち。')+(offline?' オフライン表示中。':'');
 const ranks={failed:0,delayed:1,unavailable:2,setup_required:3,unknown:4,available:5,ok:6,manual:7};
 for(const item of data.sources.slice().sort((a,b)=>(ranks[a.state]??8)-(ranks[b.state]??8))){
  const article=document.createElement('article');article.className='public-refresh-item';
  const head=document.createElement('div');head.className='public-refresh-item-head';
  const title=document.createElement('strong');title.textContent=String(item.title||item.id||'データ');
  const badge=document.createElement('span');badge.className='public-refresh-state '+(colors[item.state]||'manual');badge.textContent=labels[item.state]||'要確認';
  head.append(title,badge);article.appendChild(head);
  const meta=document.createElement('p');meta.className='public-refresh-meta';
  const bits=[];
  if(item.latest_month)bits.push('対象 '+item.latest_month);
  if(item.source_checked_at_utc)bits.push('最終データ確認 '+japan(item.source_checked_at_utc));
  if(item.mode==='automatic')bits.push('巡回 '+({daily:'毎日',weekly:'週1回',monthly:'月1回'}[item.cadence]||'設定済み'));
  meta.textContent=bits.join(' · ')||'確認日時の記録なし';article.appendChild(meta);
  if(item.message && item.state!=='ok' && item.state!=='available'){
   const note=document.createElement('p');note.className='public-refresh-note';note.textContent=String(item.message).slice(0,240);article.appendChild(note);
  }
  if(typeof item.source_url==='string'&&/^https:\/\//.test(item.source_url)){
   const a=document.createElement('a');a.href=item.source_url;a.target='_blank';a.rel='noopener noreferrer';a.className='public-refresh-link';a.textContent='公式出典を開く';article.appendChild(a);
  }
  list.appendChild(article);
 }
}
async function check(){
 if(loading)return;
 loading=true;button.disabled=true;
 try{
  const reader=root.MDOffline&&root.MDOffline.read?root.MDOffline.read:fetch;
  const res=await reader('./data/refresh_status.json?refresh='+Date.now(),{cache:'no-store'});
  if(!res.ok)throw Error('HTTP '+res.status);
  render(await res.json(),navigator.onLine===false);
 }catch(e){
  summary.textContent='更新状況を確認できません。公開データの取得と端末の車両データは独立しています。';
  console.warn('Public source status:',e);
 }finally{lastCheck=Date.now();loading=false;button.disabled=false;}
}
function refresh(){
 check();
 // Only buttons that re-read published public data, never personal-data delete/import buttons.
 const safe=['uss-reload','model-sales-reload','registered-sales-reload','prefecture-jobs-reload','migration-reload','regional-jobs-reload','kei-history-refresh','registered-history-refresh','demand-refresh','russia-yaris-refresh'];
 for(const id of safe){const b=$(id);if(b&&!b.disabled)b.click();}
}
button.addEventListener('click',refresh);
root.addEventListener('online',()=>{if(Date.now()-lastCheck>60*1000)refresh();});
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible'&&Date.now()-lastCheck>20*60*1000)refresh();});
check();
})(window);
