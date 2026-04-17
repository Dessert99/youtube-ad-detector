import type { PhaseIndex } from '../state/schema.js';

export type BlockReason =
  | { kind: 'none' }
  | { kind: 'error'; step: number; name: string; message: string }
  | { kind: 'blocked'; step: number; name: string; reason: string };

export function checkBlockers(index: PhaseIndex): BlockReason {
  for (let i = index.steps.length - 1; i >= 0; i--) {
    const s = index.steps[i];
    if (s.status === 'pending') continue;
    if (s.status === 'completed') return { kind: 'none' };
    if (s.status === 'error') {
      return {
        kind: 'error',
        step: s.step,
        name: s.name,
        message: s.error_message ?? 'error without message',
      };
    }
    if (s.status === 'blocked') {
      return {
        kind: 'blocked',
        step: s.step,
        name: s.name,
        reason: s.blocked_reason ?? 'blocked without reason',
      };
    }
  }
  return { kind: 'none' };
}
