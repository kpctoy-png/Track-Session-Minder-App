// Shows phone alerts for schedule changes (sent by the push-schedule Edge Function)
// and opens the app when one is tapped.
self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { body: event.data ? event.data.text() : '' };
  }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Track Session Minder', {
      body: data.body || 'The schedule changed. Tap to see the new times.',
      icon: 'icons/icon-192.png',
      tag: data.tag,
      renotify: true,
      data: { url: data.url || self.registration.scope },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => w.url.startsWith(self.registration.scope));
      return open ? open.focus() : self.clients.openWindow(event.notification.data.url);
    }),
  );
});
