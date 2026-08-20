import { useState } from 'react';
import { View, Text, TouchableOpacity, Switch, ActivityIndicator, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/authStore';
import { LogOut, ShieldCheck, UserCheck, UserX, Mail, User, Briefcase } from 'lucide-react-native';
import { api } from '../../lib/api';
import { setPickerInfo } from '../../lib/session';
import Svg, { Path } from 'react-native-svg';

export default function ProfileScreen() {
 const { picker, setPicker, logout } = useAuthStore();
 const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);

 const isOnline = picker?.isAvailable !== false && (picker as any)?.is_available !== false;

 const handleToggleOnline = async (val: boolean) => {
  try {
   setIsUpdatingStatus(true);
   await api.patch(`/users/me/status?is_available=${val}`);
   const updatedPicker = { ...picker!, isAvailable: val, is_available: val } as any;
   setPicker(updatedPicker);
   await setPickerInfo(JSON.stringify(updatedPicker));
  } catch (err) {
   console.warn('Could not update online availability status:', err);
  } finally {
   setIsUpdatingStatus(false);
  }
 };

 const fullName = picker?.full_name || picker?.name || 'Enterprise Operative';
 const userName = picker?.email ? picker.email.split('@')[0] : 'operative';
 const emailAddr = picker?.email || 'picker@nexware.com';

 return (
  <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
   {/* Brand Header */}
   <View className="px-4 py-3.5 bg-white mb-4 border-b border-gray-100 shadow-sm flex-row items-center justify-between">
    <View className="flex-row items-center">
     <View className="mr-2">
      <Svg width="28" height="28" viewBox="0 0 40 40" fill="none">
       <Path d="M20 2L36 11V29L20 38L4 29V11L20 2Z" fill="#064e3b" />
       <Path d="M14 12L20 24L26 12M14 28V12M26 12V28" stroke="#80bea6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
     </View>
     <Text className="text-xl font-bold text-[#003527] ">Operative Profile</Text>
    </View>
    <View className={`px-2.5 py-1 rounded-full flex-row items-center border ${
     isOnline ? 'bg-emerald-100 border-emerald-300' : 'bg-slate-100 border-slate-300'
    }`}>
     <View className={`w-1.5 h-1.5 rounded-full mr-1.5 ${isOnline ? 'bg-emerald-600 animate-pulse' : 'bg-slate-400'}`} />
     <Text className={`text-[10px] font-extrabold uppercase tracking-wider ${isOnline ? 'text-[#006c49]' : 'text-slate-600'}`}>
      {isOnline ? 'Online Floor' : 'Offline'}
     </Text>
    </View>
   </View>

   <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }} className="flex-1">
    {/* User Identity Card */}
    <View className="bg-white rounded-3xl p-6 items-center border border-gray-200 shadow-sm mb-5 relative overflow-hidden">
     <View className="w-20 h-20 bg-[#003527] border-2 border-emerald-400 rounded-full items-center justify-center mb-3.5 shadow-md">
      <Text className="text-2xl font-extrabold text-white ">{picker?.initials || fullName.substring(0, 2).toUpperCase()}</Text>
     </View>
     <Text className="text-xl font-extrabold text-onSurface text-center">{fullName}</Text>
     
     <View className="bg-[#ecfdf5] border border-[#a7f3d0] px-3.5 py-1 rounded-full flex-row items-center mt-2 mb-4">
      <Briefcase size={14} color="#006c49" />
      <Text className="text-xs font-bold text-[#065f46] ml-1.5 uppercase tracking-wide">Picker (Floor Operative)</Text>
     </View>

     {/* Details list */}
     <View className="w-full bg-gray-50 rounded-2xl p-4 space-y-3 border border-gray-100 mt-1">
      <View className="flex-row items-center justify-between">
       <View className="flex-row items-center">
        <User size={16} color="#003527" className="mr-2.5" />
        <Text className="text-xs font-semibold text-gray-500 ">Username</Text>
       </View>
       <Text className="text-xs font-bold text-gray-800 ">@{userName}</Text>
      </View>

      <View className="h-[1px] bg-gray-200" />

      <View className="flex-row items-center justify-between">
       <View className="flex-row items-center">
        <Mail size={16} color="#003527" className="mr-2.5" />
        <Text className="text-xs font-semibold text-gray-500 ">Email Address</Text>
       </View>
       <Text className="text-xs font-bold text-gray-800 ">{emailAddr}</Text>
      </View>

      <View className="h-[1px] bg-gray-200" />

      <View className="flex-row items-center justify-between">
       <View className="flex-row items-center">
        <ShieldCheck size={16} color="#003527" className="mr-2.5" />
        <Text className="text-xs font-semibold text-gray-500 ">Security Clearance</Text>
       </View>
       <Text className="text-xs font-bold text-emerald-700 ">Touch-Tick Certified</Text>
      </View>
     </View>
    </View>

    {/* Floor Online/Offline Availability Card */}
    <View className={`rounded-3xl p-5 border shadow-sm mb-5 transition-colors ${
     isOnline ? 'bg-emerald-50/80 border-emerald-300' : 'bg-white border-gray-200'
    }`}>
     <View className="flex-row items-center justify-between">
      <View className="flex-row items-center flex-1 pr-3">
       <View className={`w-11 h-11 rounded-2xl items-center justify-center mr-3.5 ${
        isOnline ? 'bg-emerald-600' : 'bg-gray-200'
       }`}>
        {isOnline ? <UserCheck size={22} color="#ffffff" /> : <UserX size={22} color="#4b5563" />}
       </View>
       <View className="flex-1">
        <Text className="text-base font-extrabold text-gray-900 ">
         {isOnline ? 'Online (Available)' : 'Not Online (Offline)'}
        </Text>
        <Text className="text-xs text-gray-500 mt-0.5 leading-snug">
         {isOnline 
          ? 'Ready to receive real-time picklist assignments & alarm bells.'
          : 'Currently paused. Admin will see you as offline.'}
        </Text>
       </View>
      </View>
      {isUpdatingStatus ? (
       <ActivityIndicator color="#003527" />
      ) : (
       <Switch
        value={isOnline}
        onValueChange={handleToggleOnline}
        trackColor={{ false: '#d1d5db', true: '#10b981' }}
        thumbColor={isOnline ? '#003527' : '#f3f4f6'}
       />
      )}
     </View>
    </View>

    {/* Settings */}
    <View className="bg-white rounded-2xl border border-gray-200 shadow-sm mb-6 overflow-hidden">
     <TouchableOpacity
      className="flex-row items-center p-4 active:bg-red-50/50"
      onPress={logout}
     >
      <View className="w-9 h-9 rounded-xl bg-red-50 items-center justify-center mr-3">
       <LogOut size={19} color="#ba1a1a" />
      </View>
      <Text className="text-base font-bold text-red-600 ">Sign Out of Terminal</Text>
     </TouchableOpacity>
    </View>

    {/* Brand Footer */}
    <View className="pb-6 items-center justify-center">
     <Text className="text-[11px] font-bold text-emerald-800/80 ">
      NexWare Enterprise Suite • Floor Operational Module
     </Text>
     <Text className="text-[10px] text-gray-400 mt-0.5">
      Synchronized with Admin Command Center v1.0
     </Text>
    </View>
   </ScrollView>
  </SafeAreaView>
 );
}

