self.addEventListener('notificationclick', function(event) {
    event.notification.close();

    const data = event.notification.data || {};
    const machineId = data.machineId || '';
    const pieza = data.pieza || '';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(windowClients) {
            // 1. Si la ventana de la app ya está abierta
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url.includes('index.html') && 'focus' in client) {
                    client.focus();
                    
                    // Enviar mensaje directo a script.js con la acción CARGAR_MAQUINA
                    client.postMessage({
                        action: 'CARGAR_MAQUINA',
                        machineId: machineId,
                        pieza: pieza
                    });
                    return;
                }
            }

            // 2. Si la app estaba cerrada, la abre pasando los parámetros en la URL
            const urlDestino = `./index.html?maquina=${encodeURIComponent(machineId)}&pieza=${encodeURIComponent(pieza)}`;
            if (clients.openWindow) {
                return clients.openWindow(urlDestino);
            }
        })
    );
});
