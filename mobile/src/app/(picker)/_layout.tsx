import { Tabs } from 'expo-router';
import { ListTodo, User } from 'lucide-react-native';
import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { api } from '../../lib/api';
import { playPickerAlertSound } from '../../lib/alertSound';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export default function PickerLayout() {
  useEffect(() => {
    registerForPushNotificationsAsync().then(token => {
      if (token) {
        api.post('/notifications/push-token', { token }).catch(() => {});
      }
    });

    // Automatically trigger custom warehouse alert bell when push notifications arrive
    const subscription = Notifications.addNotificationReceivedListener(() => {
      playPickerAlertSound();
    });

    return () => subscription.remove();
  }, []);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#003527',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: '#e5e7eb',
          backgroundColor: '#ffffff',
          height: 60,
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontFamily: 'Inter_500Medium',
          fontSize: 12,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ href: null }} />
      <Tabs.Screen
        name="jobs"
        options={{
          title: 'Jobs',
          tabBarIcon: ({ color }) => <ListTodo size={24} color={color} />,
        }}
      />
      <Tabs.Screen name="alerts" options={{ href: null }} />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color }) => <User size={24} color={color} />,
        }}
      />
      <Tabs.Screen name="job/[id]" options={{ href: null }} />
    </Tabs>
  );
}

async function registerForPushNotificationsAsync() {
  try {
    let token;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#003527',
      });
    }

    // Fast check for existing permissions without blocking emulator execution
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      return null;
    }

    // Wrap push token acquisition in a fast race timeout to prevent 30s network freeze on emulators without GMS
    const tokenPromise = Notifications.getExpoPushTokenAsync({
      projectId: '6b1dece6-112e-4592-a5d3-43a57684b613',
    }).then(res => res.data);
    
    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Push token timeout')), 2500));
    
    token = await Promise.race([tokenPromise, timeoutPromise]);
    return token;
  } catch (err) {
    // Silently ignore push token failures on emulators or unconfigured EAS builds so loading is instantaneous
    return null;
  }
}
