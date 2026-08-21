---
kind: external_dependency
name: OpenRouter Fallback LLM
slug: openrouter
category: external_dependency
category_hints:
    - vendor_identity
    - auth_protocol
scope:
    - '**'
---

OpenRouter serves as a fallback LLM provider when primary providers are unavailable. Set `AI_LLM_PROVIDER=openrouter` and supply `OPENROUTER_API_KEY`. Provides access to multiple model backends through a single API key.