---
kind: external_dependency
name: Google Gemini LLM Provider
slug: google-gemini
category: external_dependency
category_hints:
    - vendor_identity
    - auth_protocol
scope:
    - '**'
---

Gemini is the default LLM provider for VoiceCart's dialogue engine, accessed through the `@google/generative-ai` SDK. Authentication is via `GEMINI_API_KEY`. In docker-compose production, `AI_LLM_PRIMARY_PROVIDER=gemini` selects it at startup. The provider is swappable via `AI_LLM_PROVIDER` (groq | gemini | openrouter) without code changes.