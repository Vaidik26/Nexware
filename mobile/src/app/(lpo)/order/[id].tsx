import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ScrollView, ActivityIndicator, Alert, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ChevronLeft, FileText, Download, CheckCircle2 } from 'lucide-react-native';
import api from '../../../lib/api';

export default function LpoOrderDetailsScreen() {
 const { id } = useLocalSearchParams();
 const router = useRouter();
 const [lpo, setLpo] = useState<any>(null);
 const [isLoading, setIsLoading] = useState(true);

 useEffect(() => {
  fetchLpoDetails();
 }, [id]);

 const fetchLpoDetails = async () => {
  try {
   setIsLoading(true);
   const res = await api.get(`/lpos/${id}`);
   setLpo(res.data);
  } catch (err) {
   console.error(err);
   Alert.alert('Error', 'Failed to load order details.');
   router.back();
  } finally {
   setIsLoading(false);
  }
 };

 const handleOpenPdf = () => {
  if (lpo?.signed_lpo_url) {
   Linking.openURL(lpo.signed_lpo_url).catch(() => {
    Alert.alert('Error', 'Could not open the PDF document.');
   });
  }
 };

 if (isLoading) {
  return (
   <SafeAreaView className="flex-1 bg-background justify-center items-center">
    <ActivityIndicator size="large" color="#059669" />
    <Text className="mt-4 text-gray-500 font-semibold">Loading Order Details...</Text>
   </SafeAreaView>
  );
 }

 if (!lpo) return null;

 return (
  <SafeAreaView className="flex-1 bg-background" edges={['top', 'bottom']}>
   {/* Header */}
   <View className="px-4 py-3 bg-white border-b border-gray-200 flex-row items-center shadow-sm z-10">
    <TouchableOpacity onPress={() => router.back()} className="p-2 mr-2 bg-gray-50 rounded-xl border border-gray-200">
     <ChevronLeft size={20} color="#374151" />
    </TouchableOpacity>
    <View className="flex-1">
     <Text className="text-xl font-black text-gray-800 ">Order Details</Text>
    </View>
   </View>

   <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>
    {/* Order Summary Card */}
    <View className="bg-white p-6 rounded-3xl shadow-sm border border-gray-100 mb-6">
     <View className="flex-row items-center gap-3 mb-4">
      <View className="w-12 h-12 bg-emerald-50 rounded-2xl border border-emerald-100 flex items-center justify-center">
       <FileText size={24} color="#059669" />
      </View>
      <View className="flex-1">
       <Text className="text-2xl font-black text-gray-800">{lpo.lpo_number}</Text>
       <Text className="text-gray-500 font-bold">{lpo.customer_name}</Text>
      </View>
     </View>

     <View className="bg-gray-50 p-4 rounded-2xl mb-4 border border-gray-100">
      <View className="flex-row justify-between mb-2">
       <Text className="text-gray-500 font-semibold text-sm">Status</Text>
       <Text className="text-gray-500 font-semibold text-sm">Delivery Date</Text>
      </View>
      <View className="flex-row justify-between items-center">
       <View className="bg-emerald-100 px-3 py-1 rounded-lg">
        <Text className="text-emerald-800 font-bold text-xs uppercase">{lpo.status}</Text>
       </View>
       <Text className="text-gray-800 font-black text-sm">
        {lpo.delivery_date ? new Date(lpo.delivery_date).toLocaleDateString() : 'N/A'}
       </Text>
      </View>
     </View>

     {lpo.signed_lpo_url ? (
      <TouchableOpacity 
       onPress={handleOpenPdf}
       className="bg-emerald-600 py-4 rounded-2xl flex-row items-center justify-center shadow-sm"
      >
       <Download size={18} color="#fff" />
       <Text className="text-white font-black text-base ml-2">View Signed LPO</Text>
      </TouchableOpacity>
     ) : (
      <View className="bg-orange-50 border border-orange-200 py-3 rounded-2xl items-center">
       <Text className="text-orange-700 font-bold text-sm">No LPO Document Uploaded</Text>
      </View>
     )}
    </View>

    {/* Items List */}
    <View className="mb-8">
     <Text className="text-lg font-black text-gray-800 mb-4 ml-1">Order Items ({lpo.items?.length || 0})</Text>
     
     <View className="bg-white rounded-3xl border border-gray-200 overflow-hidden shadow-sm">
      {lpo.items?.map((item: any, index: number) => (
       <View 
        key={index} 
        className={`p-4 flex-row items-center justify-between ${index !== lpo.items.length - 1 ? 'border-b border-gray-100' : ''}`}
       >
        <View className="flex-row items-center gap-4 flex-1">
         <View className="w-8 h-8 rounded-full bg-emerald-50 border border-emerald-100 items-center justify-center">
          <Text className="text-emerald-700 font-black text-xs">{index + 1}</Text>
         </View>
         <View className="flex-1 pr-2">
          <Text className="text-gray-800 font-bold text-base" numberOfLines={2}>{item.product_name}</Text>
          <Text className="text-emerald-600 font-mono text-xs font-bold mt-0.5">{item.barcode}</Text>
         </View>
        </View>
        
        <View className="items-end pl-2">
         <Text className="text-gray-500 font-semibold text-xs mb-0.5">QTY</Text>
         <Text className="text-gray-900 font-black text-lg">{item.quantity}</Text>
        </View>
       </View>
      ))}

      {(!lpo.items || lpo.items.length === 0) && (
       <View className="p-8 items-center justify-center">
        <Text className="text-gray-400 font-semibold">No items found in this order.</Text>
       </View>
      )}
     </View>
    </View>
   </ScrollView>
  </SafeAreaView>
 );
}
