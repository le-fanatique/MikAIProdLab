---
paths:
  - "src/db/**/*.ts"
  - "src/actions/**/*.ts"
  - "drizzle/**/*.sql"
  - "drizzle/meta/**/*.json"
---

# Database And Mutation Rules

- No schema or migration change unless the active ticket explicitly authorizes it.
- Generate migrations through Drizzle; never hand-write generated migrations.
- Validate all untrusted Server Action inputs at runtime before writes.
- Keep ownership, concurrency checks, mutation, and durable publication atomic.
- For filesystem plus DB operations, use explicit compensation and report
  cleanup failures honestly.
- Prove preservation, foreign-key integrity, and no schema drift when a
  migration is authorized.
