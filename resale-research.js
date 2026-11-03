/* リセバ総研: manual observations only. No fetch, scraping, or third-party data redistribution. */
(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined' && module.exports)module.exports=api;
  if(root && root.document){
    root.MDResaleResearch=api;
    const start=()=>api.mount(root.document,root.localStorage);
    if(root.document.readyState==='loading')root.document.addEventListener('DOMContentLoaded',start);
    else start();
  }
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const KEY='md-market-resale-research-v1',SCHEMA='md-market-resale-research-v1',MAX=500;
  const LINKS=[
    {make:'トヨタ',model:'アルファード',url:'https://resalevalue.jp/article/alphard/'},
    {make:'トヨタ',model:'ハリアー',url:'https://resalevalue.jp/article/harrier/'},
    {make:'トヨタ',model:'ランドクルーザープラド',url:'https://resalevalue.jp/article/prado/'}
  ];
  function clean(s,max){return String(s==null?'':s).trim().slice(0,max);}
  function date(v,name,optional){
    const s=clean(v,10);
    if(optional && !s)return '';
    if(!/^\d{4}-\d{2}-\d{2}$/.test(s))throw Error(name+'はYYYY-MM-DDで入力してください');
    const d=new Date(s+'T00:00:00Z');
    if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==s)throw Error(name+'の日付が不正です');
    return s;
  }
  function integer(v,name,min,max,optional){
    if(optional&&(v==null||String(v).trim()===''))return null;
    const n=Number(v);
    if(!Number.isSafeInteger(n)||n<min||n>max)throw Error(name+'の値が不正です');
    return n;
  }
  function sourceUrl(raw){
    let u;try{u=new URL(String(raw));}catch(e){throw Error('公式記事のURLを入力してください');}
    if(u.protocol!=='https:'||!['resalevalue.jp','www.resalevalue.jp'].includes(u.hostname)||u.username||u.password||u.port||!u.pathname.startsWith('/article/')){
      throw Error('リセバ総研の公式記事URL（https://resalevalue.jp/article/...）のみ登録可能です');
    }
    u.hash='';u.search='';
    return u.href;
  }
  function normalize(input){
    if(!input||typeof input!=='object'||Array.isArray(input))throw Error('記録形式が不正です');
    const make=clean(input.make,40),model=clean(input.model,70);
    if(!make||!model)throw Error('メーカーと車名は必須です');
    const powertrain=clean(input.powertrain,30);
    if(!['gasoline','hybrid','diesel','electric','mixed','other'].includes(powertrain))throw Error('動力区分が不正です');
    const segment=clean(input.segment,100);
    if(!segment)throw Error('集計表の区分（車種全体・型式・グレードなど）は必須です');
    const metric=clean(input.metric,30);
    if(!['year_avg','weekly_avg'].includes(metric))throw Error('集計区分が不正です');
    const year=metric==='year_avg'?integer(input.model_year,'年式',1980,2100,false):null;
    const mileage=integer(input.average_mileage_km,'平均走行距離',0,2000000,true);
    const count=integer(input.sample_count,'査定件数',1,1000000,true);
    if(metric==='weekly_avg'&&mileage!==null)throw Error('週次全体平均に年式別の走行距離を混ぜないでください');
    if(metric==='year_avg'&&count!==null)throw Error('車種全体の査定件数を年式別の件数として登録しないでください');
    const observation=date(input.observed_on,'確認日');
    const period=date(input.period_end,'集計終了日');
    const published=date(input.published_on,'記事公開日',true);
    if(published&&published<period)throw Error('記事公開日が集計終了日より前です');
    if(observation<period)throw Error('確認日は集計終了日以降にしてください');
    return {
      make,model,powertrain,segment,metric,model_year:year,
      period_end:period,published_on:published,observed_on:observation,
      average_estimate_jpy:integer(input.average_estimate_jpy,'平均売却予想額',1,100000000,false),
      average_mileage_km:mileage,sample_count:count,
      source_url:sourceUrl(input.source_url),memo:clean(input.memo,200)
    };
  }
  function key(r){return [r.make,r.model,r.powertrain,r.segment,r.metric,r.model_year===null?'':r.model_year,r.period_end,r.source_url].join('|');}
  function series(r){return [r.make,r.model,r.powertrain,r.segment,r.metric,r.model_year===null?'':r.model_year,r.source_url].join('|');}
  function merge(a,b){
    if(!Array.isArray(a)||!Array.isArray(b)||a.length+b.length>MAX*2)throw Error('取込件数が多すぎます');
    const map=new Map();
    for(const raw of a.concat(b)){
      const r=normalize(raw),k=key(r),prior=map.get(k);
      if(prior&&JSON.stringify(prior)!==JSON.stringify(r))throw Error('同一集計期間・条件の数値が異なります。原典照合後に登録してください');
      map.set(k,r);
      if(map.size>MAX)throw Error('最大'+MAX+'件まで保存できます');
    }
    return [...map.values()].sort((x,y)=>y.period_end.localeCompare(x.period_end)||x.model.localeCompare(y.model));
  }
  function compare(records,r){
    const before=records.filter(x=>series(x)===series(r)&&x.period_end<r.period_end).sort((a,b)=>b.period_end.localeCompare(a.period_end))[0];
    if(!before)return null;
    return {before:before.period_end,amount:r.average_estimate_jpy-before.average_estimate_jpy,pct:((r.average_estimate_jpy/before.average_estimate_jpy)-1)*100};
  }
  function bundle(rows){return JSON.stringify({schema:SCHEMA,exported_on:localDate(),rows:merge([],rows)},null,2);}
  function parseBundle(s){
    let value;try{value=JSON.parse(s);}catch(e){throw Error('JSON形式が不正です');}
    if(!value||value.schema!==SCHEMA||!Array.isArray(value.rows))throw Error('リセバ総研記録のバックアップJSONではありません');
    return merge([],value.rows);
  }
  function localDate(){
    const d=new Date(),p=n=>String(n).padStart(2,'0');
    return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate());
  }
  function mount(doc,storage){
    const by=id=>doc.getElementById(id);
    const form=by('resale-form'),status=by('resale-status');
    if(!form||!status||!storage)return;
    const setStatus=message=>{status.textContent=message;};
    const get=id=>by(id).value;
    const fmt=n=>n.toLocaleString('ja-JP');
    let rows=[],healthy=true;
    try{
      const raw=storage.getItem(KEY);
      if(raw!==null){
        let parsed=JSON.parse(raw);
        if(!Array.isArray(parsed))throw Error('保存形式が異なります');
        rows=merge([],parsed);
      }
    }catch(e){
      healthy=false;
      setStatus('保存済み記録が読み込めません。既存データを保護するため保存・復元を停止しました：'+e.message);
      by('resale-save').disabled=true;by('resale-restore').disabled=true;
    }
    function persist(next){storage.setItem(KEY,JSON.stringify(next));rows=next;}
    function syncMetric(){
      const annual=get('resale-metric')==='year_avg';
      by('resale-year').disabled=!annual;by('resale-year').required=annual;
      by('resale-mileage').disabled=!annual;by('resale-sample').disabled=annual;
    }
    function makeLink(){
      const select=get('resale-quick');
      const chosen=LINKS.find(x=>x.model===select);
      if(chosen){
        by('resale-make').value=chosen.make;by('resale-model').value=chosen.model;
        by('resale-source').value=chosen.url;
      }
    }
    function render(){
      const list=by('resale-list');
      list.replaceChildren();
      by('resale-count').textContent=rows.length+'件の端末内手入力記録';
      if(!rows.length){list.textContent='記録はまだありません。公式記事を確認してから入力してください。';return;}
      rows.slice(0,25).forEach(r=>{
        const box=doc.createElement('div');box.className='resale-item';
        const title=doc.createElement('strong');title.textContent=r.make+' '+r.model+' '+(r.model_year===null?'週次全体':r.model_year+'年式')+' / '+r.period_end;
        const price=doc.createElement('span');price.textContent=fmt(r.average_estimate_jpy)+'円（売却予想額）';
        box.append(title,price);
        const caption=doc.createElement('small');
        caption.textContent=(r.powertrain==='gasoline'?'ガソリン':r.powertrain==='hybrid'?'HV':r.powertrain==='diesel'?'ディーゼル':r.powertrain==='electric'?'EV':r.powertrain==='mixed'?'複数方式混合':'その他')
          +'・'+r.segment+'・'+(r.metric==='year_avg'?'年式別平均':'週次全体平均')+' / 確認 '+r.observed_on
          +(r.average_mileage_km===null?'':' / 平均走行 '+fmt(r.average_mileage_km)+'km')
          +(r.sample_count===null?'':' / 同一週の査定 '+fmt(r.sample_count)+'件');
        box.append(caption);
        const delta=compare(rows,r);
        if(delta){
          const d=doc.createElement('small');d.textContent='前回の同条件記録('+delta.before+')比: '+(delta.amount>=0?'+':'')+fmt(delta.amount)+'円 ('+(delta.pct>=0?'+':'')+delta.pct.toFixed(1)+'%) ※構成差あり';
          box.append(d);
        }
        const link=doc.createElement('a');link.href=r.source_url;link.target='_blank';link.rel='noopener noreferrer';link.textContent='公式原典を確認';
        box.append(link);list.append(box);
      });
    }
    by('resale-observed').value=localDate();
    by('resale-quick').addEventListener('change',makeLink);
    by('resale-metric').addEventListener('change',syncMetric);
    makeLink();syncMetric();render();
    form.addEventListener('submit',e=>{
      e.preventDefault();if(!healthy)return;
      try{
        const v=id=>get(id);
        const record=normalize({
          make:v('resale-make'),model:v('resale-model'),powertrain:v('resale-powertrain'),segment:v('resale-segment'),
          metric:v('resale-metric'),model_year:by('resale-year').disabled?'':v('resale-year'),
          period_end:v('resale-period'),published_on:v('resale-published'),observed_on:v('resale-observed'),
          average_estimate_jpy:v('resale-price'),average_mileage_km:by('resale-mileage').disabled?'':v('resale-mileage'),
          sample_count:by('resale-sample').disabled?'':v('resale-sample'),source_url:v('resale-source'),memo:v('resale-memo')
        });
        const next=merge(rows,[record]);
        if(next.length===rows.length){setStatus('同じ集計期間・条件の記録は保存済みです。');return;}
        persist(next);render();setStatus('記録をこの端末に保存しました。USS実落札価格・実買取額ではありません。');
      }catch(err){setStatus('登録できません：'+err.message);}
    });
    by('resale-backup-show').addEventListener('click',()=>{
      try{by('resale-backup').value=bundle(rows);setStatus('バックアップJSONを表示しました。別の場所へコピーしてください。');}
      catch(e){setStatus('バックアップ表示に失敗：'+e.message);}
    });
    by('resale-restore').addEventListener('click',()=>{
      if(!healthy)return;
      try{
        const incoming=parseBundle(by('resale-backup').value),next=merge(rows,incoming);
        const added=next.length-rows.length;persist(next);render();setStatus('端末へ追加復元しました。追加 '+added+'件。');
      }catch(e){setStatus('復元できません。既存記録は維持しました：'+e.message);}
    });
    if(!healthy)by('resale-backup').placeholder='元データを上書きしないでください';
  }
  return {KEY,SCHEMA,MAX,LINKS,normalize,key,series,merge,compare,bundle,parseBundle,mount};
});
