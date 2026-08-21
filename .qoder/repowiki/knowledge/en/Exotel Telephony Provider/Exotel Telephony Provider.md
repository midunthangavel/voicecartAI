---
kind: external_dependency
name: Exotel Telephony Provider
slug: exotel
category: external_dependency
category_hints:
    - vendor_identity
scope:
    - '**'
---

Exotel is configured as an alternative telephony provider alongside Twilio. It follows the same call lifecycle and audio-streaming contract as Twilio — the two branches in `sessionPipeline.js` are currently duplicated verbatim and should be unified behind a single audio-delivery strategy. No separate credentials were found in `.env.example`; configure via equivalent environment variables when enabling Exotel mode.