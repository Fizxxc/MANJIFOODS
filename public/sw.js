/* No caching of authenticated HTML, API responses, proof URLs or personal data. */
self.addEventListener('install',()=>self.skipWaiting());
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('push',event=>{
 let id='order-update';try{id=event.data.json().id||id;}catch{}
 event.waitUntil(self.registration.showNotification('MANJI FOOD',{body:'Status pesanan MANJI FOOD diperbarui',icon:'/icons/icon-192.png',badge:'/icons/icon-192.png',tag:String(id),data:{url:'/notifications'}}));
});
self.addEventListener('notificationclick',event=>{event.notification.close();event.waitUntil((async()=>{const all=await self.clients.matchAll({type:'window',includeUncontrolled:true});for(const client of all){if('focus' in client){await client.navigate('/notifications');return client.focus();}}return self.clients.openWindow('/notifications');})());});
