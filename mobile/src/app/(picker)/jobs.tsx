import { useState, useCallback, useEffect } from 'react';
import { View, Text, FlatList, RefreshControl, TouchableOpacity, TextInput } from 'react-native';
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
  const [searchQuery, setSearchQuery] = useState('');

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
      
      if (res && res.data && Array.isArray(res.data)) {
        const mapped = res.data
          .filter((p: any) => p.status === 'assigned' || p.status === 'picking')
          .map((p: any) => {
            const items = p.items || [];
            const total = items.length || 0;
            const picked = items.filter((i: any) => i.is_picked).length || 0;
            const jobNum = p.picker_job_number;
            const label = jobNum ? `P-${String(jobNum).padStart(3, '0')}` : `P-${String(p.id).padStart(3, '0')}`;
            return {
              id: String(p.id),
              orderId: label,
              priority: p.priority || 'ACTIVE',
              zone: p.zone || 'Warehouse Floor',
              totalItems: total,
              pickedItems: picked,
              status: p.status === 'picking' ? 'in_progress' : 'pending'
            };
          });
        setJobs(mapped);
      }
    } catch (err) {
      console.log('Error fetching live picklists:', err);
    }
  };

  useEffect(() => {
    fetchAssignedJobs();
    // Poll every 30 seconds for real-time job updates
    const interval = setInterval(fetchAssignedJobs, 30000);
    return () => clearInterval(interval);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAssignedJobs();
    setRefreshing(false);
  }, []);

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
            <Text className="text-xl font-inter font-extrabold text-[#003527] tracking-tight">NexWare</Text>
            <Text className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest font-inter">Floor Terminal</Text>
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
            className="flex-1 ml-2.5 font-inter text-sm text-onSurface"
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

      {/* Progress Summary Card with Elegant Green Border Accent */}
      <View className="flex-row items-center justify-between px-5 py-4 bg-white mx-4 rounded-2xl border border-gray-200 border-l-4 border-l-[#006c49] shadow-sm mb-4">
        <View>
          <View className="flex-row items-center mb-1">
            <View className="w-2 h-2 rounded-full bg-emerald-500 mr-1.5" />
            <Text className="text-[11px] font-bold text-emerald-700 font-inter tracking-wider uppercase">Live Floor Sync</Text>
          </View>
          <Text className="text-sm text-gray-500 font-inter">Active Assignment Completion</Text>
          <Text className="text-xl font-extrabold text-[#0b1c30] mt-0.5 font-inter">
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
      <FlatList
        data={displayedJobs}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 28 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#003527"]} tintColor="#006c49" />}
        renderItem={({ item, index }) => (
          <JobCard job={item} index={index} />
        )}
        ListEmptyComponent={
          <View className="items-center justify-center py-12">
            <Text className="text-gray-500 font-inter text-sm">No active tasks assigned to this terminal.</Text>
          </View>
        }
      />
    </SafeAreaView>
  );
}
