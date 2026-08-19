import { View, Text, TouchableOpacity, Switch } from 'react-native';
import { Check, AlertTriangle, Box } from 'lucide-react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { playTickSound } from '../lib/alertSound';

export default function PickItemRow({ item, onScanStart, onMissing, onToggleCarton, disabled }: { item: any, onScanStart: () => void, onMissing?: () => void, onToggleCarton?: (isFull: boolean) => void, disabled?: boolean }) {
 
 const isMissing = item.missing_reported;
 
 const animatedStyle = useAnimatedStyle(() => {
  return {
   opacity: withTiming(disabled ? 0.4 : (item.picked ? 0.65 : 1), { duration: 200 }),
  };
 });



 return (
  <Animated.View style={[animatedStyle]}>
   <View 
    className={`flex-row items-center p-4 bg-white mb-3 rounded-xl shadow-sm border-l-4 ${item.picked ? 'border-l-primary bg-green-50/30' : 'border-l-gray-300'}`}
   >
    <View className={`w-8 h-8 rounded-lg border-2 ${item.picked ? 'bg-primary border-primary' : 'border-gray-400 bg-gray-50'} items-center justify-center mr-4 shadow-sm`}>
     {item.picked && <Check size={20} color="white" strokeWidth={3} />}
    </View>
    
    <View className="flex-1">
     <View className="flex-row items-center mb-1 flex-wrap gap-y-1">
      <Text className="text-xs font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded mr-2">
       SKU: {item.barcode}
      </Text>
      {item.bin_location && (
       <Text className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded mr-2 shadow-sm">
        Bin: {item.bin_location}
       </Text>
      )}
      {item.is_full_carton ? (
       <View className="bg-purple-100 border border-purple-200 px-2 py-0.5 rounded mr-2 flex-row items-center shadow-sm">
        <Box size={10} color="#7e22ce" style={{marginRight: 4}} />
        <Text className="text-xs font-bold text-purple-700 ">CARTON</Text>
       </View>
      ) : (
       <View className="bg-blue-50 border border-blue-200 px-2 py-0.5 rounded mr-2 flex-row items-center shadow-sm">
        <Text className="text-xs font-bold text-blue-700 ">LOOSE</Text>
       </View>
      )}
      {item.picked ? (
       <Text className="text-xs font-bold text-primary ">✓ Picked</Text>
      ) : isMissing ? (
       <Text className="text-xs font-bold text-red-600 ">Reported Missing</Text>
      ) : (
       <Text className="text-xs font-medium text-gray-500 ">Pending Scan</Text>
      )}
     </View>
     <Text className={`text-base mt-1 ${item.picked ? 'line-through text-gray-500 font-medium' : 'font-bold text-onSurface'}`}>
      {item.name}
     </Text>
    </View>
    <View className="items-end ml-3 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">
     <Text className={`text-lg font-extrabold ${item.picked ? 'text-primary' : 'text-onSurface'}`}>
      {item.picked ? `${item.picked_qty} / ${item.qty}` : item.qty}
     </Text>
     <Text className="text-xs font-bold text-gray-500 ">{item.uom}</Text>
    </View>
   </View>
   {!item.picked && !isMissing && !disabled && (
    <View className="flex-row gap-2 mt-[-8px] mb-3">
     <TouchableOpacity 
      className="flex-1 bg-emerald-50 py-2.5 px-3 rounded-xl border border-emerald-200 flex-row justify-center items-center shadow-sm"
      onPress={onScanStart}
     >
      <Text className="text-emerald-700 font-bold text-xs ml-2">Scan Barcode</Text>
     </TouchableOpacity>
     {onMissing && (
      <TouchableOpacity 
       className="flex-1 bg-red-50 py-2.5 px-3 rounded-xl border border-red-200 flex-row justify-center items-center shadow-sm"
       onPress={onMissing}
      >
       <AlertTriangle size={16} color="#dc2626" />
       <Text className="text-red-600 font-bold text-xs ml-2">Missing</Text>
      </TouchableOpacity>
     )}
    </View>
   )}
  </Animated.View>
 );
}
