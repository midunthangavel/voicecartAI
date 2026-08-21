---
kind: external_dependency
name: Expo/React Native Mobile App
slug: expo-react-native
category: external_dependency
category_hints:
    - vendor_identity
scope:
    - '**'
---

The mobile client is an Expo (~54) / React Native (0.81) application providing voice ordering on iOS/Android/Web. Uses `expo-av` for audio playback/recording, `expo-file-system` for local media, and `expo-speech` for TTS feedback. Communicates with the server via WebSocket (`voiceSocketService.js`) and REST APIs.