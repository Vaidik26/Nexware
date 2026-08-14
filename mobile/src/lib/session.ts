import * as SecureStore from 'expo-secure-store';

export async function setToken(token: string) {
 await SecureStore.setItemAsync('nexware_token', token);
}

export async function getToken() {
 return await SecureStore.getItemAsync('nexware_token');
}

export async function removeToken() {
 await SecureStore.deleteItemAsync('nexware_token');
}

export async function setPickerInfo(info: string) {
 await SecureStore.setItemAsync('nexware_picker_info', info);
}

export async function getPickerInfo() {
 return await SecureStore.getItemAsync('nexware_picker_info');
}

export async function removePickerInfo() {
 await SecureStore.deleteItemAsync('nexware_picker_info');
}

export async function clearSession() {
 await removeToken();
 await removePickerInfo();
}
