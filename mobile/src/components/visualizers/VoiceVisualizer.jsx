import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import { colors } from '../../theme/colors';

const NUM_BARS = 24;

export default function VoiceVisualizer({
  isActive = false,
  isRecording = false,
  isAiSpeaking = false,
  audioLevel = 0,
}) {
  const animatedValues = useRef(
    Array.from({ length: NUM_BARS }, () => new Animated.Value(0.15))
  ).current;

  useEffect(() => {
    let isMounted = true;
    let animationLoop;

    const animateBars = () => {
      if (!isMounted) return;

      const animations = animatedValues.map((anim, idx) => {
        let targetHeight = 0.15;

        if (isAiSpeaking) {
          // Energetic speech cadence
          const centerFactor = 1 - Math.abs(idx - NUM_BARS / 2) / (NUM_BARS / 2);
          const randomFactor = Math.random() * 0.7 + 0.3;
          targetHeight = Math.min(1.0, Math.max(0.2, centerFactor * randomFactor));
        } else if (isRecording) {
          // Dynamic energy from microphone
          const base = audioLevel > 0 ? audioLevel : 0.4;
          const variance = (Math.sin(idx * 0.8 + Date.now() * 0.005) + 1) / 2;
          targetHeight = Math.min(1.0, Math.max(0.2, base * variance * 1.2));
        } else if (isActive) {
          // Idle breathing wave
          targetHeight = 0.2 + (Math.sin(idx * 0.4 + Date.now() * 0.003) + 1) * 0.1;
        }

        return Animated.timing(anim, {
          toValue: targetHeight,
          duration: isAiSpeaking ? 80 : 120,
          easing: Easing.out(Easing.quad),
          useNativeDriver: false,
        });
      });

      animationLoop = Animated.parallel(animations);
      animationLoop.start(() => {
        if (isMounted && (isActive || isRecording || isAiSpeaking)) {
          animateBars();
        }
      });
    };

    if (isActive || isRecording || isAiSpeaking) {
      animateBars();
    } else {
      animatedValues.forEach((anim) => {
        Animated.timing(anim, {
          toValue: 0.1,
          duration: 200,
          useNativeDriver: false,
        }).start();
      });
    }

    return () => {
      isMounted = false;
      if (animationLoop) animationLoop.stop();
    };
  }, [isActive, isRecording, isAiSpeaking, audioLevel]);

  return (
    <View style={styles.container}>
      <View style={styles.barsRow}>
        {animatedValues.map((anim, i) => {
          const heightInterpolation = anim.interpolate({
            inputRange: [0, 1],
            outputRange: [6, 48],
          });

          const barColor = isRecording
            ? colors.accentRed
            : isAiSpeaking
            ? colors.primary
            : colors.textMuted;

          return (
            <Animated.View
              key={i}
              style={[
                styles.bar,
                {
                  height: heightInterpolation,
                  backgroundColor: barColor,
                  shadowColor: barColor,
                  opacity: isActive ? 0.9 : 0.4,
                },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 60,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    height: 48,
  },
  bar: {
    width: 3.5,
    borderRadius: 3,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
});
