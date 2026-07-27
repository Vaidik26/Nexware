import { View, ActivityIndicator } from 'react-native';

export default function Index() {
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <ActivityIndicator size="large" color="#003527" />
    </View>
  );
}
