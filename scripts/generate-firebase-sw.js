#!/usr/bin/env node
/**
 * Firebase Messaging Service Worker をビルド時に生成。
 * 環境変数 VITE_FIREBASE_* を埋め込む（.env.local / Vercel env 対応）
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

dotenv.config({ path: path.join(root, '.env') });
dotenv.config({ path: path.join(root, '.env.local'), override: true });

const config = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || 'PLACEHOLDER_API_KEY',
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || 'PLACEHOLDER_AUTH_DOMAIN',
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || 'PLACEHOLDER_PROJECT_ID',
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || 'PLACEHOLDER_STORAGE_BUCKET',
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || 'PLACEHOLDER_SENDER_ID',
  appId: process.env.VITE_FIREBASE_APP_ID || 'PLACEHOLDER_APP_ID',
};

const swContent = `/* Firebase Messaging Service Worker - 自動生成 */
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: '${config.apiKey}',
  authDomain: '${config.authDomain}',
  projectId: '${config.projectId}',
  storageBucket: '${config.storageBucket}',
  messagingSenderId: '${config.messagingSenderId}',
  appId: '${config.appId}',
});

firebase.messaging().onBackgroundMessage((payload) => {
  const title = payload?.notification?.title || payload?.data?.title || 'Tyson';
  const options = {
    body: payload?.notification?.body || payload?.data?.body || '新しい音声が届きました',
    icon: '/icon-192.png',
  };
  self.registration.showNotification(title, options);
});
`;

const outPath = path.join(root, 'public', 'firebase-messaging-sw.js');
fs.writeFileSync(outPath, swContent, 'utf8');
console.log('[generate-firebase-sw] wrote', outPath);
