import '../../global.css';
import { useEffect, useState } from 'react';
import { Slot, useRouter, useSegments } from 'expo-router';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { View, ActivityIndicator } from 'react-native';
import { getToken, getPickerInfo } from '../lib/session';
import { useAuthStore } from '../store/authStore';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient();

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter: Inter_400Regular,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const [isReady, setIsReady] = useState(false);
  const [forceRender, setForceRender] = useState(false);
  const router = useRouter();
  const segments = useSegments();
  const { isAuthenticated, setAuthenticated, setPicker } = useAuthStore();

  // Safety valve: prevent infinite loading spinner if font downloading or SecureStore stalls
  useEffect(() => {
    const timeout = setTimeout(() => {
      setForceRender(true);
      setIsReady(true);
    }, 1500);
    return () => clearTimeout(timeout);
  }, []);

  useEffect(() => {
    let isMounted = true;
    const restoreSession = async () => {
      try {
        // Wrap SecureStore in a race with a 1.2s timer to prevent Android KeyStore hang on restart
        const sessionPromise = Promise.all([getToken(), getPickerInfo()]);
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('SecureStore timeout')), 1200));
        
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
    return () => { isMounted = false; };
  }, []);

  const canRender = (fontsLoaded || fontError || forceRender) && isReady;

  useEffect(() => {
    if (!canRender) return;

    const inAuthGroup = segments[0] === '(auth)';
    const inPickerGroup = segments[0] === '(picker)';
    
    if (isAuthenticated && !inPickerGroup) {
      // If logged in but sitting at root (/) or auth screens, push to dashboard
      router.replace('/(picker)/jobs');
    } else if (!isAuthenticated && !inAuthGroup) {
      // If not logged in and trying to access anything other than auth, push to login
      router.replace('/(auth)/login');
    }
  }, [isAuthenticated, canRender, segments]);

  if (!canRender) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#000806' }}>
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <Slot />
    </QueryClientProvider>
  );
}
