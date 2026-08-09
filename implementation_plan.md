# Implementation Plan: AI Voice Telephony Ordering Platform (VoiceCart AI)

Build a production-grade, bilingual (Tamil & English) AI Voice Telephony Ordering Platform for food and commerce in India. The system handles live PSTN phone calls via Twilio/Exotel WebSockets, converts audio to text, processes bilingual slot-filling dialogue via Gemini 2.5/1.5 Flash, synthesizes voice responses via streaming TTS, dispatches orders to ONDC/POS systems, and triggers Razorpay payment link SMS notifications. Includes a real-time web dashboard with an interactive browser voice simulator.

## User Review Required

> [!IMPORTANT]
> - **Dual Telephony Mode**: The backend will support both live PSTN calls (Twilio WebSockets format: 8kHz mulaw audio) and a **Live Web Audio Simulator** (for instant browser testing using WebRTC/WebAudio without requiring immediate Twilio phone number billing).
> - **Bilingual Code-Mixing**: Google Cloud Speech-to-Text v2 with Tamil (`ta-IN`) and Indian English (`en-IN`) phrase hints will be used alongside Gemini Flash prompt tuning for Tamil/English code-switching (Tanglish).
> - **ONDC & Merchant Fallback**: The architecture features a dual dispatcher: ONDC Beckn protocol (`/search`, `/select`, `/init`, `/confirm`) + Direct POS integration (Petpooja / UrbanPiper JSON contract fallback).

## Open Questions

> [!NOTE]
> 1. **Google Cloud Credentials**: Do you have a GCP Service Account JSON key for Speech-to-Text v2 and TTS streaming? (If not provided initially, built-in mock STT/TTS streams will allow full testing).
> 2. **Gemini API Key**: Do you have an active `GEMINI_API_KEY` for dialogue management?

---

## Proposed Changes

### Backend Telephony & AI Service (`/server`)

#### [NEW] [package.json](file:///c:/Users/midun/OneDrive/Desktop/Inkiro/server/package.json)
- Express, `ws` (WebSocket server), `@google/generative-ai` / `@google/genai`, `@google-cloud/speech`, `@google-cloud/text-to-speech`, `twilio`, `sqlite3`, `dotenv`, `cors`, `wavefile`.

#### [NEW] [server.js](file:///c:/Users/midun/OneDrive/Desktop/Inkiro/server/server.js)
- Entry point initializing HTTP server, WebSocket handler for `/voice-stream`, Express REST endpoints, and database connection.

#### [NEW] [audioUtils.js](file:///c:/Users/midun/OneDrive/Desktop/Inkiro/server/src/utils/audioUtils.js)
- Audio conversion utilities: 8kHz Mu-law to 16kHz Linear PCM and 16kHz PCM to 8kHz Mu-law audio buffers.

#### [NEW] [sttService.js](file:///c:/Users/midun/OneDrive/Desktop/Inkiro/server/src/services/sttService.js)
- Streaming STT client wrapping `@google-cloud/speech` (v2) with `ta-IN`/`en-IN` code-switching and phrase hints for Indian food terms (e.g., "Biryani", "Kothu Parotta", "Paneer Butter Masala", "Thumps Up").

#### [NEW] [dialogueManager.js](file:///c:/Users/midun/OneDrive/Desktop/Inkiro/server/src/services/dialogueManager.js)
- Session slot-filling brain powered by Gemini Flash. Maintains context in memory/Redis, extracts items, variants (size, spice), delivery address, and returns structured JSON `{ response_text, updated_state, order_ready }`.

#### [NEW] [ttsService.js](file:///c:/Users/midun/OneDrive/Desktop/Inkiro/server/src/services/ttsService.js)
- Streaming TTS synthesis using Google Cloud TTS (`ta-IN-Standard-A` / `en-IN-Wavenet-C`) returning mu-law audio chunks for telephony playback.

#### [NEW] [ondcService.js](file:///c:/Users/midun/OneDrive/Desktop/Inkiro/server/src/services/ondcService.js)
- Beckn protocol implementation for ONDC Buyer App actions (`/search`, `/select`, `/init`, `/confirm`) with fallback POS mock integration.

#### [NEW] [paymentService.js](file:///c:/Users/midun/OneDrive/Desktop/Inkiro/server/src/services/paymentService.js)
- Razorpay Payment Link generator & Twilio SMS notification service.

#### [NEW] [db.js](file:///c:/Users/midun/OneDrive/Desktop/Inkiro/server/src/db.js)
- SQLite database schema for `calls`, `orders`, `catalog`, `merchants`, and `call_logs`.

---

### Operations Dashboard & Voice Simulator (`/client`)

#### [NEW] [package.json](file:///c:/Users/midun/OneDrive/Desktop/Inkiro/client/package.json)
- Vite + React, Lucide React icons, Tailwind/Vanilla CSS design system.

#### [NEW] [App.jsx](file:///c:/Users/midun/OneDrive/Desktop/Inkiro/client/src/App.jsx)
- Dashboard layout featuring 4 core views:
  1. **Voice Simulator & Live Inspector**: Call testing directly in browser with real microphone audio, live transcript feed, STT/Gemini/TTS latency meters, slot state visualizer, and audio player.
  2. **Live Call Monitor**: Active call session cards, real-time waveform visuals, audio stream health metrics.
  3. **Order Dispatch & KDS**: Real-time kitchen tickets, payment SMS status, ONDC dispatch logs.
  4. **Catalog & STT Tuning**: Menu manager with Tamil/English phonetic hints for STT accuracy optimization.

#### [NEW] [index.css](file:///c:/Users/midun/OneDrive/Desktop/Inkiro/client/src/index.css)
- Premium dark-mode design system with glassmorphism, glow accents, micro-animations, and audio waveform styling.

---

## Verification Plan

### Automated & Unit Tests
- Audio converter test: Verify 8kHz Mu-law to 16kHz PCM audio buffer translation.
- Dialogue Manager test: Test Gemini Flash prompt with Tamil and English test strings ("1 chicken biryani and 2 butter naan", "enaku oru paneer butter masala venum").
- ONDC mock payload verification: Validate `/confirm` order JSON structure.

### Manual & Interactive Verification
1. **Interactive Web Voice Simulator**: Speak into the browser microphone -> verify STT transcription -> verify Gemini slot extraction -> hear TTS voice reply back -> verify order created in KDS.
2. **REST API Verification**: Test `/api/calls`, `/api/orders`, `/api/catalogs`, `/api/payment-link`.
3. **Twilio Webhook Verification**: Send mock Twilio `media` WebSocket events and confirm `<Connect><Stream>` TwiML response.
