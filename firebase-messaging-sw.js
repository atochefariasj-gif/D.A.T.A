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
    const title = payload.notification?.title || "🚨 Notificación D.A.T.A.";
    const maquinaId = payload.data?.maquina_id || '';

    const options = {
        body: payload.notification?.body || "Nuevo reporte registrado.",
        icon: './assets/icon.png',
        badge: './assets/icon.png',
        vibrate: [200, 100, 200, 100, 200],
        tag: `reporte-${Date.now()}`, // ⚠️ IMPORTANTE: Permite recibir múltiples notificaciones
        data: {
            url: `./index.html?maquina=${encodeURIComponent(maquinaId)}`
        }
    };

    self.registration.showNotification(title, options);
});

// Manejo del clic en la notificación
// En firebase-messaging-sw.js
self.addEventListener('notificationclick', function(event) {
    event.notification.close();

    const maquinaId = event.notification.data?.maquina_id || '';
    
    // Usar la raíz actual del sitio para evitar rutas rotas
    const baseUrl = self.location.origin + self.location.pathname.replace('firebase-messaging-sw.js', '');
    const urlToOpen = `${baseUrl}index.html?maquina=${encodeURIComponent(maquinaId)}`;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            for (let i = 0; i < clientList.length; i++) {
                let client = clientList[i];
                if ('navigate' in client) {
                    client.navigate(urlToOpen);
                    return client.focus();
                }
            }
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});
