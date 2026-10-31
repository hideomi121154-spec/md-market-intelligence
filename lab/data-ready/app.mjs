import {DATASETS,validateImport,readiness,priceEvidence,buyCap,inventoryEvidence} from "./core.mjs";
const byId=id=>document.getElementById(id);
const setText=(id,s)=>{byId(id).textContent=s;};
const yen=n=>Math.round(n).toLocaleString("ja-JP")+"円";
let state={mode:"loading", data:{market:[],inventory:[],demand:[]}};
const getQuery=()=>({
  maker:byId("maker").value.trim(),model:byId("model").value.trim(),
  grade:byId("grade").value.trim(),
  year:Number(byId("year").value),mileage_km:Number(byId("km").value)
});
function redraw(){
  const r=readiness(state.data);
  setText("readiness",
    "収録: 小売実成約 "+r.retailClosed+"件 / AA実落札 "+r.auctionClosed+
    "件 / 自社在庫 "+r.inventory+"件 / 需要集計 "+r.demand+"件。\n"+
    "価格モデルの検証用データ: "+(r.priceModelReady?"最低件数あり（品質・精度は未検証）":"不足")+
    "。在庫・需要: "+(r.inventoryModelReady?"記録あり（期間整合性は未検証）":"不足")+
    "。※必要な件数は車種・地域・時期ごとに判定が必要。");
  setText("banner",state.mode==="demo"?
    "デモモード：画面の数値はすべて架空。実在の相場・仕入れ推奨ではありません。":
    "持込データモード：利用許諾は自己申告で、出典・真正性・正確性は未検証。仕入れ判断には使用しないでください。");
  analyzePrice(); analyzeDemand();
}
function analyzePrice(){
  const x=priceEvidence(state.data.market,getQuery());
  if(x.status!=="descriptive_only") {
    setText("priceResult","判定: "+x.status+"\n"+(x.reason||"")+
      (typeof x.count==="number"?"\n類似する小売成約: "+x.count+"件":"")+
      "\n価格は表示しません。"); return;
  }
  setText("priceResult","同条件の過去小売成約: "+x.count+"件\n"+
    "成約価格の中央値: "+yen(x.median_jpy)+"\n"+
    "確認範囲: "+yen(x.min_jpy)+"〜"+yen(x.max_jpy)+"\n"+
    x.note+"\n"+(state.mode==="demo"?"【架空データ】":"【持込データ・出典未検証】"));
}
function analyzeDemand(){
  const q=getQuery(),region=byId("region").value.trim();
  const r=inventoryEvidence(state.data.inventory,state.data.demand,q.maker,q.model,region);
  setText("demandResult",q.maker+" "+q.model+" / "+region+"\n"+
    "利用可能在庫: "+r.stock+"台\n集計レコード: "+r.observations+"件\n"+
    "問合せ合計: "+r.inquiries+"件 / 成約記録合計: "+r.sold+"件\n"+
    r.note+"\n"+(state.mode==="demo"?"【架空データ】":"【持込データ・期間未照合】"));
}
function analyzeCap(){
  const f=id=>Number(byId(id).value);
  const r=buyCap({expectedSalePrice:f("sell"),auctionFee:f("auctionFee"),
    transport:f("transport"),repair:f("repair"),sellingCost:f("sellingCost"),
    holdingCost:f("holdingCost"),reserve:f("reserve"),targetProfit:f("profit")});
  setText("capResult",r.status!=="calculation_only"?r.reason:
    "入力した売価: "+yen(f("sell"))+"\n必要経費・利益の合計: "+yen(r.total_deductions_jpy)+
    "\n計算上の仕入れ上限: "+yen(r.cap_jpy)+
    (r.feasible?"":"\n注意：想定売価で必要経費・利益を回収できません。")+
    "\n"+r.note+"\n※デモの初期入力値は架空です。");
}
function loadDocs(docs,allowSynthetic){
  if (!Array.isArray(docs)||!docs.length) throw Error("datasets 配列が必要です");
  const proposed={market:[],inventory:[],demand:[]}, seen=new Set();
  for(const d of docs){
    if(seen.has(d.dataset))throw Error("同じdatasetを複数指定しています");
    seen.add(d.dataset);
    const v=validateImport(d,{allowSynthetic});
    if(!v.ok)throw Error(d.dataset+": "+v.errors.join(" / "));
    proposed[d.dataset]=d.records.map(r=>({...r}));
  }
  return proposed;
}
async function resetDemo(){
  const response=await fetch("./sample-data.json",{cache:"no-store"});
  if(!response.ok)throw Error("デモデータを読み込めません: HTTP "+response.status);
  const json=await response.json();
  const docs=loadDocs(json.datasets,true);
  state={mode:"demo",data:docs};
  setText("importStatus","デモ用の架空データを読み込みました。実取引情報は含みません。");
  redraw();
}
async function importFile(file){
  if(!file)return;
  if(file.size>3*1024*1024)throw Error("ファイルは3MB以下にしてください");
  const json=JSON.parse(await file.text());
  const docs=Array.isArray(json.datasets)?json.datasets:[json];
  const incoming=loadDocs(docs,false);
  const old=state.mode==="user"?state.data:{market:[],inventory:[],demand:[]};
  const next={...old};
  for(const d of docs)next[d.dataset]=incoming[d.dataset];
  state={mode:"user",data:next};
  setText("importStatus",docs.map(d=>d.dataset+": "+d.records.length+"件").join(" / ")+
    " をメモリへ読み込みました。デモデータは一切混在しません。許諾と原本の確認は利用者の責任です。");
  redraw();
}
byId("resetDemo").addEventListener("click",()=>resetDemo().catch(e=>setText("importStatus","エラー: "+e.message)));
byId("fileInput").addEventListener("change",async e=>{
  try{await importFile(e.target.files?.[0]);}
  catch(err){setText("importStatus","取込中止（既存表示データを維持）: "+err.message);}
  finally{e.target.value="";}
});
byId("analyze").addEventListener("click",analyzePrice);
byId("checkDemand").addEventListener("click",analyzeDemand);
byId("calcCap").addEventListener("click",analyzeCap);
resetDemo().catch(err=>{state.mode="user";setText("importStatus","デモの読込に失敗: "+err.message);
  setText("banner","デモデータが読み込めませんでした。");redraw();});
analyzeCap();
