'use client';

import { useEffect } from 'react';

const publicVapidKey = 'BBnXZtTiw0J0UBCgkJUXppUXiGtrkkgIJZEXpriCQMJ0ClRs9eL3v3Xg8FcHT-p7oxYzza40YNBPyn6gf0xTyWQ';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return;

    async function subscribe() {
      if ('serviceWorker' in navigator && 'PushManager' in window) {
        try {
          const registration = await navigator.serviceWorker.register('/sw.js');
          
          const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicVapidKey)
          });

          await fetch('/api/push/subscribe', {
            method: 'POST',
            body: JSON.stringify({
              subscription,
              userId
            }),
            headers: {
              'Content-Type': 'application/json'
            }
          });
        } catch (error) {
          console.error('Error subscribing to push notifications:', error);
        }
      }
    }

    // Request permission and subscribe
    if (Notification.permission === 'default') {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          subscribe();
        }
      });
    } else if (Notification.permission === 'granted') {
      subscribe();
    }
  }, [userId]);
}
