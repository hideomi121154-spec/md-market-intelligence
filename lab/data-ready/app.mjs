import {DATASETS,validateImport,readiness,priceEvidence,buyCap,inventoryEvidence} from "./core.mjs";
import {inferPrice} from "./predict.mjs";
let loadedMlReport=null;
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

const showMoney = v => Number.isFinite(v) ? Math.round(v).toLocaleString("ja-JP")+"円" : "算出不可";
function summarizeMlReport(report) {
  if (!report || report.schema_version!=="price-ml-lab-v0.2" ||
      !Array.isArray(report.cohorts) ||
      !["synthetic","authorized",null].includes(report.data_mode))
    throw Error("価格モデル検証レポートの形式が違います");
  const rows=[
    "評価モード: "+(report.data_mode==="synthetic"?"架空データ（実務使用不可）":
      report.data_mode==="authorized"?"持込データ（利用権・実データの真正性は未検証）":"データなし"),
    "対象取引: "+(report.market_type==="retail_closed_sale"?"小売実成約":
      report.market_type==="dealer_auction_closed"?"業者AA実落札":"未対応"),
    "※モデルの結果は仕入れ推奨ではありません。",
  ];
  for(const c of report.cohorts.slice(0,20)){
    const seg=c.segment||{};
    rows.push("");
    rows.push([seg.maker,seg.model,seg.grade,seg.region].filter(Boolean).join(" / "));
    if(c.status!=="evaluated_experiment_only"){
      rows.push("保留: "+(c.message||"取引履歴が不足しています"));continue;
    }
    const base=c.baseline?.metrics;
    const model=c.ridge?.metrics;
    if(!base||!model)throw Error("予測誤差の値が不完全です");
    rows.push("学習 "+(c.periods?.train?.n??"?")+"件 / 調整 "+
      (c.periods?.calibration?.n??"?")+"件 / 未使用期間のテスト "+
      (c.periods?.test?.n??"?")+"件");
    rows.push("基準モデルMAE: "+showMoney(base.mae_jpy));
    rows.push("回帰モデルMAE: "+showMoney(model.mae_jpy));
    rows.push("調整期間の残差幅: "+showMoney(c.ridge.calibration_residual_q_jpy));
    rows.push("テスト期間の帯域内率: "+
      (Number.isFinite(c.ridge.observed_test_coverage)?
        Math.round(c.ridge.observed_test_coverage*1000)/10+"%":"算出不可"));
    rows.push("※将来の価格・誤差幅が保証されたわけではありません。");
  }
  if(report.cohorts.length>20)rows.push("※21車種目以降の詳細は省略");
  return rows.join("\n");
}
byId("mlReportFile").addEventListener("change",async e=>{
  try {
    const file=e.target.files?.[0];
    if(!file)return;
    if(file.size>3*1024*1024)throw Error("3MB以下のJSONのみ対応");
    const report=JSON.parse(await file.text());
    const summary=summarizeMlReport(report);
    loadedMlReport=report;
    setText("mlReportResult",summary);
    const q=getQuery();
    const selectedRegion=byId("region").value.trim();
    const candidate=report.cohorts.find(c=>c.status==="evaluated_experiment_only" &&
      c.segment?.maker===q.maker && c.segment?.model===q.model &&
      c.segment?.grade===q.grade && (c.segment?.region||"")===selectedRegion) ||
      report.cohorts.find(c=>c.status==="evaluated_experiment_only");
    if(candidate && (candidate.segment?.maker!==q.maker ||
       candidate.segment?.model!==q.model ||
       candidate.segment?.grade!==q.grade ||
       (candidate.segment?.region||"")!==selectedRegion)){
      byId("maker").value=candidate.segment.maker;
      byId("model").value=candidate.segment.model;
      byId("grade").value=candidate.segment.grade;
      byId("region").value=candidate.segment.region||"";
    }
    if(report.data_mode==="synthetic" && candidate?.model_artifact?.max_training_date){
      const s=candidate.model_artifact.max_training_date;
      const ms=Date.parse(s+"T00:00:00Z");
      if(Number.isFinite(ms))byId("mlPredictDate").value=new Date(ms+10*86400000).toISOString().slice(0,10);
    } else {byId("mlPredictDate").value=new Date().toISOString().slice(0,10);}
    setText("mlPredictionResult","モデルを選択しました。「この車両条件で試験的に推定」を押してください。");
  } catch(err) {
    loadedMlReport=null;
    setText("mlReportResult","レポートを読み込めません: "+err.message);
    setText("mlPredictionResult","モデル未設定です。");
  } finally {e.target.value="";}
});

byId("mlPredictButton").addEventListener("click",()=>{
  const query={
    ...getQuery(),
    region:byId("region").value.trim(),
    date:byId("mlPredictDate").value,
  };
  const r=inferPrice(loadedMlReport,query);
  if(r.status==="hold"){
    setText("mlPredictionResult","判断保留: "+r.reason);return;
  }
  setText("mlPredictionResult",
    (r.status==="synthetic_demo"?"【架空データ・実相場ではありません】":"【実験用・未検証データ】")+
    "\n実験モデルの算出値: "+showMoney(r.estimate_jpy)+
    "\n校正残差に基づく試験的な幅: "+showMoney(r.lower_jpy)+" 〜 "+showMoney(r.upper_jpy)+
    "\n学習に使用した件数: "+r.n_train+"件\n"+r.warning);
});
