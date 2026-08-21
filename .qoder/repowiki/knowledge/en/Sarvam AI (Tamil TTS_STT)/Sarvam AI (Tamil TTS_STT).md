---
kind: external_dependency
name: Sarvam AI (Tamil TTS/STT)
slug: sarvam-ai
category: external_dependency
category_hints:
    - vendor_identity
    - auth_protocol
scope:
    - '**'
---

Sarvam AI provides Tamil-focused text-to-speech and speech-to-text services. Configure via `AI_TTS_PROVIDER=sarvam` / `AI_STT_PROVIDER=sarvam` and `SARVAM_API_KEY`. Docker Compose defaults to Sarvam for both TTS and STT in production. Used primarily for Tamil language voice interactions.