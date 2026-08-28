// Manejador para el clic en la notificación desde segundo plano
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

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
        icon: '/assets/icon.png',
        vibrate: [200, 100, 200, 100, 200],
        data: payload.data || {}
    };

    self.registration.showNotification(title, options);
});
self.addEventListener('notificationclick', function(event) {
    event.notification.close();

    const machineId = event.notification.data ? event.notification.data.machineId : null;
    const urlToOpen = new URL(self.location.origin);

    if (machineId) {
        urlToOpen.searchParams.set('machineId', machineId);
    }

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            // Si ya hay una ventana abierta, la enfocamos y enviamos la orden
            for (let i = 0; i < clientList.length; i++) {
                let client = clientList[i];
                if ('focus' in client) {
                    client.postMessage({ accion: 'CARGAR_MAQUINA', machineId: machineId });
                    return client.focus();
                }
            }
            // Si está cerrada, abre la aplicación directamente
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen.href);
            }
        })
    );
});
