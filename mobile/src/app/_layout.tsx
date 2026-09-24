import '../../global.css';
import { useEffect, useState } from 'react';
import { Slot, useRouter, useSegments, SplashScreen } from 'expo-router';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { View, ActivityIndicator } from 'react-native';
import { getToken, getPickerInfo } from '../lib/session';
import { pruneLpoPhotoDir } from '../lib/lpoFiles';
import { useAuthStore } from '../store/authStore';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
 defaultOptions: {
  queries: {
   // The default is 3 retries with backoff. Requests now carry realistic
   // timeouts of their own, so three further attempts on top of one that
   // already waited its full budget just leaves the user watching a spinner.
   retry: 1,
  },
 },
});

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
 const [fontsLoaded, fontError] = useFonts({
  Inter: Inter_400Regular,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
 });

 const [isReady, setIsReady] = useState(false);
 const router = useRouter();
 const segments = useSegments();
 const { isAuthenticated, setAuthenticated, setPicker } = useAuthStore();

 // We only use the safety valve for the session restore, not for fonts.
 // We MUST wait for fontsLoaded to be true before rendering to avoid font warnings.
 const canRender = (fontsLoaded || fontError) && isReady;

 useEffect(() => {
  let isMounted = true;
  const restoreSession = async () => {
   try {
    // Raced so a keystore that never answers cannot pin the splash screen
    // forever — but with a budget that only a genuinely stuck read can exhaust.
    //
    // This was 1.2s, which a busy device beats routinely, and losing the race
    // lands in the catch below and signs the user out. A stored session was
    // therefore discarded for being slow to read rather than for being invalid,
    // sending someone back to the login screen mid-shift with nothing wrong.
    // Waiting a few seconds more on a bad day is the cheaper of the two.
    const sessionPromise = Promise.all([getToken(), getPickerInfo()]);
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('SecureStore timeout')), 5000));

    const [token, pickerInfo] = (await Promise.race([sessionPromise, timeoutPromise])) as [string | null, string | null];
    
    if (isMounted) {
     if (token && pickerInfo) {
      setPicker(JSON.parse(pickerInfo));
      setAuthenticated(true);
     } else {
      setAuthenticated(false);
     }
    }
   } catch (e) {
    if (isMounted) setAuthenticated(false);
   } finally {
    if (isMounted) setIsReady(true);
   }
  };
  
  restoreSession();

  // Clear photos left behind by previous launches. Started alongside the
  // session restore rather than awaited — it must never delay the splash — and
  // safe to run here because nothing has had a chance to stage a new photo yet.
  //
  // Without this, only the devices that get a fresh install benefit from the
  // disposal added elsewhere; the ones already carrying a backlog of a
  // salesperson's photos would keep it forever.
  void pruneLpoPhotoDir();

  return () => { isMounted = false; };
 }, []);

 useEffect(() => {
  if (!canRender) return;

  const inAuthGroup = segments[0] === '(auth)';
  const inPickerGroup = segments[0] === '(picker)';
  const inLpoGroup = segments[0] === '(lpo)';
  
  if (isAuthenticated) {
   const isLpoUser = useAuthStore.getState().picker?.user_type === 'sales';
   if (isLpoUser && !inLpoGroup) {
    router.replace('/(lpo)/create');
   } else if (!isLpoUser && !inPickerGroup) {
    router.replace('/(picker)/jobs');
   }
  } else if (!isAuthenticated && !inAuthGroup) {
   // If not logged in and trying to access anything other than auth, push to login
   router.replace('/(auth)/login');
  }
 }, [isAuthenticated, canRender, segments]);

 useEffect(() => {
  if (canRender) {
   SplashScreen.hideAsync();
  }
 }, [canRender]);

 if (!canRender) {
  return null; // Return null to keep splash screen visible, instead of ActivityIndicator
 }

 return (
  <QueryClientProvider client={queryClient}>
   <Slot />
  </QueryClientProvider>
 );
}
