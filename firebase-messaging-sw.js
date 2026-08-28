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

// Manejador para notificaciones en segundo plano / pantalla bloqueada
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

// Manejar clics en las notificaciones push para ir directo al Visor 3D
self.addEventListener('notificationclick', function(event) {
    event.notification.close();

    const data = event.notification.data || {};
    // Extrae el ID de la máquina recibido en la carga útil (payload)
    const maquinaId = data.machineId || data.maquinaId || '';

    // Construye la URL agregando los parámetros exactos action=view3d
    const baseUrl = self.location.origin + self.location.pathname.replace('firebase-messaging-sw.js', 'index.html');
    const urlDestino = maquinaId 
        ? `${baseUrl}?action=view3d&machineId=${encodeURIComponent(maquinaId)}` 
        : baseUrl;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
            // Si la aplicación ya está abierta en una pestaña, la enfoca y navega al visor 3D
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if ('focus' in client) {
                    client.focus();
                    return client.navigate(urlDestino);
                }
            }
            // Si la aplicación estaba cerrada, abre una nueva ventana con el parámetro directo al 3D
            if (clients.openWindow) {
                return clients.openWindow(urlDestino);
            }
        })
    );
});
