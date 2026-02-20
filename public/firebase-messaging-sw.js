/* Firebase Messaging Service Worker - 自動生成 */
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyCmQ1y44N01a8t0E-j_6CHgFvAtzN4HWaA',
  authDomain: 'tyson-3341f.firebaseapp.com',
  projectId: 'tyson-3341f',
  storageBucket: 'tyson-3341f.firebasestorage.app',
  messagingSenderId: '486892592677',
  appId: '1:486892592677:web:04c067c0490ffd54f869cc',
});

firebase.messaging().onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || payload?.data?.title || 'Tyson';
  const options = {
    body: payload?.notification?.body || payload?.data?.body || '新しい音声が届きました',
    icon: '/icon-192.png',
  };
  self.registration.showNotification(title, options);
});
