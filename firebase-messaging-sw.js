importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyARO3Y2z_FZmC-_sL1LNGL7NKXPIIbCjPo",
  authDomain: "data-control-activos.firebaseapp.com",
  projectId: "data-control-activos",
  storageBucket: "data-control-activos.firebasestorage.app",
  messagingSenderId: "290148330315",
  appId: "1:290148330315:web:0653f07ed372fef8e9ddce"
});

const messaging = firebase.messaging();

// Manejador para notificaciones en segundo plano / app cerrada
messaging.onBackgroundMessage((payload) => {
    const title = payload.notification?.title || "🚨 Notificación D.A.T.A.";
    const body = payload.notification?.body || "Nuevo reporte registrado.";

    const options = {
        body: body,
        icon: './assets/icon.png',
        badge: './assets/icon.png',
        vibrate: [200, 100, 200, 100, 200],
        tag: `reporte-${Date.now()}`,
        data: payload.data || {} // Guardamos machineId, pieza y action enviados desde la Edge Function
    };

    self.registration.showNotification(title, options);
});

// Manejo del clic en la notificación
self.addEventListener('notificationclick', function(event) {
    event.notification.close();

    const data = event.notification.data || {};
    const machineId = data.machineId || data.maquina_id || '';
    const pieza = data.pieza || '';

    // Construir la URL con los parámetros para abrir el visor 3D directamente
    const baseUrl = self.location.origin + self.location.pathname.replace('firebase-messaging-sw.js', '');
    const urlToOpen = `${baseUrl}index.html?action=view3d&machineId=${encodeURIComponent(machineId)}&pieza=${encodeURIComponent(pieza)}`;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
            // Si ya hay una pestaña abierta del sitio, la reorientamos y la enfocamos
            for (let i = 0; i < clientList.length; i++) {
                let client = clientList[i];
                if (client.url.includes(self.location.origin) && 'navigate' in client) {
                    client.navigate(urlToOpen);
                    return client.focus();
                }
            }
            // Si la aplicación estaba totalmente cerrada, abrimos una nueva ventana
            if (clients.openWindow) {
                return clients.openWindow(urlToOpen);
            }
        })
    );
});
