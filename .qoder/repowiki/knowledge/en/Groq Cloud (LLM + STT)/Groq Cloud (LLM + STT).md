---
kind: external_dependency
name: Groq Cloud (LLM + STT)
slug: groq
category: external_dependency
category_hints:
    - vendor_identity
    - auth_protocol
scope:
    - '**'
---

Groq is offered as an alternative LLM and speech-to-text provider. Configure via `AI_LLM_PROVIDER=groq` or `AI_STT_PROVIDER=groq` plus `GROQ_API_KEY`. The free tier includes Llama 3.3 70B and Whisper Large v3. Used as a fallback when Gemini is unavailable.