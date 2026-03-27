/*
 * Elahe Messenger v3.0 Notification Utilities
 *
 * Previously this module integrated with Firebase Cloud Messaging (FCM) to
 * handle push notifications and messaging tokens.  In version 3.0 we have
 * removed the Firebase dependency to simplify the application and reduce
 * vendor lock‑in.  Instead, notifications are handled via the standard
 * Web Push API and service workers.  The functions exported here provide
 * browser‑level fallbacks and shims so existing code continues to compile.
 */

// In the absence of Firebase, `app` and `messaging` have no meaning.  They
// remain as exported constants to satisfy imports but always resolve to null.
export const app: null = null;
export const messaging: null = null;

/**
 * Requests permission from the user to display notifications.  This wrapper
 * simply calls the native `Notification.requestPermission()` API when
 * executed in a browser environment and returns null.  If the permission
 * is granted you can register your own service worker and subscribe to
 * push events using `navigator.serviceWorker` and the Web Push API.
 */
export async function requestNotificationPermission(): Promise<null> {
  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return null;
  }
  try {
    const permission = await Notification.requestPermission();
    // If permission is granted, you could register a service worker here and
    // subscribe to push notifications.  Elahe Messenger does not create tokens
    // automatically in v3.0.  Instead, rely on server‑generated tokens or
    // other mechanisms if required.
    if (permission === 'granted') {
      // Placeholder for potential future push subscription logic.
      return null;
    }
  } catch (error) {
    // Silently ignore permission errors.  Consumers should handle null
    // results and decide whether to re‑prompt or fall back.
    console.error('Notification permission request failed', error);
  }
  return null;
}

/**
 * Provides a placeholder for listening to incoming messages when using
 * Firebase Cloud Messaging.  Without FCM there is no concept of message
 * payloads arriving client‑side, so this function simply returns a
 * resolved promise.  If you need client‑side messaging, implement it via
 * WebSockets (Socket.IO) which is already integrated in Elahe Messenger.
 */
export function onMessageListener(): Promise<null> {
  return Promise.resolve(null);
}