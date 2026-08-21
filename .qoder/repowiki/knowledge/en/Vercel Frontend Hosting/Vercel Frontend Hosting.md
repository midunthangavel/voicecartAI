---
kind: external_dependency
name: Vercel Frontend Hosting
slug: vercel
category: external_dependency
category_hints:
    - vendor_identity
scope:
    - '**'
---

The React/Vite client dashboard is built and deployed via Vercel (indicated by `vercel.json` in both `client/` and repo root). The build script uses `vite build` and the deployment target is the Vercel platform.