import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, { useAnimatedProps, withTiming } from 'react-native-reanimated';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface CircularProgressProps {
  value: number;
  max: number;
  radius?: number;
  strokeWidth?: number;
  color?: string;
}

export default function CircularProgress({ 
  value, 
  max, 
  radius = 30, 
  strokeWidth = 6, 
  color = '#003527' 
}: CircularProgressProps) {
  const circumference = 2 * Math.PI * radius;
  const halfCircle = radius + strokeWidth;
  
  const animatedProps = useAnimatedProps(() => {
    const progress = Math.max(0, Math.min(1, value / max));
    const strokeDashoffset = circumference - (circumference * progress);
    
    return {
      strokeDashoffset: withTiming(strokeDashoffset, { duration: 1000 }),
    };
  });

  return (
    <View style={{ width: halfCircle * 2, height: halfCircle * 2 }}>
      <Svg width={halfCircle * 2} height={halfCircle * 2} viewBox={`0 0 ${halfCircle * 2} ${halfCircle * 2}`}>
        <Circle
          cx="50%"
          cy="50%"
          r={radius}
          stroke="#e5e7eb"
          strokeWidth={strokeWidth}
          fill="transparent"
        />
        <AnimatedCircle
          cx="50%"
          cy="50%"
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="transparent"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          strokeLinecap="round"
          transform={`rotate(-90 ${halfCircle} ${halfCircle})`}
        />
      </Svg>
    </View>
  );
}
