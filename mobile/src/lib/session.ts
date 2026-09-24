import * as SecureStore from 'expo-secure-store';

/**
 * Session storage.
 *
 * SecureStore is backed by the Android KeyStore / iOS Keychain, and a read can
 * take anywhere from a few milliseconds to hundreds on a cold or busy device.
 * Every API request needs the token, so reading it from the keystore each time
 * put that latency in front of every screen — the API client even had to race it
 * against a 1.2s timeout to stop the app hanging.
 *
 * The token is therefore cached in memory after the first read. It only changes
 * on login and logout, and both go through this module, so the cache cannot go
 * stale. Memory is cleared when the process dies, which is exactly when the
 * keystore should be consulted again.
 */

let _tokenCache: string | null | undefined; // undefined = not yet read from store
let _pickerInfoCache: string | null | undefined;

export async function setToken(token: string) {
 _tokenCache = token;
 await SecureStore.setItemAsync('nexware_token', token);
}

export async function getToken(): Promise<string | null> {
 if (_tokenCache !== undefined) return _tokenCache;
 try {
  _tokenCache = await SecureStore.getItemAsync('nexware_token');
 } catch {
  // A keystore failure must not wedge the app; treat it as "no session".
  _tokenCache = null;
 }
 return _tokenCache;
}

/** Synchronous peek. Returns undefined when the store has not been read yet. */
export function peekToken(): string | null | undefined {
 return _tokenCache;
}

export async function removeToken() {
 _tokenCache = null;
 await SecureStore.deleteItemAsync('nexware_token');
}

export async function setPickerInfo(info: string) {
 _pickerInfoCache = info;
 await SecureStore.setItemAsync('nexware_picker_info', info);
}

export async function getPickerInfo(): Promise<string | null> {
 if (_pickerInfoCache !== undefined) return _pickerInfoCache;
 try {
  _pickerInfoCache = await SecureStore.getItemAsync('nexware_picker_info');
 } catch {
  _pickerInfoCache = null;
 }
 return _pickerInfoCache;
}

export async function removePickerInfo() {
 _pickerInfoCache = null;
 await SecureStore.deleteItemAsync('nexware_picker_info');
}

export async function clearSession() {
 // Dropped first and synchronously, so the token is unusable for the rest of
 // this launch whatever the keystore does below.
 _tokenCache = null;
 _pickerInfoCache = null;

 // Both deletes are attempted even when one fails. They used to be sequential
 // awaits, so a keystore error on the token abandoned the picker info — and the
 // session restore in _layout only shows the login screen when BOTH are gone,
 // which made a half-cleared session look like a signed-in one on next launch.
 const results = await Promise.allSettled([removeToken(), removePickerInfo()]);
 for (const result of results) {
  if (result.status === 'rejected') {
   console.warn('Could not delete stored session key:', result.reason);
  }
 }
}
