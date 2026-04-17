import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  readJson,
  readPhaseIndex,
  readPlansIndex,
  updateStep,
  upsertPlanStatus,
  writeJson,
} from '../../src/state/io.js';
import type { PhaseIndex, PlansIndex } from '../../src/state/schema.js';

function makeTmp(): string {
  return mkdtempSync(join(tmpdir(), 'harness-io-'));
}

describe('writeJson/readJson', () => {
  it('roundtrips a structured object', () => {
    const dir = makeTmp();
    const path = join(dir, 'x.json');
    const obj = { a: 1, b: [2, 3], c: { d: 'e' } };
    writeJson(path, obj);
    expect(readJson(path)).toEqual(obj);
    expect(readFileSync(path, 'utf8').endsWith('\n')).toBe(true);
  });
});

describe('updateStep', () => {
  let phasePath: string;

  beforeEach(() => {
    const dir = makeTmp();
    phasePath = join(dir, 'index.json');
    const seed: PhaseIndex = {
      project: 'p',
      phase: 'ph',
      steps: [
        { step: 0, name: 'a', status: 'completed', summary: 'seed' },
        { step: 1, name: 'b', status: 'pending' },
      ],
    };
    writeJson(phasePath, seed);
  });

  it('patches status and summary while preserving other fields', () => {
    updateStep(phasePath, 1, { status: 'completed', summary: 'done' });
    const idx = readPhaseIndex(phasePath);
    expect(idx.steps[1].status).toBe('completed');
    expect(idx.steps[1].summary).toBe('done');
    expect(idx.steps[0].summary).toBe('seed');
  });

  it('throws when step number is missing', () => {
    expect(() => updateStep(phasePath, 99, { status: 'completed' })).toThrow();
  });
});

describe('upsertPlanStatus', () => {
  let plansPath: string;

  beforeEach(() => {
    const dir = makeTmp();
    plansPath = join(dir, 'plans-index.json');
    const seed: PlansIndex = {
      plans: [{ dir: 'plan_existing', status: 'pending' }],
    };
    writeJson(plansPath, seed);
  });

  it('updates status of existing entry', () => {
    upsertPlanStatus(plansPath, 'plan_existing', 'completed');
    const idx = readPlansIndex(plansPath);
    expect(idx.plans[0].status).toBe('completed');
  });

  it('adds a new entry when dir is not present', () => {
    upsertPlanStatus(plansPath, 'plan_new', 'pending');
    const idx = readPlansIndex(plansPath);
    expect(idx.plans).toHaveLength(2);
    expect(idx.plans[1]).toEqual({ dir: 'plan_new', status: 'pending' });
  });

  it('writes the appropriate timestamp key per status', () => {
    upsertPlanStatus(
      plansPath,
      'plan_c',
      'completed',
      '2026-01-01T00:00:00+0900'
    );
    upsertPlanStatus(plansPath, 'plan_e', 'error', '2026-01-02T00:00:00+0900');
    upsertPlanStatus(
      plansPath,
      'plan_b',
      'blocked',
      '2026-01-03T00:00:00+0900'
    );
    const idx = readPlansIndex(plansPath);
    const c = idx.plans.find((p) => p.dir === 'plan_c')!;
    const e = idx.plans.find((p) => p.dir === 'plan_e')!;
    const b = idx.plans.find((p) => p.dir === 'plan_b')!;
    expect(c.completed_at).toBe('2026-01-01T00:00:00+0900');
    expect(e.failed_at).toBe('2026-01-02T00:00:00+0900');
    expect(b.blocked_at).toBe('2026-01-03T00:00:00+0900');
  });

  it('ignores timestamp for pending status', () => {
    upsertPlanStatus(
      plansPath,
      'plan_p',
      'pending',
      '2026-01-01T00:00:00+0900'
    );
    const idx = readPlansIndex(plansPath);
    const p = idx.plans.find((x) => x.dir === 'plan_p')!;
    expect(p.completed_at).toBeUndefined();
    expect(p.failed_at).toBeUndefined();
    expect(p.blocked_at).toBeUndefined();
  });
});

describe('readJson', () => {
  it('throws if file does not exist', () => {
    expect(() => readJson(join(tmpdir(), 'does-not-exist-xyz.json'))).toThrow();
  });
});
