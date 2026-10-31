/* MD MARKET 2.9 | USS aggregate supply/demand early-warning heuristic.
   No vehicle-level predictions; published monthly data only. */
'use strict';
(function(root){
  const MONTH=/^20\d{2}-(0[1-9]|1[0-2])$/;
  const finite=n=>typeof n==='number'&&Number.isFinite(n);
  const one=n=>Math.round(n*10)/10;
  const monthIndex=m=>Number(m.slice(0,4))*12+Number(m.slice(5));
  function evaluate(row){
    const fields=['offered','sold','offered_yoy_pct','sold_yoy_pct','sale_rate_pct','sale_rate_prev_pct'];
    if(!row||!MONTH.test(row.month)||fields.some(k=>!finite(row[k]))||
       row.offered<=0||row.sold<=0||row.sold>row.offered||
       row.sale_rate_pct<0||row.sale_rate_pct>100||
       row.sale_rate_prev_pct<0||row.sale_rate_prev_pct>100||
       row.offered_yoy_pct<=0||row.sold_yoy_pct<=0){
      return {level:'unknown',month:row&&row.month||'',reason:'比較できる公式数値が不足しています'};
    }
    // USS YoY values are indexes: 115.0 means +15.0%, not +115%.
    const offeredGrowth=one(row.offered_yoy_pct-100);
    const soldGrowth=one(row.sold_yoy_pct-100);
    const growthGap=one(row.offered_yoy_pct-row.sold_yoy_pct);
    const rateDifference=one(row.sale_rate_pct-row.sale_rate_prev_pct);
    const flags={
      supplyGrowth:offeredGrowth>=5,
      supplyOutpacesSales:growthGap>=4,
      fallingSaleRate:rateDifference<=-2
    };
    const count=Object.values(flags).filter(Boolean).length;
    return {level:count===3?'high':count===2?'watch':'low',
      month:row.month,offeredGrowth,soldGrowth,growthGap,rateDifference,
      flags,metCount:count,ruleVersion:'heuristic-v1'};
  }
  function nextMonthOutcome(months,selected){
    if(!Array.isArray(months)||!selected||!MONTH.test(selected.month))return null;
    const next=months.find(x=>x&&MONTH.test(x.month)&&monthIndex(x.month)===monthIndex(selected.month)+1);
    if(!next||!finite(selected.avg_sold_price_thousand_jpy)||selected.avg_sold_price_thousand_jpy<=0||
       !finite(next.avg_sold_price_thousand_jpy)||next.avg_sold_price_thousand_jpy<=0)return null;
    return {month:next.month,changePct:one((next.avg_sold_price_thousand_jpy/selected.avg_sold_price_thousand_jpy-1)*100)};
  }
  const API={evaluate,nextMonthOutcome};
  if(typeof module==='object'&&module.exports)module.exports=API;
  root.MDMarketWarning=API;
  if(typeof document==='undefined')return;
  const $=id=>document.getElementById(id);
  const panel=$('uss-warning-panel');
  if(!panel)return;
  const select=$('uss-warning-month'),status=$('uss-warning-status');
  const tag=$('uss-warning-level'),detail=$('uss-warning-detail');
  const result=$('uss-warning-outcome'),scope=$('uss-warning-scope');
  let rows=[],mode='fresh',checkedAt='';
  const signed=n=>(n>0?'+':'')+n.toFixed(1);
  const label=m=>m.slice(0,4)+'年'+Number(m.slice(5))+'月';
  function draw(){
    const row=rows.find(x=>x.month===select.value);
    if(!row){tag.textContent='判定不可';tag.dataset.level='unknown';detail.textContent='分析可能な月次データがありません';result.textContent='';return;}
    const s=evaluate(row);
    const names={high:'警戒：高',watch:'警戒：注意',low:'警戒条件なし',unknown:'判定不可'};
    tag.textContent=names[s.level];
    tag.dataset.level=s.level;
    if(s.level==='unknown'){
      detail.textContent=s.reason;
    }else{
      detail.textContent='出品 前年同月比 '+signed(s.offeredGrowth)+'% ／ 成約 '+signed(s.soldGrowth)+'% ／ 増加率の差 '+signed(s.growthGap)+'ポイント ／ 成約率の前年差 '+signed(s.rateDifference)+'ポイント。';
    }
    const out=nextMonthOutcome(rows,row);
    if(out){
      result.textContent='【事後検証・翌月の実績】'+label(out.month)+'の平均成約単価は '+signed(out.changePct)+'%（前月比）。これは'+label(row.month)+'当時に利用できた情報ではなく、警戒ルールの事後点検用です。車種構成の違いを調整していません。';
    }else{
      result.textContent='翌月の連続した公式平均単価データは未収録です。将来の値下がり率を予測した表示ではありません。';
    }
    scope.textContent=label(row.month)+'を評価｜条件 '+s.metCount+'/3（出品前年比+5%以上、出品と成約の伸び率差+4ポイント以上、成約率前年差−2ポイント以下）。閾値は仮設定・検証前です。'+(mode==='cached'?' 保存済み資料を利用。':'');
  }
  document.addEventListener('mdmarket:uss-data',event=>{
    const payload=event.detail||{},data=payload.data||{};
    if(!Array.isArray(data.months)||!data.months.length)return;
    rows=data.months.slice();
    mode=payload.mode||'fresh';
    checkedAt=data.checked_at_utc||'';
    const old=select.value;
    select.replaceChildren();
    for(const row of rows){
      const option=document.createElement('option');
      option.value=row.month;
      option.textContent=label(row.month);
      select.appendChild(option);
    }
    select.value=rows.some(row=>row.month===old)?old:rows[rows.length-1].month;
    status.textContent='USS公式月次データから算出。資料の最終確認：'+(checkedAt||'不明')+'。公表前の速報ではありません。';
    panel.hidden=false;
    draw();
  });
  document.addEventListener('mdmarket:uss-unavailable',()=>{
    panel.hidden=false;select.disabled=true;
    status.textContent='USS公式月次データを確認できず、警戒度を算出できません。';
    tag.textContent='判定不可';tag.dataset.level='unknown';
    detail.textContent='欠測は0や安全判定に置き換えません。';
    result.textContent='';scope.textContent='';
  });
  select.addEventListener('change',draw);
})(typeof window==='undefined'?globalThis:window);
