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
// DENTRO DE firebase-messaging-sw.js

self.addEventListener('notificationclick', function(event) {
    event.notification.close();

    const data = event.notification.data || {};
    const machineId = data.machineId || '';
    const pieza = data.pieza || '';

    // URL ABSOLUTA Y EXACTA DE TU PROYECTO
    const baseUrl = 'https://atochefariasj-gif.github.io/D.A.T.A/index.html';
    const urlDestino = `${baseUrl}?maquina=${encodeURIComponent(machineId)}&pieza=${encodeURIComponent(pieza)}`;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
            // 1. Si la pestaña ya está abierta en la PC, la enfoca y le envía el mensaje
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

            // 2. Si la ventana estaba cerrada, abre la URL exacta
            if (clients.openWindow) {
                return clients.openWindow(urlDestino);
            }
        })
    );
});
