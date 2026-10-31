/* MD MARKET v2.5: personal-use car price notebook, all values entered by the user.
   Never scrape providers, infer actual offers or copy entries to wholesale calculations. */
'use strict';
(function(root){
const KEY='md-market-consumer-price-v1',MAX_CARS=50,MAX_QUOTES=500;
const TYPES=Object.freeze({
 estimate:'無料相場サイトの参考価格',
 offer:'買取店から実際に提示された金額',
 retail:'中古車サイトの小売掲載価格'
});
const SOURCES=Object.freeze([
 {name:'ガリバー｜買取相場（個人情報登録なし）',url:'https://221616.com/satei/souba/',note:'買取実績をもとにした参考相場。実際の提示額とは異なります。'},
 {name:'グーネット買取｜無料相場シミュレーション',url:'https://www.goo-net.com/kaitori/satei/',note:'メール登録等が必要な場合があります。入力・利用条件は提供元で確認してください。'},
 {name:'ナビクル｜買取相場',url:'https://www.navikuru.jp/souba/',note:'相場閲覧と一括査定申込は異なります。申込時は連絡先や電話対応の条件を確認してください。'},
 {name:'カーセンサー｜中古車掲載情報',url:'https://www.carsensor.net/usedcar/',note:'小売掲載の支払総額と車両本体価格を混同しないでください。'},
 {name:'グーネット｜中古車掲載情報',url:'https://www.goo-net.com/usedcar/',note:'掲載価格は売買が成立した価格ではありません。'}
]);
const clean=x=>String(x??'').normalize('NFKC').trim().replace(/\s+/g,' ');
const dateValid=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s??''))&&
 Number.isFinite(Date.parse(s+'T12:00:00Z'))&&new Date(s+'T12:00:00Z').toISOString().slice(0,10)===s;
function linkValid(input){
 const val=clean(input);if(!val)return '';
 try{const u=new URL(val);if(!['https:','http:'].includes(u.protocol)||!u.hostname.includes('.')||u.username||u.password)throw Error();
 return u.href;}catch{throw Error('出典URLは有効なHTTP/HTTPSのアドレスで入力してください');}
}
function car(raw){
 if(!raw||typeof raw!=='object')throw Error('車両データが正しくありません');
 const o={id:clean(raw.id),make:clean(raw.make),model:clean(raw.model),
  grade:clean(raw.grade),year:Number(raw.year),mileage:Number(raw.mileage),
  color:clean(raw.color),repair:clean(raw.repair)};
 if(!o.id||o.id.length>100)throw Error('車両識別子が不正です');
 if(!o.make||!o.model||o.make.length>50||o.model.length>80||o.grade.length>100||o.color.length>60)
   throw Error('メーカー・車種は必須です。車名やグレードの文字数も確認してください');
 const currentYear=new Date().getFullYear();
 if(raw.year===''||raw.year==null||!Number.isInteger(o.year)||o.year<1950||o.year>currentYear+1)
   throw Error('年式は1950年から翌年までの整数で入力してください');
 if(raw.mileage===''||raw.mileage==null||!Number.isInteger(o.mileage)||o.mileage<0||o.mileage>2000000)
   throw Error('走行距離は0〜200万kmの整数で入力してください');
 if(!['none','yes','unknown'].includes(o.repair))throw Error('修復歴の区分を選んでください');
 return o;
}
function observation(raw){
 if(!raw||typeof raw!=='object')throw Error('金額の記録が正しくありません');
 const o={id:clean(raw.id),car_id:clean(raw.car_id),type:clean(raw.type),
  source:clean(raw.source),source_url:linkValid(raw.source_url),date:clean(raw.date),
  price:Number(raw.price),notes:clean(raw.notes)};
 if(!o.id||o.id.length>100||!o.car_id||o.car_id.length>100)throw Error('記録IDが不正です');
 if(!Object.hasOwn(TYPES,o.type))throw Error('価格区分を選んでください');
 if(!dateValid(o.date))throw Error('確認日が正しくありません');
 if(raw.price===''||raw.price==null||!Number.isSafeInteger(o.price)||o.price<=0||o.price>1000000000)
   throw Error('金額は1円〜10億円の整数で入力してください');
 if(!o.source||o.source.length>100||o.notes.length>400)throw Error('情報源の名称・メモの長さを確認してください');
 return o;
}
function validate(data){
 if(!data||!Array.isArray(data.cars)||!Array.isArray(data.quotes)||data.cars.length>MAX_CARS||data.quotes.length>MAX_QUOTES)
   throw Error('記録形式または車両50台・金額500件の上限を確認してください');
 const cars=data.cars.map(car),quotes=data.quotes.map(observation),carIds=new Set(),qIds=new Set();
 for(const x of cars){if(carIds.has(x.id))throw Error('車両IDが重複しています');carIds.add(x.id);}
 for(const x of quotes){
  if(qIds.has(x.id))throw Error('記録IDが重複しています');
  if(!carIds.has(x.car_id))throw Error('該当する車両情報が見つかりません');
  qIds.add(x.id);
 }
 return {cars,quotes};
}
function merge(current,incoming){
 const a=validate(current),b=validate(incoming),
  cars=a.cars.slice(),quotes=a.quotes.slice();
 for(const [kind,target] of [['cars',cars],['quotes',quotes]]){
  const byId=new Map(target.map(x=>[x.id,x]));
  for(const x of b[kind]){
   const old=byId.get(x.id);
   if(old){if(JSON.stringify(old)!==JSON.stringify(x))throw Error('既存IDの内容が異なります。上書きしません');continue;}
   target.push(x);byId.set(x.id,x);
  }
 }
 return validate({cars,quotes});
}
function summarize(data,carId){
 const all=validate(data),profiles=all.cars;
 if(!profiles.some(x=>x.id===carId))throw Error('対象車両が見つかりません');
 const rows=all.quotes.filter(q=>q.car_id===carId),types={};
 for(const t of Object.keys(TYPES)){
  const observations=rows.filter(x=>x.type===t).sort((a,b)=>b.date.localeCompare(a.date));
  const nums=observations.map(x=>x.price).sort((a,b)=>a-b);
  const median=nums.length?nums.length%2?nums[(nums.length-1)/2]:(nums[nums.length/2-1]+nums[nums.length/2])/2:null;
  types[t]={count:nums.length,min:nums.length?nums[0]:null,max:nums.length?nums.at(-1):null,median,latest:observations[0]?.date??null};
 }
 return {rows:rows.slice().sort((a,b)=>b.date.localeCompare(a.date)),types};
}
function backup(data){return JSON.stringify({schema_version:1,kind:'personal_car_price_notebook',...validate(data)},null,2);}
function restore(text){
 let b;try{b=JSON.parse(text);}catch{throw Error('JSONの形式が正しくありません');}
 if(!b||b.schema_version!==1||b.kind!=='personal_car_price_notebook')throw Error('このアプリのマイカー相場バックアップではありません');
 return validate(b);
}
const API={KEY,MAX_CARS,MAX_QUOTES,TYPES,SOURCES,car,observation,validate,merge,summarize,backup,restore,linkValid};
if(typeof module==='object'&&module.exports)module.exports=API;
root.MDPersonal=API;
if(typeof document==='undefined')return;
const $=id=>document.getElementById(id),panel=$('mycar');
if(!panel)return;
const status=$('mycar-status'),back=$('mycar-backup'),list=$('mycar-quote-rows'),selector=$('mycar-selector');
let data={cars:[],quotes:[]},healthy=true;
const yen=n=>n==null?'—':Math.round(n).toLocaleString('ja-JP')+'円';
const today=()=>{const d=new Date(),pad=n=>String(n).padStart(2,'0');return [d.getFullYear(),pad(d.getMonth()+1),pad(d.getDate())].join('-');};
const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
function id(){return 'c'+Date.now().toString(36)+'-'+(Math.random().toString(36).slice(2,12));}
function safeRead(){
 try{const raw=localStorage.getItem(KEY);data=validate(raw?JSON.parse(raw):{cars:[],quotes:[]});}
 catch(err){healthy=false;back.value=localStorage.getItem(KEY)||'';status.textContent='記録の読み込みに失敗しました。元データは変更せずバックアップ欄に表示しています：'+err.message;}
 for(const key of ['mycar-save-car','mycar-save-quote','mycar-restore'])$(key).disabled=!healthy;
}
function persist(next){const value=validate(next);localStorage.setItem(KEY,JSON.stringify(value));data=value;}
function formCar(){const v=k=>$('mycar-'+k).value;return car({id:id(),make:v('make'),model:v('model'),grade:v('grade'),year:v('year'),mileage:v('mileage'),color:v('color'),repair:v('repair')});}
function formQuote(){const v=k=>$('mycar-'+k).value;return observation({id:id(),car_id:selector.value,type:v('type'),source:v('source'),source_url:v('source-url'),date:v('date'),price:v('price'),notes:v('notes')});}
function render(){
 const prev=selector.value;selector.replaceChildren();
 for(const c of data.cars){
  const option=node('option',c.make+' '+c.model+' / '+c.year+'年 / '+c.mileage.toLocaleString('ja-JP')+'km'+(c.grade?' / '+c.grade:''));option.value=c.id;selector.append(option);
 }
 if(data.cars.some(x=>x.id===prev))selector.value=prev;
 const chosen=data.cars.find(c=>c.id===selector.value);
 const quoteForm=$('mycar-quote-form');
 quoteForm.hidden=!chosen;
 list.replaceChildren();
 for(const kind of Object.keys(TYPES))$('mycar-'+kind).textContent='記録なし';
 if(!chosen){$('mycar-summary').textContent='最初にマイカーの情報を登録してください。';return;}
 const result=summarize(data,chosen.id);
 $('mycar-summary').textContent=chosen.make+' '+chosen.model+' / '+chosen.year+'年式 / '+chosen.mileage.toLocaleString('ja-JP')+'km'+(chosen.grade?' / '+chosen.grade:'')+' / 修復歴：'+({none:'なし',yes:'あり',unknown:'不明'}[chosen.repair]);
 for(const [type,label] of Object.entries(TYPES)){
  const s=result.types[type];
  $('mycar-'+type).textContent=s.count?yen(s.min)+(s.min!==s.max?'〜'+yen(s.max):'')+'（'+s.count+'件）':'記録なし';
 }
 if(!result.rows.length){const tr=node('tr'),td=node('td','まだ相場記録がありません。下の公式サイトで確認した数値を追加してください。');td.colSpan=4;tr.append(td);list.append(tr);}
 for(const q of result.rows){
  const tr=node('tr'),price=node('td',yen(q.price)),type=node('td',TYPES[q.type]),detail=node('td'),date=node('td',q.date);
  detail.append(node('strong',q.source));
  if(q.source_url){detail.append(node('span',' '));const a=node('a','出典を開く');a.href=q.source_url;a.target='_blank';a.rel='noopener noreferrer';detail.append(a);}
  if(q.notes)detail.append(node('div',q.notes));
  tr.append(type,price,detail,date);list.append(tr);
 }
}
for(const src of SOURCES){
 const li=node('li'),a=node('a',src.name);
 a.href=src.url;a.target='_blank';a.rel='noopener noreferrer';
 li.append(a,node('div',src.note));$('mycar-services').append(li);
}
$('mycar-date').value=today();
safeRead();render();
selector.addEventListener('change',render);
$('mycar-car-form').addEventListener('submit',event=>{
 event.preventDefault();if(!healthy)return;
 try{const c=formCar();persist(merge(data,{cars:[c],quotes:[]}));
  selector.value=c.id;render();selector.value=c.id;render();
  status.textContent='マイカーを端末に登録しました。名前・住所・車台番号は取得していません。';
 }catch(err){status.textContent='車両を登録できません：'+err.message;}
});
$('mycar-quote-form').addEventListener('submit',event=>{
 event.preventDefault();if(!healthy)return;
 try{const q=formQuote();
  persist(merge(data,{cars:[],quotes:[q]}));render();status.textContent='確認した金額を記録しました。査定サイトの推定値と実際の買取提示額は別表示です。';
 }catch(err){status.textContent='金額を記録できません：'+err.message;}
});
$('mycar-export').addEventListener('click',()=>{
 try{back.value=backup(data);back.focus();back.select();status.textContent='マイカー'+data.cars.length+'台／価格記録'+data.quotes.length+'件のJSONを表示しました。iPhoneのメモ等にコピーして保管してください。まだ外部保存は完了していません。';}
 catch(err){status.textContent='バックアップできません：'+err.message;}
});
$('mycar-restore').addEventListener('click',()=>{
 if(!healthy)return;
 try{const old=data,merged=merge(data,restore(back.value));const added=merged.cars.length-old.cars.length,quotes=merged.quotes.length-old.quotes.length;
  persist(merged);render();status.textContent='車両'+added+'台、金額'+quotes+'件を追加復元しました。既存記録は上書きしていません。';
 }catch(err){status.textContent='復元できません：'+err.message;}
});
})(typeof window==='undefined'?globalThis:window);
