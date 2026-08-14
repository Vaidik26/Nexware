import { useState, useEffect, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bell, Package, AlertTriangle, Volume2, ShieldAlert } from 'lucide-react-native';
import { playPickerAlertSound } from '../../lib/alertSound';
import api from '../../lib/api';
import Svg, { Path } from 'react-native-svg';

export default function AlertsScreen() {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [isRinging, setIsRinging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchNotifications = async () => {
    try {
      const res = await api.get('/notifications');
      if (res.data && Array.isArray(res.data) && res.data.length > 0) {
        const mapped = res.data.map((n: any) => ({
          id: String(n.id),
          title: n.title || 'Notification',
          message: n.message || '',
          time: new Date(n.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          type: n.type === 'job_cancelled' ? 'cancelled' : n.type === 'error' ? 'error' : 'info',
          read: n.is_read || false,
        }));
        setAlerts(mapped);
      }
    } catch (err) {
      // Offline fallback to current state or mock alerts
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchNotifications();
    setRefreshing(false);
  };

  const handleSimulateAlert = async () => {
    setIsRinging(true);
    await playPickerAlertSound();

    const randomId = Math.floor(900 + Math.random() * 90);
    const newAlert = {
      id: Date.now().toString(),
      title: `🚨 Urgent Picklist Assigned (#PX-${randomId})`,
      message: 'New order ready in Aisle 3. Please verify physical items via touch tick list.',
      time: 'Just now',
      type: 'info',
      read: false
    };

    setAlerts(prev => [newAlert, ...prev]);

    setTimeout(() => {
      setIsRinging(false);
    }, 4500);
  };

  const handleAlertPress = (item: any) => {
    setAlerts(prev => prev.map(a => a.id === item.id ? { ...a, read: true } : a));
    if (!item.read) {
      playPickerAlertSound();
      Alert.alert(item.title, item.message + '\n\n(Playing custom 4-5s warehouse alert ring)');
    } else {
      Alert.alert(item.title, item.message);
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    const isCancelled = item.type === 'cancelled';
    const isError = item.type === 'error';
    const Icon = isCancelled ? ShieldAlert : isError ? AlertTriangle : Package;
    const bgColor = isCancelled ? 'bg-rose-100 border border-rose-300' : isError ? 'bg-red-50' : 'bg-emerald-50';
    const iconColor = isCancelled || isError ? '#ba1a1a' : '#006c49';

    return (
      <TouchableOpacity 
        onPress={() => handleAlertPress(item)}
        className={`flex-row p-4 mb-3 bg-white rounded-2xl border border-gray-200 shadow-2xs ${
          isCancelled ? 'border-l-4 border-l-red-600 bg-rose-50/40' : !item.read ? 'border-l-4 border-l-[#003527] bg-[#f8f9ff]' : 'opacity-80'
        }`}
      >
        <View className={`w-11 h-11 rounded-2xl items-center justify-center mr-3.5 ${bgColor}`}>
          <Icon size={20} color={iconColor} />
        </View>
        <View className="flex-1 justify-center">
          <View className="flex-row items-center justify-between mb-1">
            <Text className={`font-sans text-sm ${!item.read ? 'font-extrabold text-[#0b1c30]' : 'font-semibold text-gray-700'}`}>{item.title}</Text>
            {!item.read && (
              <View className="bg-[#003527] px-2 py-0.5 rounded-full border border-emerald-400/30">
                <Text className="text-[9px] text-emerald-300 font-extrabold font-sans tracking-wider uppercase">NEW</Text>
              </View>
            )}
          </View>
          <Text className={`text-xs ${isCancelled ? 'text-red-900 font-medium' : 'text-gray-600'} font-sans leading-4`}>{item.message}</Text>
          <View className="flex-row items-center justify-between mt-2 pt-2 border-t border-gray-100">
            <Text className="text-[11px] text-gray-400 font-sans">{item.time}</Text>
            <Text className={`text-[11px] ${isCancelled ? 'text-red-700' : 'text-[#006c49]'} font-sans font-bold`}>
              {isCancelled ? 'Job cancelled by Admin' : 'Tap to review & play alarm'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top']}>
      {/* Brand Header */}
      <View className="px-4 py-3.5 bg-white mb-3.5 border-b border-gray-100 shadow-sm flex-row items-center justify-between">
        <View className="flex-row items-center">
          <View className="mr-2">
            <Svg width="28" height="28" viewBox="0 0 40 40" fill="none">
              <Path d="M20 2L36 11V29L20 38L4 29V11L20 2Z" fill="#064e3b" />
              <Path d="M14 12L20 24L26 12M14 28V12M26 12V28" stroke="#80bea6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </Svg>
          </View>
          <Text className="text-xl font-extrabold text-[#003527] font-sans">Floor Notifications</Text>
        </View>
        <View className="bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full flex-row items-center">
          <Volume2 size={13} color="#006c49" className="mr-1" />
          <Text className="text-[11px] font-extrabold text-[#006c49] font-sans">4.5s Bell Ready</Text>
        </View>
      </View>

      {/* Luxury Dark Emerald Alert Simulator Banner */}
      <View className="mx-4 mb-4 bg-[#001712] rounded-[24px] p-5 border border-emerald-500/30 shadow-lg">
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-row items-center">
            <Text className="text-white font-extrabold text-base font-sans mr-2">🔔 Warehouse Alert Engine</Text>
          </View>
          {isRinging ? (
            <View className="bg-red-500 px-2.5 py-0.5 rounded-full border border-red-300">
              <Text className="text-white text-[10px] font-extrabold font-sans tracking-wider uppercase">🔊 RINGING (4.5S)...</Text>
            </View>
          ) : (
            <View className="bg-emerald-500/20 px-2 py-0.5 rounded-full border border-emerald-400/30">
              <Text className="text-emerald-300 text-[10px] font-bold font-sans">TESTER</Text>
            </View>
          )}
        </View>
        <Text className="text-emerald-100/80 text-xs font-sans leading-4 mb-4">
          Simulate real-time task dispatch from the NexWare Admin dashboard. Plays the 4-5s shop-floor alarm bell and injects an assignment.
        </Text>
        <TouchableOpacity 
          onPress={handleSimulateAlert}
          disabled={isRinging}
          className={`py-3 px-4 rounded-xl flex-row items-center justify-center border ${isRinging ? 'bg-emerald-800 border-emerald-600' : 'bg-emerald-600 border-emerald-400/40 shadow-md shadow-emerald-950'}`}
          activeOpacity={0.85}
        >
          <Volume2 size={17} color="white" className="mr-2" />
          <Text className="text-white font-extrabold text-sm font-sans">
            {isRinging ? 'Playing Alert Bell Sound (4.5s)...' : 'Simulate New Job Alert & Ring Bell'}
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={alerts}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#006c49" />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28 }}
        ListEmptyComponent={
          <View className="items-center justify-center py-12">
            <Text className="text-gray-500 font-sans text-sm">No recent alerts or notifications.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}
