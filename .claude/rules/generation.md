---
paths:
  - "src/lib/comfy/**/*.ts"
  - "src/actions/**/*Generation*.ts"
  - "src/app/api/jobs/**/*.ts"
  - "src/app/api/generated-outputs/**/*.ts"
---

# Generation Runtime Rules

- Do not create a second workflow patcher, job runner, polling loop, or output publisher.
- Reuse canonical payload, provider, preflight, provenance, and cleanup contracts.
- Preserve Local and Comfy Cloud behavior unless the ticket explicitly narrows scope.
- Never perform paid Cloud or Partner Node calls without explicit authorization.
- Validate output bytes and provenance before durable publication.
- Treat runtime files as local state; never stage outputs, uploads, caches, or logs.
