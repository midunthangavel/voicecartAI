---
kind: external_dependency
name: Google Cloud Speech Services
slug: google-cloud-speech
category: external_dependency
category_hints:
    - vendor_identity
    - auth_protocol
scope:
    - '**'
---

Google Cloud Speech-to-Text and Text-to-Speech are available as STT/TTS providers via Google's Node.js client library, authenticated through a service account JSON key pointed to by `GOOGLE_APPLICATION_CREDENTIALS`. Select via `AI_STT_PROVIDER=google` / `AI_TTS_PROVIDER=google`.