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
    const title = payload.notification?.title || data.title || "🚨 Notificación D.A.T.A.";
    const body = payload.notification?.body || data.body || "Nuevo reporte registrado.";
    
    const machineId = data.machineId || data.maquina_id || '';
    const pieza = data.pieza || '';

    const options = {
        body: body,
        icon: data.icon || 'https://atochefariasj-gif.github.io/D.A.T.A/favicon.ico',
        badge: 'https://atochefariasj-gif.github.io/D.A.T.A/favicon.ico',
        vibrate: [200, 100, 200, 100, 200],
        // USAR UN TAG FIJO: evita que la pantalla se llene de múltiples notificaciones repetidas
        tag: 'mantenimiento-reporte',
        renotify: true,
        data: {
            machineId: machineId,
            pieza: pieza
        }
    };

    return self.registration.showNotification(title, options);
});

// Manejo del clic en la notificación
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
    const title = payload.notification?.title || data.title || "🚨 Notificación D.A.T.A.";
    const body = payload.notification?.body || data.body || "Nuevo reporte registrado.";
    
    const machineId = data.machineId || data.maquina_id || '';
    const pieza = data.pieza || '';

    const options = {
        body: body,
        icon: data.icon || 'https://atochefariasj-gif.github.io/D.A.T.A/favicon.ico',
        badge: 'https://atochefariasj-gif.github.io/D.A.T.A/favicon.ico',
        vibrate: [200, 100, 200, 100, 200],
        // USAR UN TAG FIJO: evita que la pantalla se llene de múltiples notificaciones repetidas
        tag: 'mantenimiento-reporte',
        renotify: true,
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

    // Construir la URL completa para evitar fallos de ruta en PC o móviles
    const targetPath = self.location.pathname.replace('firebase-messaging-sw.js', 'index.html');
    const urlDestino = `${self.location.origin}${targetPath}?maquina=${encodeURIComponent(machineId)}&pieza=${encodeURIComponent(pieza)}`;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
            // 1. Si la ventana ya está abierta (PC, Tablet o Celular)
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if ('focus' in client) {
                    client.focus();
                    // Enviar datos al script principal sin recargar
                    client.postMessage({
                        action: 'CARGAR_MAQUINA',
                        machineId: machineId,
                        pieza: pieza
                    });
                    return;
                }
            }

            // 2. Si la app estaba cerrada, abre la ventana con los parámetros en la URL
            if (clients.openWindow) {
                return clients.openWindow(urlDestino);
            }
        })
    );
});
