import { useState, useCallback, useEffect } from 'react';
import { useFocusEffect } from 'expo-router';
import { View, Text, FlatList, RefreshControl, TouchableOpacity, TextInput, ActivityIndicator } from 'react-native';
import api from '../../lib/api';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Search, Filter } from 'lucide-react-native';
import JobCard from '../../components/JobCard';
import CircularProgress from '../../components/CircularProgress';
import { useAuthStore } from '../../store/authStore';
import Svg, { Path } from 'react-native-svg';

export default function JobsScreen() {
 const { picker } = useAuthStore();
 const [jobs, setJobs] = useState<any[]>([]);
 const [refreshing, setRefreshing] = useState(false);
 const [isLoading, setIsLoading] = useState(true);
 const [searchQuery, setSearchQuery] = useState('');
 const [stats, setStats] = useState({ today_items_picked: 0, lifetime_items_picked: 0, lifetime_orders_picked: 0 });

 const fetchAssignedJobs = async () => {
  try {
   let res;
   try {
    res = await api.get('/picklists/my');
   } catch (e: any) {
    if (e.response?.status === 403 || e.response?.status === 401) {
     res = await api.get('/picklists');
    } else {
     throw e;
    }
   }
   
   try {
    const statsRes = await api.get('/picklists/my/stats');
    if (statsRes && statsRes.data) {
     setStats(statsRes.data);
    }
   } catch (err) {
    console.error("Failed to load stats", err);
   }

   if (res && res.data && Array.isArray(res.data)) {
    const mapped = res.data
     .filter((p: any) => p.status === 'assigned' || p.status === 'picking')
     .map((p: any) => {
      const items = p.items || [];
      const total = items.length || 0;
      const picked = items.filter((i: any) => i.is_picked).length || 0;
      const jobNum = p.picker_job_number;
      const label = jobNum ? `P-${String(jobNum).padStart(3, '0')}` : `P-${String(p.id).padStart(3, '0')}`;
      const bins = items.map((i: any) => i.bin_location).filter(Boolean).sort();
      const startBin = bins.length > 0 ? bins[0] : 'N/A';
      const endBin = bins.length > 0 ? bins[bins.length - 1] : startBin;

      return {
       id: String(p.id),
       orderId: label,
       orderNumber: p.order_number,
       customerName: p.customer_name,
       priority: p.priority || 'ACTIVE',
       zone: p.zone || 'Warehouse Floor',
       startBin,
       endBin,
       totalItems: total,
       pickedItems: picked,
       status: p.status === 'picking' ? 'in_progress' : 'pending'
      };
     });
    setJobs(mapped.sort((a, b) => a.id - b.id));
    const isCurrentlyPicking = mapped.some((j: any) => j.status === 'in_progress');
    useAuthStore.getState().setIsPicking(isCurrentlyPicking);
   } else {
    setJobs([]);
    useAuthStore.getState().setIsPicking(false);
   }
  } catch (err) {
   console.log('Error fetching live picklists:', err);
  } finally {
   setRefreshing(false);
   setIsLoading(false);
  }
 };

 useEffect(() => {
  let wsUrl = api.defaults.baseURL || 'http://localhost:8000/api';
  wsUrl = wsUrl.replace('http://', 'ws://').replace('https://', 'wss://').replace('/api', '/ws/notifications');
  
  const ws = new WebSocket(wsUrl);
  
  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.event === 'PICKLIST_ASSIGNED' && data.picker_id === picker?.id) {
        fetchAssignedJobs();
      } else if (data.event === 'ORDER_CREATED') {
        fetchAssignedJobs();
      }
    } catch (err) {
      // ignore
    }
  };
  
  return () => {
    ws.close();
  };
 }, [picker?.id]);

 useFocusEffect(
  useCallback(() => {
   fetchAssignedJobs();
   // Poll every 30 seconds for real-time job updates
   const interval = setInterval(fetchAssignedJobs, 30000);
   return () => clearInterval(interval);
  }, [])
 );

 const onRefresh = async () => {
  setRefreshing(true);
  await fetchAssignedJobs();
  setRefreshing(false);
 };

 const displayedJobs = jobs.filter(j =>
  j.orderId.toLowerCase().includes(searchQuery.toLowerCase()) ||
  j.zone.toLowerCase().includes(searchQuery.toLowerCase())
 );


 return (
  <SafeAreaView className="flex-1 bg-background" edges={['top']}>
   {/* Brand Header matching Admin Style */}
   <View className="flex-row items-center justify-between px-4 py-3 bg-white border-b border-gray-100 shadow-sm">
    <View className="flex-row items-center">
     <View className="mr-2">
      <Svg width="34" height="34" viewBox="0 0 40 40" fill="none">
       <Path d="M20 2L36 11V29L20 38L4 29V11L20 2Z" fill="#064e3b" />
       <Path d="M14 12L20 24L26 12M14 28V12M26 12V28" stroke="#80bea6" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
     </View>
     <View>
      <Text className="text-xl font-extrabold text-[#003527] tracking-tight">NexWare</Text>
      <Text className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest ">Floor Terminal</Text>
     </View>
    </View>
    <TouchableOpacity className="w-10 h-10 bg-[#003527] border border-emerald-400/30 rounded-full items-center justify-center shadow-sm">
     <Text className="text-white font-bold text-xs">{picker?.initials || 'NW'}</Text>
    </TouchableOpacity>
   </View>

   {/* Search & Filter */}
   <View className="flex-row items-center px-4 py-3.5 space-x-2">
    <View className="flex-1 flex-row items-center bg-white rounded-xl px-3.5 py-2 border border-gray-200 shadow-2xs">
     <Search size={18} color="#6b7280" />
     <TextInput
      className="flex-1 ml-2.5 text-sm text-onSurface"
      placeholder="Search assigned picklists..."
      placeholderTextColor="#94a3b8"
      value={searchQuery}
      onChangeText={setSearchQuery}
     />
    </View>
    <TouchableOpacity className="p-2.5 bg-white rounded-xl border border-gray-200 ml-2 shadow-2xs items-center justify-center">
     <Filter size={19} color="#006c49" />
    </TouchableOpacity>
   </View>

   {/* KPI Metrics */}
   <View className="px-4 mb-4 space-y-3">
     <View className="flex-row justify-between space-x-3">
      <View className="flex-1 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm items-center border-t-2 border-t-[#006c49]">
       <Text className="text-gray-500 text-xs font-bold uppercase mb-1 text-center">Items Picked Today</Text>
       <Text className="text-2xl font-black text-[#003527]">
        {stats.today_items_picked}
       </Text>
      </View>
      <View className="flex-1 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm items-center border-t-2 border-t-emerald-500">
       <Text className="text-gray-500 text-xs font-bold uppercase mb-1 text-center">Queue Total</Text>
       <Text className="text-2xl font-black text-[#0b1c30]">
        {jobs.reduce((sum, j) => sum + j.totalItems, 0)}
       </Text>
       <Text className="text-gray-400 text-[10px] mt-1 font-semibold">Items Pending</Text>
      </View>
     </View>
     
     <View className="flex-row justify-between space-x-3">
      <View className="flex-1 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm items-center border-t-2 border-t-[#0b1c30]">
       <Text className="text-gray-500 text-xs font-bold uppercase mb-1 text-center">Lifetime Items</Text>
       <Text className="text-xl font-black text-[#0b1c30]">
        {stats.lifetime_items_picked}
       </Text>
       <Text className="text-gray-400 text-[10px] mt-1 font-semibold">Total Picked</Text>
      </View>
      <View className="flex-1 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm items-center border-t-2 border-t-purple-600">
       <Text className="text-gray-500 text-xs font-bold uppercase mb-1 text-center">Lifetime Orders</Text>
       <Text className="text-xl font-black text-purple-700">
        {stats.lifetime_orders_picked}
       </Text>
       <Text className="text-gray-400 text-[10px] mt-1 font-semibold">Total Picked</Text>
      </View>
     </View>
   </View>

   {/* Progress Summary Card with Elegant Green Border Accent */}
   <View className="flex-row items-center justify-between px-5 py-4 bg-white mx-4 rounded-2xl border border-gray-200 border-l-4 border-l-[#006c49] shadow-sm mb-4">
    <View>
     <View className="flex-row items-center mb-1">
      <View className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5" />
      <Text className="text-[11px] font-bold text-emerald-700 tracking-wider uppercase">Live Floor Sync</Text>
     </View>
     <Text className="text-sm text-gray-500 ">Assignment Completion</Text>
     <Text className="text-xl font-extrabold text-[#0b1c30] mt-0.5 ">
      {jobs.filter(j => j.pickedItems > 0 && j.pickedItems === j.totalItems).length} / {jobs.length} Orders
     </Text>
    </View>
    <View className="items-center justify-center">
     <CircularProgress 
      value={jobs.filter(j => j.pickedItems > 0 && j.pickedItems === j.totalItems).length} 
      max={jobs.length || 1} 
      radius={26} 
      strokeWidth={6} 
      color="#006c49" 
     />
    </View>
   </View>

   {/* Jobs List */}
   {isLoading ? (
    <View className="flex-1 items-center justify-center py-12">
     <ActivityIndicator size="large" color="#006c49" />
     <Text className="text-gray-500 text-sm mt-3">Loading jobs...</Text>
    </View>
   ) : (
    <FlatList
     data={displayedJobs}
     keyExtractor={(item) => item.id}
     contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28 }}
     refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#003527"]} tintColor="#006c49" />}
     renderItem={({ item, index }) => (
      <JobCard job={item} index={index} hasActiveJob={jobs.some(j => j.status === 'in_progress')} />
     )}
     ListEmptyComponent={
      <View className="items-center justify-center py-12">
       <Text className="text-gray-500 text-sm">No active tasks assigned to this terminal.</Text>
      </View>
     }
    />
   )}
  </SafeAreaView>
 );
}
