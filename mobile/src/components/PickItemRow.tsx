import { View, Text, TouchableOpacity } from 'react-native';
import { Check } from 'lucide-react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import { playTickSound } from '../lib/alertSound';

export default function PickItemRow({ item, onToggle, disabled }: { item: any, onToggle: () => void, disabled?: boolean }) {
  
  const animatedStyle = useAnimatedStyle(() => {
    return {
      opacity: withTiming(item.picked ? 0.65 : 1, { duration: 200 }),
    };
  });

  const handlePress = () => {
    if (disabled) return;
    if (!item.picked) {
      playTickSound();
    }
    onToggle();
  };

  return (
    <Animated.View style={[animatedStyle]}>
      <TouchableOpacity 
        className={`flex-row items-center p-4 bg-white mb-3 rounded-xl shadow-sm border-l-4 ${item.picked ? 'border-l-primary bg-green-50/30' : 'border-l-gray-300'}`}
        onPress={handlePress}
        disabled={disabled}
        activeOpacity={0.7}
      >
        <View className={`w-8 h-8 rounded-lg border-2 ${item.picked ? 'bg-primary border-primary' : 'border-gray-400 bg-gray-50'} items-center justify-center mr-4 shadow-sm`}>
          {item.picked && <Check size={20} color="white" strokeWidth={3} />}
        </View>
        
        <View className="flex-1">
          <View className="flex-row items-center mb-1">
            <Text className="text-xs font-semibold text-gray-500 font-inter bg-gray-100 px-2 py-0.5 rounded mr-2">
              SKU: {item.barcode}
            </Text>
            {item.picked ? (
              <Text className="text-xs font-bold text-primary font-inter">✓ Ticked</Text>
            ) : (
              <Text className="text-xs font-medium text-amber-700 font-inter">Tap to tick off</Text>
            )}
          </View>
          <Text className={`text-base font-inter ${item.picked ? 'line-through text-gray-500 font-medium' : 'font-bold text-onSurface'}`}>
            {item.name}
          </Text>
        </View>
        
        <View className="items-end ml-3 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">
          <Text className={`text-lg font-extrabold font-inter ${item.picked ? 'text-primary' : 'text-onSurface'}`}>{item.qty}</Text>
          <Text className="text-xs font-bold text-gray-500 font-inter">{item.uom}</Text>
        </View>
      </TouchableOpacity>
    </Animated.View>
  );
}
