---
kind: external_dependency
name: Razorpay Payment Links
slug: razorpay
category: external_dependency
category_hints:
    - vendor_identity
    - auth_protocol
scope:
    - '**'
---

Razorpay is used to generate payment links for order checkout. Credentials are `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET`. The integration creates payment links rather than full checkout flows, suitable for voice-initiated orders where customers complete payment via a shared link.