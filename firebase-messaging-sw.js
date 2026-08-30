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
    // Extraer variables desde data o notification
    const data = payload.data || {};
    const title = data.title || payload.notification?.title || "🚨 Notificación D.A.T.A.";
    const body = data.body || payload.notification?.body || "Nuevo reporte registrado.";
    
    const machineId = data.machineId || data.maquina_id || '';
    const pieza = data.pieza || '';

    const options = {
        body: body,
        icon: data.icon || './assets/icon.png',
        badge: './assets/icon.png',
        vibrate: [200, 100, 200, 100, 200],
        tag: `reporte-${Date.now()}`,
        data: {
            machineId: machineId,
            pieza: pieza
        }
    };

    return self.registration.showNotification(title, options);
});

// Manejo del clic en la notificación
self.addEventListener('notificationclick', function(event) {
    event.notification.close();

    const data = event.notification.data || {};
    const machineId = data.machineId || '';
    const pieza = data.pieza || '';

    // Construir la URL con los parámetros para abrir el modelo 3D directamente
    const baseUrl = self.location.origin + self.location.pathname.replace('firebase-messaging-sw.js', '');
    const urlToOpen = `${baseUrl}index.html?maquina=${encodeURIComponent(machineId)}&pieza=${encodeURIComponent(pieza)}`;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            // Si hay una pestaña abierta del sitio, la enfocamos y navegamos
            for (let i = 0; i < clientList.length; i++) {
                let client = clientList[i];
                if ('navigate' in client) {
                    client.navigate(urlToOpen);
                    return client.focus();
                }
            }
            // Si la app estaba cerrada, la abrimos
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});
