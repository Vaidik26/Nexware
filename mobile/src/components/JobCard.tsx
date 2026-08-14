import { View, Text, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { ChevronRight } from 'lucide-react-native';

const PriorityColors: Record<string, string> = {
 URGENT: 'bg-red-500',
 ACTIVE: 'bg-green-500',
 STANDARD: 'bg-blue-500',
 SCHEDULED: 'bg-gray-400',
};

const PriorityTextColors: Record<string, string> = {
 URGENT: 'text-red-700',
 ACTIVE: 'text-green-700',
 STANDARD: 'text-blue-700',
 SCHEDULED: 'text-gray-700',
};

const PriorityBgColors: Record<string, string> = {
 URGENT: 'bg-red-100',
 ACTIVE: 'bg-green-100',
 STANDARD: 'bg-blue-100',
 SCHEDULED: 'bg-gray-100',
};

export default function JobCard({ job, index }: { job: any, index: number }) {
 const router = useRouter();
 const progress = job.totalItems > 0 ? (job.pickedItems / job.totalItems) * 100 : 0;
 
 return (
  <Animated.View entering={FadeInDown.delay(index * 100).springify()}>
   <TouchableOpacity 
    className="bg-white rounded-xl mb-4 shadow-sm overflow-hidden flex-row"
    onPress={() => router.push(`/(picker)/job/${job.id}`)}
   >
    <View className={`w-1.5 ${PriorityColors[job.priority] || 'bg-gray-400'}`} />
    <View className="flex-1 p-4">
     <View className="flex-row justify-between items-center mb-2">
      <View className={`px-2 py-1 rounded ${PriorityBgColors[job.priority]}`}>
       <Text className={`text-xs font-bold ${PriorityTextColors[job.priority]}`}>
        {job.priority}
       </Text>
      </View>
      <Text className="text-sm font-medium text-gray-500 max-w-[60%]" numberOfLines={1}>{job.customerName}</Text>
     </View>
     
     <Text className="text-lg font-bold text-onSurface mb-1">{job.orderNumber} (Seq: {job.orderId})</Text>
     <Text className="text-sm text-gray-600 mb-4">
       {job.totalItems} Items • Bin: {job.startBin === job.endBin ? job.startBin : `${job.startBin} ➔ ${job.endBin}`}
     </Text>
     
     <View className="flex-row items-center justify-between">
      <View className="flex-1 mr-4">
       <View className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <View 
         className="h-full bg-primary rounded-full" 
         style={{ width: `${progress}%` }} 
        />
       </View>
       <Text className="text-xs text-gray-500 mt-1 ">{job.pickedItems} / {job.totalItems} Picked</Text>
      </View>
      <ChevronRight size={20} color="#9ca3af" />
     </View>
    </View>
   </TouchableOpacity>
  </Animated.View>
 );
}
