/* MD MARKET: independent, explicitly hypothetical, tax-exclusive bid ceiling scenario. */
'use strict';
(function(){
const DEFAULTS=Object.freeze({
 retail:2300000,discount:80000,fee:70000,transport:35000,recondition:140000,
 advertising:40000,holding:25000,reserve:60000,profit:240000,downside:5,bid:1450000
});
function calculateValues(p){
 const values={};
 for(const key of Object.keys(DEFAULTS)){
   const val=Number(p[key]);
   if(!Number.isFinite(val)||val<0)throw Error('金額や割合は0以上の数値を入力してください');
   values[key]=val;
 }
 if(values.retail<=0)throw Error('想定販売価格を入力してください');
 if(values.downside>50)throw Error('価格下落の想定は0〜50%で指定してください');
 const costs=['discount','fee','transport','recondition','advertising','holding','reserve']
   .reduce((acc,k)=>acc+values[k],0);
 const baseCeiling=values.retail-costs-values.profit;
 const conservativeRevenue=values.retail*(1-values.downside/100);
 const conservativeCeiling=conservativeRevenue-costs-values.profit;
 const breakEvenCeiling=conservativeRevenue-costs;
 const expectedProfitAtBid=conservativeRevenue-costs-values.bid;
 return {costs,baseCeiling,conservativeCeiling,breakEvenCeiling,conservativeRevenue,
   expectedProfitAtBid,profitGap:expectedProfitAtBid-values.profit,
   feasible:conservativeCeiling>=0,
   bidWithinLimit:values.bid<=conservativeCeiling};
}
if(typeof module==='object'&&module.exports)module.exports={DEFAULTS,calculateValues};
if(typeof window!=='undefined')window.MDValuation=Object.freeze({DEFAULTS,calculateValues});
if(typeof document==='undefined')return;
const $=id=>document.getElementById(id);
const root=$('valuation-panel');
if(!root)return;
const keys=Object.keys(DEFAULTS);
const currency=n=>Number(n).toLocaleString('ja-JP',{style:'currency',currency:'JPY',maximumFractionDigits:0});
function read(){
 const values={};
 for(const key of keys){
   const elem=$('valuation-'+key);
   if(!elem||elem.value.trim()==='')throw Error('各入力欄に数値を入れてください');
   values[key]=Number(elem.value);
 }
 return values;
}
function render(){
 const message=$('valuation-message'),results=$('valuation-results');
 try{
   const v=read(),r=calculateValues(v);
   results.hidden=false;
   $('valuation-base').textContent=currency(Math.floor(r.baseCeiling));
   $('valuation-safe').textContent=r.feasible?currency(Math.floor(r.conservativeCeiling)):'仕入れ見送り';
   $('valuation-breakeven').textContent=currency(Math.floor(r.breakEvenCeiling));
   $('valuation-costs').textContent=currency(Math.floor(r.costs));
   $('valuation-downside-revenue').textContent=currency(Math.floor(r.conservativeRevenue));
   $('valuation-bid-profit').textContent=currency(Math.floor(r.expectedProfitAtBid));
   $('valuation-profit-gap').textContent=currency(Math.floor(r.profitGap));
   const verdict=$('valuation-verdict');
   verdict.classList.toggle('valuation-caution',!r.bidWithinLimit);
   verdict.classList.toggle('valuation-within',r.feasible&&r.bidWithinLimit);
   verdict.textContent=!r.feasible
     ?'慎重シナリオでは目標利益を確保できる仕入れ価格がありません。'
     :r.bidWithinLimit
       ?'入力条件上は候補入札額が慎重シナリオの上限以内です。ただし落札価格の妥当性・車両状態は別途検証してください。'
       :'候補入札額では、慎重シナリオで設定した目標利益に届きません。';
   message.textContent='試算を更新しました。入力例・予測は実相場ではありません。';
 }catch(err){
   results.hidden=true;
   message.textContent='入力エラー：'+err.message;
 }
}
for(const key of keys){
 const elem=$('valuation-'+key);
 if(elem){elem.value=String(DEFAULTS[key]);elem.addEventListener('input',render);}
}
$('valuation-reset')?.addEventListener('click',()=>{
 for(const key of keys){const elem=$('valuation-'+key);if(elem)elem.value=String(DEFAULTS[key])}
 render();
});
render();
})();