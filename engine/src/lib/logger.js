// Tiny structured logger with timestamps. Keeps output readable for a
// non-technical operator watching the run.

const ts = () => new Date().toISOString().replace('T', ' ').slice(0, 19);

export const log = {
  info: (msg, ...rest) => console.log(`[${ts()}] ℹ️  ${msg}`, ...rest),
  ok: (msg, ...rest) => console.log(`[${ts()}] ✅ ${msg}`, ...rest),
  warn: (msg, ...rest) => console.warn(`[${ts()}] ⚠️  ${msg}`, ...rest),
  error: (msg, ...rest) => console.error(`[${ts()}] ❌ ${msg}`, ...rest),
  step: (msg, ...rest) => console.log(`[${ts()}] ▶️  ${msg}`, ...rest),
  dry: (msg, ...rest) => console.log(`[${ts()}] 🧪 [DRY-RUN] ${msg}`, ...rest),
};
