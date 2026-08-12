---
paths:
  - "src/app/**/*.tsx"
  - "src/components/**/*.tsx"
---

# Frontend Rules

- Read the relevant Next.js 16 guide in `node_modules/next/dist/docs/`.
- Reuse existing MikAI components and theme-mapped colors.
- Keep business logic and durable decisions out of Client Components.
- Preserve loading, empty, success, error, disabled, keyboard, and focus states.
- For failed mutations, preserve the user's local form values.
- Validate visible behavior in a real browser when tooling is available;
  otherwise document the limit and provide a manual checklist.
