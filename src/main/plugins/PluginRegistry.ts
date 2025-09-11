import { LockstepPlugin } from './LockstepPlugin';
import { SystemLockstepPlugin } from './SystemLockstepPlugin';

let cachedLockstep: LockstepPlugin | null = null;

export function getLockstepPlugin(): LockstepPlugin {
  if (cachedLockstep) return cachedLockstep;

  // Placeholder: attempt to load native Rust plugin if present.
  // Keep it non-fatal; fall back to system implementation.
  try {
    // Example future path: const native = require('../../native/lockstep.node');
    // if (native && native.createPlugin) { cachedLockstep = native.createPlugin(); return cachedLockstep; }
  } catch {
    // ignore and fall back
  }

  cachedLockstep = new SystemLockstepPlugin();
  return cachedLockstep;
}

