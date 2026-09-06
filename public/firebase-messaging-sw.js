/* VIKRAM push worker boundary. Provider credentials/configuration remain server-side. */
self.addEventListener('notificationclick',event=>{event.notification.close();const url=event.notification?.data?.url||'/';event.waitUntil(clients.matchAll({type:'window',includeUncontrolled:true}).then(list=>{for(const c of list){if('focus' in c)return c.focus();}return clients.openWindow(url);}));});
