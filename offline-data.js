/* MD MARKET offline-first JSON reader.
 * Avoid triggering iOS cellular/Wi-Fi access prompts for background statistics
 * when airplane mode is active. This never edits or deletes persisted user data.
 */
(function(root){
 'use strict';
 async function read(url,options){
   const isOffline=typeof navigator!=='undefined' && navigator.onLine===false;
   if(!isOffline)return fetch(url,options);
   // Only read same-origin application data: no outgoing fetch while offline.
   const target=new URL(url,location.href);
   if(target.origin!==location.origin)throw new Error('オフライン中は外部URLを取得できません');
   if(typeof caches!=='undefined' && typeof caches.match==='function'){
     try{
       const cached=await caches.match(target.href,{ignoreSearch:true});
       if(cached && cached.ok)return cached;
     }catch(error){console.warn('Offline cache read:',error)}
   }
   throw new Error('オフライン：この統計の保存済みコピーがありません。オンライン時に一度表示してください。');
 }
 const API=Object.freeze({read});
 root.MDOffline=API;
 if(typeof module==='object'&&module.exports)module.exports=API;
})(typeof window==='undefined'?globalThis:window);
