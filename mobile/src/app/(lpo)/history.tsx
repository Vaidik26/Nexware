import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, FlatList, ActivityIndicator, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, Calendar as CalendarIcon, FileText } from 'lucide-react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import api from '../../lib/api';

export default function LpoHistoryScreen() {
 const router = useRouter();
  const queryClient = useQueryClient();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [filter, setFilter] = useState<'ALL' | 'UPLOADED' | 'PENDING'>('ALL');

  // Use React Query for caching and auto-syncing
  const dateStr = selectedDate.toISOString().split('T')[0];
  const { data: lpos = [], isLoading, refetch } = useQuery<any[]>({
    queryKey: ['history', dateStr],
    queryFn: async () => {
      const res = await api.get(`/lpos/my-history?date=${dateStr}`);
      return res.data || [];
    }
  });

 const filteredLpos = lpos.filter((lpo: any) => {
  if (filter === 'ALL') return true;
  if (filter === 'UPLOADED') return !!lpo.signed_lpo_url;
  if (filter === 'PENDING') return !lpo.signed_lpo_url;
  return true;
 });

 return (
  <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
   {/* Header */}
   <View className="px-4 py-3 bg-white border-b border-gray-200 flex-row items-center shadow-sm z-10">
    <TouchableOpacity onPress={() => router.back()} className="p-2 mr-2 bg-gray-50 rounded-xl border border-gray-200">
     <ChevronLeft size={20} color="#374151" />
    </TouchableOpacity>
    <View className="flex-1">
     <Text className="text-xl font-black text-gray-800 ">My Orders</Text>
    </View>
    <TouchableOpacity onPress={() => setShowDatePicker(true)} className="p-2 bg-emerald-50 rounded-xl border border-emerald-100 flex-row items-center">
     <CalendarIcon size={16} color="#059669" />
     <Text className="ml-1 text-emerald-700 font-bold text-xs">{selectedDate.toLocaleDateString()}</Text>
    </TouchableOpacity>
   </View>

   {showDatePicker && (
    <DateTimePicker
     value={selectedDate}
     mode="date"
     display="default"
     onChange={(event: any, date?: Date) => {
      setShowDatePicker(false);
      if (date) setSelectedDate(date);
     }}
    />
   )}

   {/* Filter Tabs */}
   <View className="flex-row px-4 py-3 bg-white border-b border-gray-100 gap-2">
    <TouchableOpacity 
     onPress={() => setFilter('ALL')} 
     className={`px-4 py-2 rounded-lg border ${filter === 'ALL' ? 'bg-[#003527] border-[#003527]' : 'bg-gray-50 border-gray-200'}`}
    >
     <Text className={`font-bold text-sm ${filter === 'ALL' ? 'text-white' : 'text-gray-600'}`}>All</Text>
    </TouchableOpacity>
    <TouchableOpacity 
     onPress={() => setFilter('UPLOADED')} 
     className={`px-4 py-2 rounded-lg border ${filter === 'UPLOADED' ? 'bg-emerald-600 border-emerald-600' : 'bg-gray-50 border-gray-200'}`}
    >
     <Text className={`font-bold text-sm ${filter === 'UPLOADED' ? 'text-white' : 'text-gray-600'}`}>Uploaded LPO</Text>
    </TouchableOpacity>
    <TouchableOpacity 
     onPress={() => setFilter('PENDING')} 
     className={`px-4 py-2 rounded-lg border ${filter === 'PENDING' ? 'bg-blue-600 border-blue-600' : 'bg-gray-50 border-gray-200'}`}
    >
     <Text className={`font-bold text-sm ${filter === 'PENDING' ? 'text-white' : 'text-gray-600'}`}>Pending LPO</Text>
    </TouchableOpacity>
   </View>

   {/* List */}
   <View className="flex-1 p-4">
    {isLoading ? (
     <View className="flex-1 items-center justify-center">
      <ActivityIndicator size="large" color="#059669" />
     </View>
    ) : (
     <FlatList
      data={filteredLpos}
      keyExtractor={item => item.id.toString()}
      showsVerticalScrollIndicator={false}
      renderItem={({ item }) => (
       <TouchableOpacity 
        onPress={() => router.push(`/(lpo)/order/${item.id}`)}
        className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 mb-3"
       >
        <View className="flex-row justify-between items-start mb-2">
         <View>
          <Text className="font-black text-gray-800 text-lg">{item.lpo_number}</Text>
          <Text className="text-gray-500 font-semibold text-sm">{item.customer_name}</Text>
         </View>
         <View className={`px-2 py-1 rounded-md border ${item.signed_lpo_url ? 'bg-emerald-50 border-emerald-200' : 'bg-blue-50 border-blue-200'}`}>
          <Text className={`text-xs font-bold ${item.signed_lpo_url ? 'text-emerald-700' : 'text-blue-700'}`}>
           {item.signed_lpo_url ? 'LPO Uploaded' : 'Pending LPO'}
          </Text>
         </View>
        </View>
        
        <View className="flex-row items-center mb-3">
         <FileText size={14} color="#6b7280" />
         <Text className="text-gray-500 text-xs ml-1 font-medium">{item.items?.length || 0} Line Items</Text>
        </View>

        </TouchableOpacity>
      )}
      ListEmptyComponent={
       <View className="items-center justify-center py-12">
        <Text className="text-gray-400 text-sm font-semibold">No orders found for this date.</Text>
       </View>
      }
     />
    )}
   </View>


  </SafeAreaView>
 );
}
