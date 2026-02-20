/**
 * FCM Push 通知 - 親画面（PairDailyPage）専用。
 * 通知許可 → token 取得 → Firestore 保存。
 */
import { getMessaging, getToken, isSupported } from 'firebase/messaging';
import { doc, setDoc } from 'firebase/firestore';
import { app, db } from './firebase';

const DEVICE_ID_KEY = 'tyson_fcm_device_id';
const ROLE_PARENT = 'parent';

/** デバイスID取得（永続化） */
function getOrCreateDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_ID_KEY);
    if (!id && typeof crypto !== 'undefined' && crypto.randomUUID) {
      id = crypto.randomUUID();
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    if (!id) {
      id = `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(DEVICE_ID_KEY, id);
    }
    return id;
  } catch {
    return `web-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/**
 * 通知許可をリクエストし、許可されたら FCM token を取得して Firestore に保存。
 * @param {string} pairId
 * @returns {{ success: boolean; permission?: NotificationPermission; error?: string }}
 */
export async function registerForPush(pairId) {
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
  if (!vapidKey || typeof vapidKey !== 'string' || vapidKey.trim() === '') {
    return { success: false, error: 'VAPID_KEY_UNSET' };
  }

  if (!('Notification' in window)) {
    return { success: false, error: 'NOTIFICATION_NOT_SUPPORTED' };
  }

  let permission = Notification.permission;
  if (permission === 'denied') {
    return { success: false, permission: 'denied', error: 'PERMISSION_DENIED' };
  }

  if (permission === 'default') {
    try {
      permission = await Notification.requestPermission();
    } catch (e) {
      return { success: false, error: 'REQUEST_FAILED', detail: e?.message };
    }
    if (permission !== 'granted') {
      return { success: false, permission, error: 'PERMISSION_NOT_GRANTED' };
    }
  }

  const supported = await isSupported();
  if (!supported) {
    return { success: false, error: 'MESSAGING_NOT_SUPPORTED' };
  }

  try {
    const messaging = getMessaging(app);
    const token = await getToken(messaging, { vapidKey: vapidKey.trim() });
    if (!token) {
      return { success: false, error: 'TOKEN_EMPTY' };
    }

    const deviceId = getOrCreateDeviceId();
    const now = new Date().toISOString();
    const deviceRef = doc(db, 'pair_users', pairId, 'parentDevices', deviceId);
    await setDoc(deviceRef, {
      token,
      platform: 'web',
      createdAt: now,
      updatedAt: now,
      lastSeenAt: now,
    }, { merge: true });

    return { success: true, permission: 'granted' };
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[FCM] registerForPush failed:', e);
    return {
      success: false,
      error: e?.code || 'UNKNOWN',
      detail: e?.message,
    };
  }
}

/** 通知許可済みか */
export function isNotificationGranted() {
  return typeof Notification !== 'undefined' && Notification.permission === 'granted';
}
