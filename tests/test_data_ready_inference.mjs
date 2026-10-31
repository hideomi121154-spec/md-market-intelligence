import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {inferPrice} from "../lab/data-ready/predict.mjs";

const report={
  schema_version:"price-ml-lab-v0.2",
  data_mode:"synthetic",
  market_type:"retail_closed_sale",
  cohorts:[{
    status:"evaluated_experiment_only",
    market_type:"retail_closed_sale",
    segment:{maker:"日産",model:"ノート",grade:"X",region:"愛知県"},
    model_artifact:{
      validated_for_real_bidding:false,
      features:["vehicle_age_years","mileage_10k_km","months_since_first_train"],
      anchor_date:"2026-01-01",max_training_date:"2026-03-01",
      mean:[4,3,1],scale:[1,1,1],coefficient_man_yen:[0,0,0],
      intercept_man_yen:150,
      observed_feature_min:[1,0.5,0],
      observed_feature_max:[7,10,2],
      calibration_residual_q_jpy:120000,
      training_size:70,
    }
  }]
};
const good={maker:"日産",model:"ノート",grade:"X",region:"愛知県",
  date:"2026-03-11",year:2022,mileage_km:30000};
let result=inferPrice(report,good);
assert.equal(result.status,"synthetic_demo");
assert.equal(result.estimate_jpy,1500000);
assert.equal(result.lower_jpy,1380000);
assert.equal(result.upper_jpy,1620000);
assert.equal(inferPrice(report,{...good,region:"東京都"}).status,"hold");
assert.equal(inferPrice(report,{...good,date:"2026-08-01"}).status,"hold");
assert.equal(inferPrice(report,{...good,date:"2026-02-30"}).status,"hold");
assert.equal(inferPrice(report,{...good,year:2010}).status,"hold");
assert.equal(inferPrice(report,{...good,mileage_km:-1}).status,"hold");
assert.equal(inferPrice({...report,data_mode:"unknown"},good).status,"hold");
assert.equal(inferPrice(null,good).status,"hold");
const bad=structuredClone(report);
bad.cohorts[0].model_artifact.validated_for_real_bidding=true;
assert.equal(inferPrice(bad,good).status,"hold");
// Verify real synthetic Python report can be consumed by the browser estimator.
const input=process.argv[2];
if(input){
  const actual=JSON.parse(readFileSync(input,"utf8"));
  const c=actual.cohorts.find(x=>x.status==="evaluated_experiment_only");
  assert.ok(c,"synthetic report must contain trained cohort");
  const last=c.model_artifact.max_training_date;
  const trialDay=new Date(Date.parse(last+"T00:00:00Z")+10*86400000).toISOString().slice(0,10);
  result=inferPrice(actual,{
    maker:c.segment.maker,model:c.segment.model,grade:c.segment.grade,
    region:c.segment.region||"",date:trialDay,year:2022,mileage_km:30000
  });
  assert.equal(result.status,"synthetic_demo",JSON.stringify(result));
  assert.ok(result.estimate_jpy>0);
  assert.ok(result.upper_jpy>=result.estimate_jpy);
}
console.log("Guarded model inference tests passed");
