import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Animated, Text } from 'react-native';
import { colors } from '../../theme/colors';

export default function CircularWaveform({
  callState = 'idle',
  isRecording = false,
  isAiSpeaking = false,
}) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const ringAnim1 = useRef(new Animated.Value(0)).current;
  const ringAnim2 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let animationLoop;

    if (isAiSpeaking || isRecording) {
      // Fast dynamic pulse
      animationLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.15,
            duration: isAiSpeaking ? 400 : 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0.95,
            duration: isAiSpeaking ? 400 : 600,
            useNativeDriver: true,
          }),
        ])
      );
      animationLoop.start();

      // Expanding rings
      Animated.loop(
        Animated.stagger(400, [
          Animated.sequence([
            Animated.timing(ringAnim1, {
              toValue: 1,
              duration: 1200,
              useNativeDriver: true,
            }),
            Animated.timing(ringAnim1, {
              toValue: 0,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
          Animated.sequence([
            Animated.timing(ringAnim2, {
              toValue: 1,
              duration: 1200,
              useNativeDriver: true,
            }),
            Animated.timing(ringAnim2, {
              toValue: 0,
              duration: 0,
              useNativeDriver: true,
            }),
          ]),
        ])
      ).start();
    } else if (callState === 'active') {
      // Gentle breathing
      animationLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.05,
            duration: 1400,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0.98,
            duration: 1400,
            useNativeDriver: true,
          }),
        ])
      );
      animationLoop.start();
    } else {
      Animated.timing(pulseAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
      ringAnim1.setValue(0);
      ringAnim2.setValue(0);
    }

    return () => {
      if (animationLoop) animationLoop.stop();
    };
  }, [callState, isRecording, isAiSpeaking]);

  const orbColor = isRecording
    ? colors.accentRed
    : isAiSpeaking
    ? colors.primary
    : callState === 'active'
    ? colors.accentBlue
    : colors.surfaceBorder;

  const glowColor = isRecording
    ? colors.accentRedGlow
    : isAiSpeaking
    ? colors.primaryGlow
    : colors.accentBlueGlow;

  return (
    <View style={styles.container}>
      {/* Outer Pulse Rings */}
      {(isAiSpeaking || isRecording) && (
        <>
          <Animated.View
            style={[
              styles.ring,
              {
                borderColor: orbColor,
                opacity: ringAnim1.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.6, 0],
                }),
                transform: [
                  {
                    scale: ringAnim1.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 2.2],
                    }),
                  },
                ],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.ring,
              {
                borderColor: orbColor,
                opacity: ringAnim2.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.6, 0],
                }),
                transform: [
                  {
                    scale: ringAnim2.interpolate({
                      inputRange: [0, 1],
                      outputRange: [1, 2.2],
                    }),
                  },
                ],
              },
            ]}
          />
        </>
      )}

      {/* Main Center Orb */}
      <Animated.View
        style={[
          styles.orb,
          {
            backgroundColor: orbColor,
            shadowColor: orbColor,
            transform: [{ scale: pulseAnim }],
          },
        ]}
      >
        <View style={styles.innerGlow}>
          <Text style={styles.orbEmoji}>
            {isRecording ? '🎙️' : isAiSpeaking ? '🤖' : callState === 'active' ? '✨' : '📞'}
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 120,
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 8,
  },
  orb: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 16,
    elevation: 8,
  },
  innerGlow: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  orbEmoji: {
    fontSize: 26,
  },
  ring: {
    position: 'absolute',
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2,
  },
});
