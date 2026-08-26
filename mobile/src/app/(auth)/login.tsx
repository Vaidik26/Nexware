import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StatusBar, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '../../lib/api';
import { setToken, setPickerInfo } from '../../lib/session';
import { useAuthStore } from '../../store/authStore';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Lock, User, ArrowRight, ShieldCheck, Box, Bell, Eye, EyeOff } from 'lucide-react-native';
import Svg, { Path } from 'react-native-svg';

const { height: SCREEN_H } = Dimensions.get('window');
const isSmall = SCREEN_H < 700; // Xiaomi and compact phones

export default function LoginScreen() {
 const [email, setEmail] = useState('');
 const [password, setPassword] = useState('');
 const [isLoading, setIsLoading] = useState(false);
 const [error, setError] = useState('');
 const [showPassword, setShowPassword] = useState(false);
 
 const router = useRouter();
 const { setAuthenticated, setPicker } = useAuthStore();

 const handleLogin = async () => {
  if (!email.trim() || !password.trim()) {
   setError('Please enter both email and password');
   return;
  }

  setIsLoading(true);
  setError('');
  
  try {
   const res = await api.post('/auth/login', {
    email: email.trim(),
    password: password,
   });
   
   const { token, user } = res.data;
   
   if (user.user_type !== 'picker' && user.user_type !== 'admin' && user.user_type !== 'sales') {
    setError('Unauthorized role access');
    return;
   }

   await setToken(token);
   await setPickerInfo(JSON.stringify(user));
   setPicker(user);
   setAuthenticated(true);
   // Navigation is handled by _layout.tsx based on authentication and role
  } catch (err: any) {
   if (err.message && err.message.includes('Network Error')) {
    setError('Cannot connect to NexWare server. Please check network connection.');
   } else {
    setError(err.response?.data?.detail || 'Incorrect email or password');
   }
  } finally {
   setIsLoading(false);
  }
 };

 return (
  <SafeAreaView className="flex-1 bg-[#000806]">
   <StatusBar barStyle="light-content" backgroundColor="#000806" />
   <KeyboardAvoidingView
    behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    className="flex-1"
   >
    <ScrollView
     contentContainerStyle={{ paddingHorizontal: 24, paddingTop: isSmall ? 16 : 32, paddingBottom: 32 }}
     keyboardShouldPersistTaps="handled"
     showsVerticalScrollIndicator={false}
    >
     {/* Header & Brand Identity */}
     <View style={{ paddingBottom: isSmall ? 12 : 24, alignItems: 'center' }}>
      <View className="flex-row items-center justify-center mb-4">
       <View className="shadow-lg mr-3">
        <Svg width="56" height="56" viewBox="0 0 40 40" fill="none">
         <Path d="M20 2L36 11V29L20 38L4 29V11L20 2Z" fill="#064e3b" />
         <Path d="M14 12L20 24L26 12M14 28V12M26 12V28" stroke="#80bea6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        </Svg>
       </View>
       <View>
        <Text className="text-4xl font-extrabold text-white tracking-tight ">
         NexWare
        </Text>
        <View className="bg-emerald-500/20 border border-emerald-400/30 px-2.5 py-0.5 rounded-full self-start mt-1">
         <Text className="text-[11px] font-bold text-emerald-300 uppercase tracking-widest ">
          Mobile Terminal
         </Text>
        </View>
       </View>
      </View>

      <Text className="text-sm text-emerald-100/70 text-center max-w-xs leading-relaxed">
       Next-Gen Supply & Warehouse Intelligence. Fast touch-tick picking & live synchronization.
      </Text>
     </View>

      {/* Feature Highlight Pills — hidden on very small screens to save vertical space */}
     {!isSmall && (
      <View className="flex-row justify-between mb-8 px-1">
       <View className="flex-1 bg-[#001712] border border-emerald-500/20 rounded-2xl p-3 mr-2 items-center shadow-sm">
        <Box color="#34d399" size={20} className="mb-1" />
        <Text className="text-[11px] font-bold text-slate-200 ">Smart Paths</Text>
        <Text className="text-[9px] text-slate-400 text-center mt-0.5">Optimized routing</Text>
       </View>

       <View className="flex-1 bg-[#001712] border border-emerald-500/20 rounded-2xl p-3 mx-1 items-center shadow-sm">
        <Bell color="#10b981" size={20} className="mb-1" />
        <Text className="text-[11px] font-bold text-slate-200 ">Live Bells</Text>
        <Text className="text-[9px] text-slate-400 text-center mt-0.5">Instant alarm feed</Text>
       </View>

       <View className="flex-1 bg-[#001712] border border-emerald-500/20 rounded-2xl p-3 ml-2 items-center shadow-sm">
        <ShieldCheck color="#6ee7b7" size={20} className="mb-1" />
        <Text className="text-[11px] font-bold text-slate-200 ">Touch Tick</Text>
        <Text className="text-[9px] text-slate-400 text-center mt-0.5">Zero scan variance</Text>
       </View>
      </View>
     )}

     {/* Login Card */}
     <View style={{ backgroundColor: 'rgba(0,23,18,0.95)', borderWidth: 1, borderColor: 'rgba(16,185,129,0.3)', borderRadius: 28, padding: isSmall ? 20 : 28, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 20, elevation: 8 }}>
      <View style={{ marginBottom: isSmall ? 16 : 24 }}>
       <Text className="text-2xl font-extrabold text-white tracking-tight ">
        Welcome back
       </Text>
       <Text className="text-xs text-slate-300 mt-1">
        Sign in with your enterprise credentials to unlock floor tasks.
       </Text>
      </View>

      {error ? (
       <View className="bg-red-950/60 p-3.5 rounded-2xl mb-5 border border-red-500/40 flex-row items-center">
        <Text className="text-red-300 text-xs font-semibold flex-1">{error}</Text>
       </View>
      ) : null}

      <View className="space-y-4 mb-6">
       <View>
        <Text className="text-xs font-bold text-emerald-300/90 uppercase tracking-wider mb-2 ">
         Email or Username
        </Text>
        <View className="flex-row items-center bg-[#000d0a] border border-emerald-500/40 rounded-2xl px-4 h-14 shadow-inner">
         <User color="#10b981" size={19} />
         <TextInput
          className="flex-1 ml-3.5 text-sm font-semibold text-white"
          placeholder="picker@nexware.com"
          placeholderTextColor="#475569"
          autoCapitalize="none"
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
         />
        </View>
       </View>

       <View className="mt-4">
        <Text className="text-xs font-bold text-emerald-300/90 uppercase tracking-wider mb-2 ">
         Password
        </Text>
        <View className="flex-row items-center bg-[#000d0a] border border-emerald-500/40 rounded-2xl px-4 h-14 shadow-inner">
         <Lock color="#10b981" size={19} />
         <TextInput
          className="flex-1 ml-3.5 text-sm font-semibold text-white"
          placeholder="••••••••"
          placeholderTextColor="#475569"
          secureTextEntry={!showPassword}
          value={password}
          onChangeText={setPassword}
         />
         <TouchableOpacity onPress={() => setShowPassword(!showPassword)} className="p-2">
          {showPassword ? <EyeOff color="#94a3b8" size={19} /> : <Eye color="#94a3b8" size={19} />}
         </TouchableOpacity>
        </View>
       </View>
      </View>

      <TouchableOpacity
       className="w-full bg-emerald-600 border border-emerald-400/30 h-14 rounded-2xl items-center justify-center shadow-lg shadow-emerald-900/50 active:bg-emerald-700 flex-row mt-2"
       onPress={handleLogin}
       disabled={isLoading}
      >
       {isLoading ? (
        <ActivityIndicator color="#ffffff" />
       ) : (
        <>
         <Text className="text-white font-extrabold text-base mr-2">Sign In to Terminal</Text>
         <ArrowRight color="#ffffff" size={18} />
        </>
       )}
      </TouchableOpacity>
     </View>

     {/* Footer */}
     <View className="mt-8 items-center justify-center">
      <Text className="text-[11px] font-medium text-emerald-400/60 ">
       © 2026 NexWare Enterprise • Secure Operations
      </Text>
      <Text className="text-[10px] font-normal text-slate-500 mt-1">
       v1.0.0 (Touch-Tick Certified)
      </Text>
     </View>
    </ScrollView>
   </KeyboardAvoidingView>
  </SafeAreaView>
 );
}
