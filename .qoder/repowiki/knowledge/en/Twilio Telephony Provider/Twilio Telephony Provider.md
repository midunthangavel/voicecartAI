---
kind: external_dependency
name: Twilio Telephony Provider
slug: twilio
category: external_dependency
category_hints:
    - vendor_identity
    - sdk_real_api
scope:
    - '**'
---

VoiceCart AI uses Twilio as one of its telephony providers for inbound/outbound voice calls and SMS. Integration points:
- Webhook endpoints in `telephony.controller.js` receive Twilio call events (answer, media, stream) and route them into the WebSocket session pipeline.
- `sessionPipeline.js` streams Twilio Media events to the client dashboard as base64 audio chunks via a dedicated `media` event shape.
- Credentials are injected via `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` from `.env`.
- The provider is selected at runtime alongside Exotel; both share an identical audio-chunking strategy that must be unified under a Strategy pattern.
Verify exact webhook signatures and streaming API shapes against the official Twilio Voice Streams docs.