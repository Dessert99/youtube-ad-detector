import { describe, expect, it } from 'vitest';
import { checkBlockers } from '../../src/orchestrator/blocker.js';
import type { PhaseIndex } from '../../src/state/schema.js';

function idx(
  steps: Array<Partial<PhaseIndex['steps'][number]> & { step: number }>
): PhaseIndex {
  return {
    project: 'p',
    phase: 'ph',
    steps: steps.map((s) => ({
      name: `n${s.step}`,
      status: 'pending' as const,
      ...s,
    })),
  };
}

describe('checkBlockers', () => {
  it('returns none when all steps are pending', () => {
    expect(checkBlockers(idx([{ step: 0 }, { step: 1 }]))).toEqual({
      kind: 'none',
    });
  });

  it('returns none when the most recent non-pending is completed', () => {
    expect(
      checkBlockers(
        idx([
          { step: 0, status: 'completed' },
          { step: 1, status: 'pending' },
        ])
      )
    ).toEqual({ kind: 'none' });
  });

  it('returns error when the most recent non-pending is error', () => {
    const r = checkBlockers(
      idx([
        { step: 0, status: 'completed' },
        { step: 1, status: 'error', error_message: 'boom' },
        { step: 2, status: 'pending' },
      ])
    );
    expect(r.kind).toBe('error');
    if (r.kind === 'error') {
      expect(r.step).toBe(1);
      expect(r.message).toBe('boom');
    }
  });

  it('returns blocked when the most recent non-pending is blocked', () => {
    const r = checkBlockers(
      idx([{ step: 0, status: 'blocked', blocked_reason: 'need key' }])
    );
    expect(r.kind).toBe('blocked');
    if (r.kind === 'blocked') {
      expect(r.reason).toBe('need key');
    }
  });
});
