/* MD MARKET v2.2: scenario sensitivity only. NO price prediction or bid recommendation. */
'use strict';
(function(root){
const PERIODS=Object.freeze([30,60,90]);
const DEFAULT_RISK=Object.freeze({dailyCost:300,monthlyMarkdown:1.5});
const keys=['retail','discount','fee','transport','recondition','advertising','holding','reserve','profit','downside','bid'];
function checkNumber(value,name,max){
 if(value===''||value===null||value===undefined||!Number.isFinite(Number(value))||Number(value)<0||Number(value)>max)
  throw Error(name+'は0〜'+max+'の範囲で入力してください');
 return Number(value);
}
function evaluate(input,risk,period,calculateValues){
 if(typeof calculateValues!=='function')throw Error('仕入れ上限の計算処理が必要です');
 if(!input||!risk)throw Error('入力条件が不足しています');
 const day=checkNumber(period,'在庫日数',180);
 if(!Number.isInteger(day))throw Error('在庫日数は整数で入力してください');
 const dailyCost=checkNumber(risk.dailyCost,'1日あたり追加在庫費',100000);
 const monthlyMarkdown=checkNumber(risk.monthlyMarkdown,'30日ごとの追加値下がり率',5);
 const base=calculateValues(input);
 const retail=checkNumber(input.retail,'想定税抜小売価格',1000000000);
 const target=checkNumber(input.profit,'目標利益',1000000000);
 const bid=checkNumber(input.bid,'候補入札価格',1000000000);
 const baseDown=checkNumber(input.downside,'初期下落率',50);
 const addedMarkdownRate=monthlyMarkdown*(day/30);
 const effectiveLossPct=baseDown+addedMarkdownRate;
 if(effectiveLossPct>=100)throw Error('想定売価の下落率合計が100%を超えています');
 const revenue=retail*(1-effectiveLossPct/100);
 // base.costs already contains the user-entered flat holding cost. Only extra per-day costs are added.
 const additionalCost=dailyCost*day;
 const totalCosts=base.costs+additionalCost;
 const maxBidForTarget=revenue-totalCosts-target;
 const profitAtBid=revenue-totalCosts-bid;
 return {day,dailyCost,monthlyMarkdown,baseDown,addedMarkdownRate,effectiveLossPct,
 revenue,additionalCost,totalCosts,target,bid,profitAtBid,
 maxBidForTarget,profitGap:profitAtBid-target,
 targetAttainable:maxBidForTarget>=0,withinArithmeticCeiling:maxBidForTarget>=0&&bid<=maxBidForTarget};
}
function evaluatePeriods(input,risk,calculateValues){
 return PERIODS.map(day=>evaluate(input,risk,day,calculateValues));
}
function maxDaysAtTarget(input,risk,calculateValues){
 // Analytical limit of a linear toy scenario; NOT a forecast of sale duration.
 const base=calculateValues(input);
 const price=checkNumber(input.retail,'想定税抜小売価格',1000000000);
 const bid=checkNumber(input.bid,'候補入札価格',1000000000);
 const target=checkNumber(input.profit,'目標利益',1000000000);
 const initialLoss=checkNumber(input.downside,'初期下落率',50);
 const dailyCost=checkNumber(risk.dailyCost,'1日あたり追加在庫費',100000);
 const monthlyMarkdown=checkNumber(risk.monthlyMarkdown,'30日ごとの追加値下がり率',5);
 const initialHeadroom=price*(1-initialLoss/100)-base.costs-bid-target;
 const costPerDay=dailyCost+price*monthlyMarkdown/3000;
 if(initialHeadroom<0)return 0;
 if(costPerDay===0)return null;
 return Math.floor(initialHeadroom/costPerDay);
}
const API={PERIODS,DEFAULT_RISK,evaluate,evaluatePeriods,maxDaysAtTarget};
if(typeof module==='object'&&module.exports)module.exports=API;
root.MDRisk=API;
if(typeof document==='undefined')return;
const $=id=>document.getElementById(id),area=$('risk-panel');
if(!area)return;
const fmt=n=>Math.floor(n).toLocaleString('ja-JP');
const yen=n=>fmt(n)+'円';
function inputs(){
 const val={};
 for(const key of keys){
  const el=$('valuation-'+key);
  if(!el||el.value.trim()==='')throw Error('計画画面の「'+key+'」の入力がありません');
  val[key]=Number(el.value);
 }
 return val;
}
function print(){
 const message=$('risk-status');
 try{
  const p=inputs(),r={dailyCost:$('risk-daily').value,monthlyMarkdown:$('risk-markdown').value};
  const calc=root.MDValuation?.calculateValues;
  const scenarios=evaluatePeriods(p,r,calc),limit=maxDaysAtTarget(p,r,calc);
  const body=$('risk-rows');body.replaceChildren();
  function cell(text,tag='td'){const el=document.createElement(tag);el.textContent=text;return el;}
  for(const s of scenarios){
   const tr=document.createElement('tr');
   tr.append(
    cell(s.day+'日','th'),
    cell(s.addedMarkdownRate.toFixed(1)+'%'),
    cell(yen(s.additionalCost)),
    cell(yen(s.maxBidForTarget)),
    cell(yen(s.profitAtBid))
   );
   tr.dataset.situation=s.profitGap<0?'shortfall':'met';
   body.append(tr);
  }
  $('risk-limit').textContent=limit===null?'低下要因を0と仮定：上限なし':limit+'日（計算上の境界）';
  $('risk-limit').dataset.situation=limit!==null&&limit<30?'shortfall':'unknown';
  $('risk-note').textContent='元の在庫維持費 '+yen(p.holding)+' は既に上段の諸経費に含まれます。この表では追加費用として 1日'+yen(Number(r.dailyCost))+' を経過日数分加算。30日ごとの追加値下がり率'+Number(r.monthlyMarkdown).toFixed(1)+'%を、初期下落率'+p.downside+'%に線形加算しています。';
  const model=$('risk-car').value.trim().slice(0,100);
  const header=model?'対象：'+model+'\n':'';
  const lines=scenarios.map(s=>s.day+'日：販売価格 '+yen(s.revenue)+' / 目標利益確保の計算上の仕入上限 '+yen(s.maxBidForTarget)+' / 候補額での試算利益 '+yen(s.profitAtBid)+'（目標差 '+yen(s.profitGap)+'）');
  $('risk-summary').value=header+'【MD MARKET：架空条件の在庫リスク感度分析／実相場ではない】\n'
    +'想定販売価格（税抜） '+yen(p.retail)+'、候補仕入額 '+yen(p.bid)+'、目標利益 '+yen(p.profit)
    +'\n最初の下落率 '+p.downside+'%、30日ごとの追加下落率 '+Number(r.monthlyMarkdown)+'%、1日追加維持費 '+yen(Number(r.dailyCost))
    +'\n'+lines.join('\n')+'\n目標利益を維持できる日数（線形仮定） '+(limit===null?'算定上は減少要因なし':limit+'日')
    +'\n※ 本結果は仮定の算数です。販売日数の予測でも実売価格の推定でもなく、仕入れ承認ではありません。掲載台数・全国順位・未照合価格は自動投入していません。税・個別条件も別途確認。';
  message.textContent='架空の条件で再計算しました。赤字行は目標利益に届かない条件で、取引の推奨ではありません。';
 }catch(err){
  $('risk-rows').replaceChildren();
  $('risk-limit').textContent='—';
  $('risk-summary').value='';
  message.textContent='試算を表示できません：'+err.message;
 }
}
for(const field of ['risk-daily','risk-markdown','risk-car',...keys.map(k=>'valuation-'+k)]){
 $(field)?.addEventListener('input',print);
}
$('valuation-reset')?.addEventListener('click',()=>queueMicrotask(print));
$('risk-reset').addEventListener('click',()=>{
 $('risk-daily').value=String(DEFAULT_RISK.dailyCost);
 $('risk-markdown').value=String(DEFAULT_RISK.monthlyMarkdown);
 $('risk-car').value='';
 print();
});
$('risk-note-show').addEventListener('click',()=>{
 print();
 const txt=$('risk-summary');
 if(txt.value){txt.focus();txt.select();}
});
$('risk-daily').value=String(DEFAULT_RISK.dailyCost);
$('risk-markdown').value=String(DEFAULT_RISK.monthlyMarkdown);
print();
})(typeof window==='undefined'?globalThis:window);
