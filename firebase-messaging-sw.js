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
        icon: './assets/icon.png',
        vibrate: [200, 100, 200, 100, 200],
        data: payload.data || {}
    };

    self.registration.showNotification(title, options);
});