// Manejador para el clic en la notificación desde segundo plano
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
