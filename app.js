/* MD MARKET PWA UI – all data stays in this browser's IndexedDB. */
'use strict';
const $=id=>document.getElementById(id);
const fmt=n=>n==null?'—': '¥'+Number(n).toLocaleString('ja-JP',{maximumFractionDigits:0});
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const marketName={dealer_auction:'業者間AA',consumer_auction:'消費者向けAA',unspecified_auction:'AA種別未特定',retail_listing:'小売掲載'};
const titles={overview:['中古車市場の現在地','実際の取引データを、出典と市場区分を分けて分析'],records:['車両データ検索','車種・年式・走行距離・価格を確認'],import:['データを管理','CSVまたは貼り付けで登録・バックアップ'],plan:['開発ロードマップ','短期・中期・長期分析へ段階的に拡張']};
let records=[],visible=[],shown=0,audits=new Map(),reviewingId=null;const PAGE_SIZE=20;
const auditState=r=>audits.get(r.id)?.status||'unverified';
const auditLabel=r=>auditState(r)==='user_checked'?'原本照合（自己申告）':auditState(r)==='flagged'?'要確認・問題あり':'未検証';
function currentFilters(){return {make:$('make').value.trim(),model:$('model').value.trim(),grade:$('grade').value.trim(),yearMin:$('year-min').value.trim(),yearMax:$('year-max').value.trim(),mileageMax:$('mileage-max').value.trim(),color:$('color').value,equipment:$('equipment').value.trim(),channel:$('channel').value,market:$('market').value}}
function switchTab(){const hash=location.hash.substring(1);const tab=Object.hasOwn(titles,hash)?hash:'overview';for(const s of document.querySelectorAll('section.screen'))s.classList.toggle('active',s.id===tab);for(const a of document.querySelectorAll('nav a[data-tab]')){const on=a.dataset.tab===tab;a.classList.toggle('active',on);if(on)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current')}const title=titles[tab];$('page-title').textContent=title[0];$('page-subtitle').textContent=title[1];window.scrollTo({top:0,behavior:'instant'})}
function showChart(data){const root=$('trend');if(data.length===0){root.innerHTML='<span>条件に一致する月次データはありません</span>';return;}const w=620,h=260,pad=42;const values=data.map(d=>d.median_price_jpy/10000);let min=Math.min(...values),max=Math.max(...values);if(max===min){min=Math.max(0,min*.9);max=max*1.1+1}else{const p=(max-min)*.12;min=Math.max(0,min-p);max+=p}const pts=values.map((v,i)=>({x:pad+(w-pad*2)*(data.length===1?.5:i/(data.length-1)),y:h-pad-(h-pad*2)*(v-min)/(max-min)}));let s=`<svg viewBox="0 0 ${w} ${h}" role="img" aria-label="月別落札または掲載価格の中央値"><line x1="${pad}" x2="${w-pad}" y1="${h-pad}" y2="${h-pad}" stroke="#486280"/><text x="4" y="28" fill="#9fbed6" font-size="12">${max.toFixed(1)}万</text><text x="4" y="${h-pad}" fill="#9fbed6" font-size="12">${min.toFixed(1)}万</text><polyline fill="none" stroke="#28d1bd" stroke-width="3" points="${pts.map(p=>p.x+','+p.y).join(' ')}"/>`;for(const p of pts)s+=`<circle cx="${p.x}" cy="${p.y}" r="4" fill="#2ddac4"/>`;for(let i=0;i<pts.length;i++){if(i!==0&&i!==pts.length-1&&i%Math.max(1,Math.ceil(pts.length/4))!==0)continue;s+=`<text x="${pts[i].x}" y="${h-9}" text-anchor="middle" font-size="11" fill="#bdd0e2">${esc(data[i].month)}</text>`}s+='</svg>';root.innerHTML=s}
function renderMore(){const box=$('record-cards');const chunk=visible.slice(shown,shown+PAGE_SIZE);if(shown===0)box.textContent='';for(const r of chunk){const article=document.createElement('article');article.className='record';article.dataset.id=r.id;const url=(()=>{try{const u=new URL(r.source_url);return ['http:','https:'].includes(u.protocol)?u.href:null}catch{return null}})();article.innerHTML=`<div class="record-top"><div><div class="record-title">${esc(r.make)} ${esc(r.model)}</div><div class="record-grade">${esc(r.grade||'グレード不明')}</div></div><span class="badge ${auditState(r)==='user_checked'?'audit-reviewed':auditState(r)==='flagged'?'audit-flagged':''}">${esc(auditLabel(r))}</span></div><div class="record-price">${fmt(r.price_jpy)}</div><div class="record-meta"><span class="chip">${r.year?esc(r.year)+'年式':'年式不明'}</span><span class="chip">${r.mileage_km==null?'距離不明':Number(r.mileage_km).toLocaleString('ja-JP')+'km'}</span><span class="chip">${esc(r.color||'色不明')}</span></div><div class="record-detail">${esc(marketName[r.market_type]||'市場種別不明')} · ${esc(r.date)}<br>装備：${esc(r.equipment||'不明')}</div><div class="record-bottom"><span>${auditState(r)==='user_checked'?'利用者が原本照合を記録（第三者保証ではありません）':auditState(r)==='flagged'?'問題点を記録済み':'出典未検証'}</span>${url?`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">出典を見る ↗</a>`:'<span>出典URLなし</span>'}</div><button class="button secondary audit-review-open" type="button">原本照合を記録</button>`;box.appendChild(article)}shown+=chunk.length;const more=$('show-more');more.hidden=shown>=visible.length;more.textContent=`さらに20件表示（残り${visible.length-shown}件）`;if(visible.length===0)box.innerHTML='<p class="hint">条件に一致する車両がありません。CSVを取り込むか、検索条件を変更してください。</p>'}
function render(){const all=records;const models=new Set(all.map(r=>[MDStore.canonicalMake(r.make),MDStore.canonicalModel(r.model)].join('|')));$('count-all').textContent=all.length.toLocaleString();$('count-models').textContent=models.size.toLocaleString();$('count-auction').textContent=all.filter(r=>r.channel==='auction').length.toLocaleString();$('count-retail').textContent=all.filter(r=>r.channel==='retail').length.toLocaleString();$('coverage').textContent=`仕様記録：グレード ${all.filter(r=>r.grade).length}件、色 ${all.filter(r=>r.color).length}件、装備 ${all.filter(r=>r.equipment).length}件。未記載は「装備なし」を意味しません。`;
const checked=all.filter(r=>auditState(r)==='user_checked').length,flagged=all.filter(r=>auditState(r)==='flagged').length;
$('audit-overview').textContent=`原本照合を記録した車両 ${checked}件 ／ 問題あり ${flagged}件 ／ 未検証 ${all.length-checked-flagged}件。照合済みは利用者の申告で、独立した正確性保証ではありません。`;
const filters=currentFilters();const filtered=MDStore.filter(all,filters);
const exploratory=$('include-unverified').checked;
const priceRows=filtered.filter(r=>auditState(r)!=='flagged'&&(exploratory||auditState(r)==='user_checked'));
const summary=MDStore.summarize(priceRows);$('matching').textContent=summary.count.toLocaleString()+'件';$('median').textContent=fmt(summary.median_price_jpy);$('market-warning').textContent=(exploratory?'【未検証を含む参考表示】この数値は仕入れ判断に使用できません。 ':'【原本の自己照合記録のみ】第三者による正確性保証ではありません。 ')+(summary.mixed?'異なる取引市場が混在しています。市場区分を選択してください。':summary.count<5&&summary.count>0?'集計件数が5件未満です。信頼できる相場推定ではありません。':summary.count===0?'対象の価格がありません。':'');$('filter-caption').textContent=marketName[filters.market]||'市場を選んで分析';showChart(summary.series);
const quick=MDStore.canonicalModel($('quick-search').value.trim()).toUpperCase();visible=filtered.filter(x=>!quick||MDStore.canonicalModel(x.model).toUpperCase().includes(quick)).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,500);shown=0;$('records-caption').textContent=`${visible.length}件表示${filtered.length>500?'（先頭500件まで）':''}`;renderMore()}
async function reload(){const [all,reviewRows]=await Promise.all([MDStore.all(),MDStore.getReviews()]);records=all;audits=new Map(reviewRows.map(x=>[x.id,x]));render()}
function download(name,contents){const blob=new Blob([contents],{type:'text/csv;charset=utf-8;'});const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=name;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),3000)}
$('apply').addEventListener('click',()=>{render();location.hash='overview'});
$('channel').addEventListener('change',()=>{if($('channel').value==='retail')$('market').value='retail_listing';else if($('market').value==='retail_listing')$('market').value='';render()});
$('market').addEventListener('change',()=>{if($('market').value==='retail_listing')$('channel').value='retail';else if($('market').value)$('channel').value='auction';render()});
$('include-unverified').addEventListener('change',render);
$('search-button').addEventListener('click',render);$('quick-search').addEventListener('keydown',e=>{if(e.key==='Enter')render()});$('show-more').addEventListener('click',renderMore);
$('csv').addEventListener('change',e=>{$('filename').textContent=e.target.files[0]?.name||'ファイル未選択'});
async function importText(text,target,button){
 button.disabled=true;
 try{
  const parsed=MDStore.readRecords(text);
  if(!parsed.records.length)throw new Error('有効なデータがありません。'+parsed.errors.slice(0,3).join('\n'));
  if(!confirm(`有効な${parsed.records.length}件をこのiPhoneに保存しますか？（不正行${parsed.rejected}件）\n未検証データとして扱います。`)){target.textContent='取り込みをキャンセルしました。';return;}
  const out=await MDStore.insert(parsed.records);
  target.textContent=`${out.inserted}件を追加 / ${out.duplicates}件重複 / ${parsed.rejected}件除外${parsed.errors.length?'\n'+parsed.errors.slice(0,5).join('\n'):''}`;
  await reload();
 }catch(err){console.error(err);target.textContent='取り込みエラー：'+err.message;}
 finally{button.disabled=false;}
}
$('upload').addEventListener('click',async()=>{
 const target=$('upload-status'),file=$('csv').files[0];
 if(!file){target.textContent='CSVファイルを選択してください。';return;}
 if(file.size>5*1024*1024){target.textContent='5MB以下のCSVを選択してください。';return;}
 await importText(await file.text(),target,$('upload'));
});
$('paste-import').addEventListener('click',async()=>{
 const target=$('paste-status'),button=$('paste-import'),value=$('paste-data').value.trim();
 if(!value){target.textContent='先にChatGPTからコードをコピーして、この欄に貼り付けてください。';return;}
 button.disabled=true;
 try{
  const csv=await MDStore.decodeImportText(value);
  if(new TextEncoder().encode(csv).length>5*1024*1024)throw new Error('5MB以下のCSVを入力してください');
  await importText(csv,target,button);
  if(target.textContent.includes('件を追加'))$('paste-data').value='';
 }catch(err){console.error(err);target.textContent='貼り付けエラー：'+err.message;}
 finally{button.disabled=false;}
});
$('export').addEventListener('click',async()=>{try{const a=await MDStore.all();download(`MD_MARKET_backup_${new Date().toISOString().slice(0,10)}.csv`,MDStore.exportCSV(a));$('backup-status').textContent=`${a.length}件のCSV書き出しを開始しました。iPhoneのファイルに保存してください。`;}catch(e){$('backup-status').textContent=e.message}});
$('template').addEventListener('click',()=>{download('MD_MARKET_template.csv','date,make,model,grade,year,mileage_km,price_jpy,channel,market_type,source_url,color,equipment\r\n')});
$('audit-backup-generate').addEventListener('click',async()=>{
 const status=$('audit-backup-status');
 try{
  const json=await MDStore.exportReviewBundle();
  const area=$('audit-backup-text');area.value=json;area.focus();area.select();
  const count=JSON.parse(json).reviews.length;
  status.textContent=`${count}件の照合記録を書き出しました。選択されたテキストをコピーして、iPhoneのメモ等に保存してください。`;
 }catch(err){status.textContent='書き出しエラー：'+err.message}
});
$('audit-backup-restore').addEventListener('click',async()=>{
 const status=$('audit-backup-status'),raw=$('audit-backup-text').value.trim();
 if(!raw){status.textContent='先にバックアップ文を貼り付けてください。';return}
 if(!confirm('このiPhoneの車両データに一致する照合履歴を復元しますか？以前の照合メモが上書きされる場合があります。'))return;
 try{
  const result=await MDStore.restoreReviewBundle(raw);
  await reload();
  status.textContent=`${result.restored}件の照合記録を復元、${result.skipped}件は対象不一致・形式不適合のため除外しました。`;
 }catch(err){status.textContent='復元エラー：'+err.message}
});

$('clear').addEventListener('click',async()=>{if(!confirm('本当にこの端末の全レコードを削除しますか？バックアップがないと元に戻せません。'))return;if(!confirm('最終確認：全件削除しますか？'))return;await MDStore.clear();await reload();$('backup-status').textContent='この端末に保存していたデータを削除しました。'});

function openAuditEditor(id){
 const record=records.find(r=>r.id===id);if(!record)return;
 reviewingId=id;
 const previous=audits.get(id);
 const box=$('audit-editor');
 $('audit-target').textContent=`${record.make} ${record.model} ${record.grade||''} ／ ${record.year||'年式不明'}年式 ／ ${record.mileage_km==null?'走行距離不明':record.mileage_km+'km'} ／ ${fmt(record.price_jpy)} ／ ${record.date} ／ ${marketName[record.market_type]||'市場未特定'}`;
 const link=$('audit-source-link');link.href=record.source_url;link.textContent='出典ページを開いて原本を照合する';
 $('audit-notes').value=previous?.notes||'';
 $('audit-confirm').checked=false;
 $('audit-approve').disabled=!MDStore.eligibleForManualCheck(record);
 $('audit-editor-status').textContent=MDStore.eligibleForManualCheck(record)
  ?'元のページに実際の車両・金額・取引市場が記載されていることを確認してください。掲載価格と成約価格を混同しないでください。'
  :'このURLは例示用、またはオークション市場が未特定です。「自己照合済み」にはできません。問題ありを記録するか、情報を新規登録してください。';
 box.hidden=false;box.scrollIntoView({behavior:'smooth',block:'start'});
}
$('record-cards').addEventListener('click',e=>{
 const button=e.target.closest('button.audit-review-open');if(!button)return;
 const article=button.closest('article.record');if(article)openAuditEditor(article.dataset.id);
});
$('audit-cancel').addEventListener('click',()=>{$('audit-editor').hidden=true;reviewingId=null});
async function commitAudit(action){
 const target=$('audit-editor-status'),record=records.find(r=>r.id===reviewingId);
 if(!record){target.textContent='対象の車両が見つかりません。';return;}
 try{
  await MDStore.saveReview(record,action,$('audit-notes').value,$('audit-confirm').checked);
  await reload();
  target.textContent='照合記録を端末に保存しました。';
  $('audit-editor').hidden=true;reviewingId=null;
 }catch(err){target.textContent='保存できません：'+err.message;}
}
$('audit-approve').addEventListener('click',()=>commitAudit('user_checked'));
$('audit-flag').addEventListener('click',()=>commitAudit('flagged'));
$('audit-reset').addEventListener('click',()=>commitAudit('unverified'));

function csvCell(value){return '"'+String(value??'').replace(/"/g,'""')+'"'}
$('manual-save').addEventListener('click',async()=>{
 const target=$('manual-status'),button=$('manual-save');
 const market=$('manual-market').value;
 const channel=market==='retail_listing'?'retail':'auction';
 const fields=['date','make','model','grade','year','mileage_km','price_jpy','channel','market_type','source_url','source_name'];
 const row=[
 $('manual-date').value,$('manual-make').value,$('manual-model').value,
 $('manual-grade').value,$('manual-year').value,$('manual-mileage').value,
 $('manual-price').value,channel,market,$('manual-source-url').value,$('manual-source-name').value
 ];
 button.disabled=true;
 try{
  const csv=fields.join(',')+'\n'+row.map(csvCell).join(',')+'\n';
  const parsed=MDStore.readRecords(csv);
  if(!parsed.records.length)throw Error(parsed.errors.slice(0,4).join(' ／ ')||'入力内容が正しくありません');
  if(!confirm('この価格を未検証データとして1件登録しますか？原本を後で照合してください。'))return;
  const out=await MDStore.insert(parsed.records);
  target.textContent=out.inserted?'1件を未検証で保存しました。「車両」タブで原本照合できます。':'すでに同じ記録があります。重複登録しませんでした。';
  await reload();
 }catch(err){target.textContent='登録エラー：'+err.message}
 finally{button.disabled=false}
});

window.addEventListener('hashchange',switchTab);switchTab();reload().catch(e=>{
 const message='保存データを開けません: '+e.message+' 端末内データを削除・初期化しないでください。';
 $('upload-status').textContent=message;
 $('audit-overview').textContent=message;
 $('audit-overview').setAttribute('role','alert');
 console.error(e);
});
if('serviceWorker'in navigator&&(location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1'))navigator.serviceWorker.register('./sw.js').catch(e=>console.warn('Offline setup:',e));