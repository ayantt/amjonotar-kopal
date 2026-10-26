import { defineConfig } from "vitest/config";

// Separate config so the long balance simulation never runs as part of `npm test`.
export default defineConfig({ test: { environment: "node", include: ["tests/analytics/*.sim.ts"] } });
