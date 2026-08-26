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
 _tokenCache = null;
 _pickerInfoCache = null;
 await removeToken();
 await removePickerInfo();
}
