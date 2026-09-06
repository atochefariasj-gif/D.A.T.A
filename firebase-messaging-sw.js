importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyBNfhgBdIe05n3L0YfbsmZbNVYV1DXDXZk",
  authDomain: "data-control-activos.firebaseapp.com",
  projectId: "data-control-activos",
  storageBucket: "data-control-activos.firebasestorage.app",
  messagingSenderId: "290148330315",
  appId: "1:290148330315:web:0b53f07e03f72fefe9d6ce",
  measurementId: "G-ZE1NC3LB15"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const data = payload.data || {};
  const title = payload.notification?.title || data.title || "🚨 Notificación D.A.T.A.";
  const body = payload.notification?.body || data.body || "Nuevo reporte registrado.";

  const options = {
    body: body,
    icon: data.icon || 'https://atochefariasj-gif.github.io/D.A.T.A/logo.png',
    tag: 'reporte-mantenimiento-unico',
    renotify: true,
    data: {
      machineId: data.machineId || data.maquina_id || '',
      pieza: data.pieza || ''
    }
  };

  return self.registration.showNotification(title, options);
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  const data = event.notification.data || {};
  const machineId = data.machineId || '';
  const pieza = data.pieza || '';

  const baseUrl = 'https://atochefariasj-gif.github.io/D.A.T.A/index.html';
  const urlDestino = `${baseUrl}?maquina=${encodeURIComponent(machineId)}&pieza=${encodeURIComponent(pieza)}`;

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes('atochefariasj-gif.github.io') && 'focus' in client) {
          client.focus();
          client.postMessage({
            action: 'CARGAR_MAQUINA',
            machineId: machineId,
            pieza: pieza
          });
          return;
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(urlDestino);
      }
    })
  );
});
