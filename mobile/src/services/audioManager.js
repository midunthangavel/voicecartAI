import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';
import * as FileSystem from 'expo-file-system';

let currentRecording = null;

/**
 * Initialize Audio Permissions & iOS/Android Audio Modes
 */
export async function initAudioSystem() {
  try {
    const { status } = await Audio.requestPermissionsAsync();
    if (status !== 'granted') {
      console.warn('[Audio] Microphone permission not granted');
      return false;
    }

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });

    return true;
  } catch (err) {
    console.error('[Audio] Init error:', err);
    return false;
  }
}

/**
 * Start Audio Recording
 */
export async function startRecording(onStatusUpdate) {
  try {
    // Stop any ongoing speech playback before listening
    Speech.stop();

    if (currentRecording) {
      try {
        await currentRecording.stopAndUnloadAsync();
      } catch (e) {}
      currentRecording = null;
    }

    const { recording } = await Audio.Recording.createAsync(
      Audio.RecordingOptionsPresets.HIGH_QUALITY,
      onStatusUpdate || null,
      100
    );

    currentRecording = recording;
    return true;
  } catch (err) {
    console.error('[Audio] Start recording error:', err);
    return false;
  }
}

/**
 * Stop Recording and Return Base64 Audio Data & Format
 */
export async function stopRecording() {
  if (!currentRecording) return null;

  try {
    const recording = currentRecording;
    await recording.stopAndUnloadAsync();
    const uri = recording.getURI();
    currentRecording = null;

    if (!uri) return null;

    const base64Audio = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    return {
      uri,
      data: base64Audio,
      format: 'm4a',
    };
  } catch (err) {
    console.error('[Audio] Stop recording error:', err);
    currentRecording = null;
    return null;
  }
}

/**
 * Speak Text using Native Expo Speech
 */
export function speakAiResponse(text, language = 'en-IN', onStart, onDone, onError) {
  try {
    Speech.stop();

    if (!text || typeof text !== 'string') return;

    if (onStart) onStart();

    const langCode = language.startsWith('ta') ? 'ta-IN' : 'en-IN';

    Speech.speak(text, {
      language: langCode,
      pitch: 1.0,
      rate: 0.95,
      onDone: () => {
        if (onDone) onDone();
      },
      onError: (err) => {
        console.warn('[Speech] Error:', err);
        if (onError) onError(err);
      },
    });
  } catch (err) {
    console.error('[Speech] speak error:', err);
    if (onError) onError(err);
  }
}

/**
 * Stop any active AI speech output
 */
export function stopSpeech() {
  try {
    Speech.stop();
  } catch (e) {}
}
