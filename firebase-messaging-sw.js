importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyBNfhgBdIe05n3L0YfbsmZbNVYVlDxDXZk",
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
    const title = payload.notification?.title || "📌 Notificación D.A.T.A.";
    const options = {
        body: payload.notification?.body || "Nuevo reporte de mantenimiento",
        icon: './assets/icon.png',
        vibrate: [200, 100, 200, 100, 200],
        data: payload.data || {}
    };

    self.registration.showNotification(title, options);
});
// Manejar clics en las notificaciones push
self.addEventListener('notificationclick', function(event) {
    event.notification.close();

    // Obtener la URL o el ID de la máquina que vino en los datos de la notificación
    const data = event.notification.data || {};
    const maquinaId = data.maquinaId || ''; // O la URL completa a donde quieres dirigir

    // URL a la que redirigirá (ajusta según cómo manejes las rutas en tu app)
    const urlDestino = maquinaId ? `./index.html?maquina=${maquinaId}` : './index.html';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
            // Si la app ya está abierta en una pestaña, enfócala y cámbiala de URL
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url.includes('index.html') && 'focus' in client) {
                    client.focus();
                    return client.navigate(urlDestino);
                }
            }
            // Si no está abierta, abre una nueva pestaña
            if (clients.openWindow) {
                return clients.openWindow(urlDestino);
            }
        })
    );
});
