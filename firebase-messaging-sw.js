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

// Manejador para recibir notificaciones en segundo plano
messaging.onBackgroundMessage((payload) => {
    const data = payload.data || {};
    const title = data.title || payload.notification?.title || "🚨 Notificación D.A.T.A.";
    const body = data.body || payload.notification?.body || "Nuevo reporte registrado.";
    
    const machineId = data.machineId || data.maquina_id || '';
    const pieza = data.pieza || '';

    const options = {
        body: body,
        icon: data.icon || './assets/logo.png',
        badge: './assets/logo.png',
        vibrate: [200, 100, 200, 100, 200],
        tag: `reporte-${Date.now()}`,
        data: {
            machineId: machineId,
            pieza: pieza
        }
    };

    return self.registration.showNotification(title, options);
});

// Manejo unificado del clic en la notificación
self.addEventListener('notificationclick', function(event) {
    event.notification.close();

    const data = event.notification.data || {};
    const machineId = data.machineId || '';
    const pieza = data.pieza || '';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
            // 1. Si la ventana ya está abierta, la enfoca y le envía el mensaje sin recargar
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if ('focus' in client) {
                    client.focus();
                    client.postMessage({
                        action: 'CARGAR_MAQUINA',
                        machineId: machineId,
                        pieza: pieza
                    });
                    return;
                }
            }

            // 2. Si la app estaba totalmente cerrada, la abre con los parámetros en la URL
            const urlDestino = `./index.html?maquina=${encodeURIComponent(machineId)}&pieza=${encodeURIComponent(pieza)}`;
            if (clients.openWindow) {
                return clients.openWindow(urlDestino);
            }
        })
    );
});
