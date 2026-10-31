// Experimental report inference: executes a Python-trained ridge model in the browser.
// No training, storage, network calls or purchasing advice.
function parseDay(s) {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const ms=Date.parse(s+"T00:00:00Z");
  if(!Number.isFinite(ms) || new Date(ms).toISOString().slice(0,10)!==s) return null;
  return ms;
}
const hold=reason=>({status:"hold",reason});
export function inferPrice(report, query) {
  if(!report || report.schema_version!=="price-ml-lab-v0.2" ||
     !["synthetic","authorized"].includes(report.data_mode) ||
     !Array.isArray(report.cohorts)) return hold("学習レポートが未設定か不正です");
  const timestamp=parseDay(query?.date);
  if(timestamp===null) return hold("評価日が正しくありません");
  if(!Number.isInteger(query.year) || query.year<1980 || query.year>new Date(timestamp).getUTCFullYear() ||
     !Number.isInteger(query.mileage_km) || query.mileage_km<0 ||
     query.mileage_km>2_000_000) return hold("年式または走行距離が正しくありません");
  const cohort=report.cohorts.find(c=>
    c.status==="evaluated_experiment_only" &&
    c.market_type===report.market_type &&
    c.segment?.maker===query.maker &&
    c.segment?.model===query.model &&
    c.segment?.grade===query.grade &&
    (c.segment.region||"")===(query.region||"")
  );
  if(!cohort || !cohort.model_artifact) return hold("条件に一致する学習済みモデルがありません");
  const model=cohort.model_artifact;
  if(model.validated_for_real_bidding!==false ||
     !Array.isArray(model.features) ||
     model.features.join("|")!=="vehicle_age_years|mileage_10k_km|months_since_first_train" ||
     ![model.mean,model.scale,model.coefficient_man_yen,
       model.observed_feature_min,model.observed_feature_max].every(
       x=>Array.isArray(x)&&x.length===3&&x.every(Number.isFinite)
     ) || !Number.isFinite(model.intercept_man_yen) ||
     model.scale.some(x=>x<=0)) return hold("予測係数が不完全です");
  const first=parseDay(model.anchor_date),last=parseDay(model.max_training_date);
  if(first===null||last===null||last<first) return hold("学習期間が不正です");
  const daysBeyond=(timestamp-last)/86400000;
  if(daysBeyond<0) return hold("学習期間より古い日は対象外です");
  if(daysBeyond>120) return hold("モデルの学習日から120日超。相場が古いため再学習が必要です");
  const d=new Date(timestamp);
  const dayOfYear=1+Math.round((timestamp-Date.UTC(d.getUTCFullYear(),0,1))/86400000);
  const age=d.getUTCFullYear()-query.year+(dayOfYear-1)/365.25;
  const values=[age,query.mileage_km/10000,(timestamp-first)/86400000/30.4375];
  // Check vehicle age and mileage only. The future date feature is
  // necessarily later than the training range and is limited separately.
  for(const i of [0,1]){
    if(values[i]<model.observed_feature_min[i] ||
       values[i]>model.observed_feature_max[i])
      return hold("学習時に観測した車齢・走行距離の範囲外です");
  }
  const estimatedYen=Math.max(0,(model.intercept_man_yen+
     values.reduce((sum,v,i)=>sum+
       ((v-model.mean[i])/model.scale[i])*model.coefficient_man_yen[i],0))*10000);
  if(!Number.isFinite(estimatedYen))return hold("計算できません");
  const q=model.calibration_residual_q_jpy;
  if(!Number.isFinite(q)||q<0)return hold("校正用の残差データが不足しています");
  return {
    status:report.data_mode==="synthetic"?"synthetic_demo":"experimental_not_validated",
    estimate_jpy:Math.round(estimatedYen),
    lower_jpy:Math.max(0,Math.round(estimatedYen-q)),
    upper_jpy:Math.round(estimatedYen+q),
    age_years:age,
    n_train:model.training_size,
    warning:"統計的な実験結果です。将来価格や区間の信頼性を保証せず、買付・価格決定には使用できません。"+
      (report.data_mode==="synthetic"?" 全数値が架空データに基づきます。":" 提供データの利用権・真正性は独立検証していません。"),
  };
}
