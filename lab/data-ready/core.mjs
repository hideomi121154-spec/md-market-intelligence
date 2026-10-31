// Data-ready lab v0.1 — independent from MD MARKET's production storage.
// Pure, dependency-free functions. No source permissions are inferred by this code.
export const DATASETS = ["market", "inventory", "demand"];
export const MARKET_TYPES = ["retail_closed_sale", "dealer_auction_closed", "retail_listing", "buy_offer"];
const hasText = v => typeof v === "string" && v.trim().length > 0;
const isNum = v => typeof v === "number" && Number.isFinite(v);
const isDate = v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v+"T00:00:00Z"));
const isCount = v => Number.isInteger(v) && v >= 0;
const validYear = v => Number.isInteger(v) && v >= 1980 && v <= 2100;
const validPrice = v => Number.isInteger(v) && v > 0 && v <= 1_000_000_000;
const validKm = v => Number.isInteger(v) && v >= 0 && v <= 2_000_000;
const essential = r => hasText(r.id) && hasText(r.maker) && hasText(r.model) &&
  hasText(r.grade) && hasText(r.source) && ["synthetic","authorized"].includes(r.license_status);

export function validateImport(doc, {allowSynthetic=false}={}) {
  if (!doc || !DATASETS.includes(doc.dataset) || !Array.isArray(doc.records))
    return {ok:false, errors:["dataset は market / inventory / demand、records は配列で指定してください。"]};
  if (doc.records.length > 5000) return {ok:false, errors:["1回の取込上限は5,000件です。"]};
  const errors=[], ids=new Set();
  for (let i=0;i<doc.records.length;i++) {
    const r=doc.records[i];
    if (!r || typeof r !== "object" || !essential(r)) { errors.push((i+1)+"行目: 共通必須項目が不足"); continue; }
    if (ids.has(r.id)) errors.push((i+1)+"行目: id重複");
    ids.add(r.id);
    if (!allowSynthetic && r.license_status!=="authorized") errors.push((i+1)+"行目: synthetic は実データ取込不可");
    if (doc.dataset==="market") {
      if (!MARKET_TYPES.includes(r.market_type) || !validYear(r.year) ||
          !validKm(r.mileage_km) || !validPrice(r.price_jpy) || !isDate(r.date))
        errors.push((i+1)+"行目: 市場区分・年式・走行距離・価格・日付が不正");
    } else if (doc.dataset==="inventory") {
      if (!hasText(r.region) || !["available","reserved","sold"].includes(r.status) || !isDate(r.date))
        errors.push((i+1)+"行目: 地域・在庫状態・日付が不正");
    } else {
      if (!hasText(r.region) || !isDate(r.period_end) ||
          !isCount(r.inquiries) || !isCount(r.closed_sales))
        errors.push((i+1)+"行目: 地域・集計日・問合せ件数・成約件数が不正");
    }
    if (errors.length >= 20) {errors.push("以降のエラーを省略しました"); break;}
  }
  return {ok:errors.length===0,errors};
}
const median = a => {
  const v=[...a].sort((x,y)=>x-y), m=Math.floor(v.length/2);
  return v.length%2 ? v[m] : (v[m-1]+v[m])/2;
};
export function priceEvidence(market, query) {
  if (!validYear(query.year) || !validKm(query.mileage_km) || !hasText(query.maker) ||
      !hasText(query.model) || !hasText(query.grade))
    return {status:"invalid_query", reason:"年式・距離・車種・グレードが不正です"};
  const comparable=(market||[]).filter(r=>
    r.market_type==="retail_closed_sale" &&
    r.maker===query.maker && r.model===query.model && r.grade===query.grade &&
    Math.abs(r.year-query.year)<=2 &&
    Math.abs(r.mileage_km-query.mileage_km)<=30000 &&
    validPrice(r.price_jpy));
  if (comparable.length<5) return {
    status:"insufficient", count:comparable.length, needed:Math.max(0,5-comparable.length),
    reason:"同一車種・グレード、年式±2年・距離±3万kmの小売成約5件が必要"
  };
  const prices=comparable.map(r=>r.price_jpy);
  return {status:"descriptive_only",count:prices.length,median_jpy:median(prices),
    min_jpy:Math.min(...prices),max_jpy:Math.max(...prices),
    note:"過去の類似小売成約の分布。AI予測・将来価格・売却可能額ではありません。"};
}
export function buyCap({expectedSalePrice, auctionFee=0, transport=0, repair=0,
  sellingCost=0, holdingCost=0, reserve=0, targetProfit=0}={}) {
  const inputs={expectedSalePrice,auctionFee,transport,repair,sellingCost,holdingCost,reserve,targetProfit};
  if (Object.values(inputs).some(x=>!isNum(x) || x<0 || !Number.isSafeInteger(x)))
    return {status:"invalid",reason:"各項目は0以上の整数（円）で入力してください"};
  if (expectedSalePrice<=0) return {status:"invalid",reason:"想定売価を指定してください"};
  const costs=auctionFee+transport+repair+sellingCost+holdingCost+reserve+targetProfit;
  return {status:"calculation_only",cap_jpy:Math.max(0,expectedSalePrice-costs),
    feasible:expectedSalePrice>=costs, total_deductions_jpy:costs,
    note:"入力値だけの逆算。税込・税抜の統一、成約売価、実損益は未検証。"};
}
export function inventoryEvidence(inventory,demand,maker,model,region) {
  const stock=(inventory||[]).filter(x=>x.maker===maker&&x.model===model&&
    x.region===region&&x.status==="available").length;
  const observations=(demand||[]).filter(x=>x.maker===maker&&x.model===model&&x.region===region);
  const inquiries=observations.reduce((s,x)=>s+x.inquiries,0);
  const sold=observations.reduce((s,x)=>s+x.closed_sales,0);
  return {stock,observations:observations.length,inquiries,sold,
    status:observations.length?"observation_only":"no_demand_data",
    note:"問い合わせ・成約記録と在庫数の単純表示。対象期間の一致確認が必要。仕入れ推奨・将来需要予測ではありません。"};
}
export function readiness(data) {
  const market=data.market||[], inventory=data.inventory||[], demand=data.demand||[];
  const retailClosed=market.filter(r=>r.market_type==="retail_closed_sale").length;
  const auctionClosed=market.filter(r=>r.market_type==="dealer_auction_closed").length;
  return {retailClosed,auctionClosed,inventory:inventory.length,demand:demand.length,
    priceModelReady:retailClosed>=5,
    auctionModelReady:auctionClosed>=5,
    inventoryModelReady:inventory.length>0&&demand.length>0,
    warnings:[
      "件数だけではモデルの有効性は保証できません。対象車種ごとの量・代表性・取得許諾が必要です。",
      "掲載価格は成約価格ではありません。市場区分を混ぜて学習させないでください。"
    ]};
}
