import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { ClaudeResult } from '../../src/claude/invoker.js';
import {
  executeAllSteps,
  executeSingleStep,
  type OrchestratorContext,
} from '../../src/orchestrator/loop.js';
import {
  readPhaseIndex,
  readPlansIndex,
  updateStep,
  writeJson,
} from '../../src/state/io.js';
import type { PhaseIndex, PlansIndex } from '../../src/state/schema.js';
import type { ACVerifyResult } from '../../src/verify/ac.js';

interface TestHarness {
  root: string;
  phaseIndexPath: string;
  plansIndexPath: string;
  stepFilePath: (n: number) => string;
  stepOutputPath: (n: number) => string;
  planDirName: string;
}

function setupRepo(options: {
  steps: Array<{ step: number; name: string; status?: string }>;
  stepAcByNumber: Record<number, string[]>;
}): TestHarness {
  const planDirName = 'plan_test';
  const root = mkdtempSync(join(tmpdir(), 'harness-loop-'));
  const phasesDir = join(root, 'docs', planDirName, 'phases');
  mkdirSync(phasesDir, { recursive: true });
  writeFileSync(join(root, 'CLAUDE.md'), '# root');
  writeFileSync(join(root, 'docs', planDirName, 'PRD.md'), '# prd');

  const phaseIndexPath = join(phasesDir, 'index.json');
  const plansIndexPath = join(root, 'docs', 'plans-index.json');

  writeJson(phaseIndexPath, {
    project: 'p',
    phase: planDirName,
    steps: options.steps.map((s) => ({
      step: s.step,
      name: s.name,
      status: (s.status ?? 'pending') as PhaseIndex['steps'][number]['status'],
    })),
  });
  writeJson(plansIndexPath, { plans: [] } satisfies PlansIndex);

  for (const s of options.steps) {
    const ac = options.stepAcByNumber[s.step] ?? ['true'];
    const body = `# Step ${s.step}: ${s.name}\n\n## Acceptance Criteria\n\n\`\`\`bash\n${ac.join('\n')}\n\`\`\`\n`;
    writeFileSync(join(phasesDir, `step${s.step}.md`), body);
  }

  return {
    root,
    phaseIndexPath,
    plansIndexPath,
    stepFilePath: (n) => join(phasesDir, `step${n}.md`),
    stepOutputPath: (n) => join(phasesDir, `step${n}-output.json`),
    planDirName,
  };
}

function makeContext(
  h: TestHarness,
  overrides: Partial<OrchestratorContext> = {}
): OrchestratorContext {
  let clock = 0;
  return {
    repoRoot: h.root,
    planDirName: h.planDirName,
    phaseIndexPath: h.phaseIndexPath,
    plansIndexPath: h.plansIndexPath,
    stepFilePath: h.stepFilePath,
    stepOutputPath: h.stepOutputPath,
    project: 'p',
    phaseName: h.planDirName,
    maxRetries: 3,
    claudeTimeoutMs: 1000,
    claudeInvoke: vi.fn(
      (): ClaudeResult => ({
        exitCode: 0,
        stdout: '',
        stderr: '',
        durationMs: 1,
      })
    ),
    verifyAc: vi.fn((): ACVerifyResult => ({ ok: true, executed: [] })),
    parseAc: vi.fn(() => []),
    nowIso: vi.fn(
      () => `2026-01-01T00:00:${String(++clock).padStart(2, '0')}Z`
    ),
    twoStageCommit: vi.fn(() => ({ feat: null, chore: null })),
    checkoutBranch: vi.fn(),
    commitStaged: vi.fn(() => null),
    addAll: vi.fn(),
    exit: vi.fn(),
    log: vi.fn(),
    ...overrides,
  };
}

function simulateClaudeSets(
  statusByCall: Array<{
    step: number;
    status: PhaseIndex['steps'][number]['status'];
    fields?: Record<string, unknown>;
  }>
) {
  let callIdx = 0;
  return (h: TestHarness) =>
    vi.fn((): ClaudeResult => {
      const target = statusByCall[callIdx++];
      if (target) {
        updateStep(h.phaseIndexPath, target.step, {
          status: target.status,
          ...(target.fields ?? {}),
        });
      }
      return { exitCode: 0, stdout: '', stderr: '', durationMs: 1 };
    });
}

describe('executeAllSteps — happy path', () => {
  it('runs each step once and commits twice per step', () => {
    const h = setupRepo({
      steps: [
        { step: 0, name: 'a' },
        { step: 1, name: 'b' },
      ],
      stepAcByNumber: { 0: ['true'], 1: ['true'] },
    });
    const claudeInvoke = simulateClaudeSets([
      { step: 0, status: 'completed' },
      { step: 1, status: 'completed' },
    ])(h);
    const ctx = makeContext(h, { claudeInvoke });

    executeAllSteps(ctx);

    const idx = readPhaseIndex(h.phaseIndexPath);
    expect(idx.steps.every((s) => s.status === 'completed')).toBe(true);
    expect(idx.steps[0].started_at).toBeDefined();
    expect(idx.steps[0].completed_at).toBeDefined();
    expect(idx.completed_at).toBeDefined();
    expect(ctx.twoStageCommit).toHaveBeenCalledTimes(2);
    const plans = readPlansIndex(h.plansIndexPath);
    expect(plans.plans[0].status).toBe('completed');
  });
});

describe('executeSingleStep — retry after error', () => {
  it('feeds prevError into the second preamble and succeeds on retry', () => {
    const h = setupRepo({
      steps: [{ step: 0, name: 'a' }],
      stepAcByNumber: { 0: ['true'] },
    });
    let call = 0;
    const prompts: string[] = [];
    const claudeInvoke = vi.fn((opts) => {
      prompts.push(opts.prompt);
      call++;
      if (call === 1) {
        updateStep(h.phaseIndexPath, 0, {
          status: 'error',
          error_message: 'first failure',
        });
      } else {
        updateStep(h.phaseIndexPath, 0, { status: 'completed' });
      }
      return { exitCode: 0, stdout: '', stderr: '', durationMs: 1 };
    });
    const ctx = makeContext(h, { claudeInvoke });

    const outcome = executeSingleStep(ctx, 0);
    expect(outcome.kind).toBe('completed');
    expect(prompts[1]).toContain('first failure');
    expect(prompts[1]).toContain('이전 시도 실패');
  });
});

describe('executeSingleStep — exhausts retries', () => {
  it('marks error and calls upsertPlanStatus after maxRetries', () => {
    const h = setupRepo({
      steps: [{ step: 0, name: 'a' }],
      stepAcByNumber: { 0: ['true'] },
    });
    const claudeInvoke = vi.fn(() => {
      updateStep(h.phaseIndexPath, 0, {
        status: 'error',
        error_message: 'always fails',
      });
      return { exitCode: 0, stdout: '', stderr: '', durationMs: 1 };
    });
    const ctx = makeContext(h, { claudeInvoke });

    const outcome = executeSingleStep(ctx, 0);
    expect(outcome.kind).toBe('error');
    expect(claudeInvoke).toHaveBeenCalledTimes(3);
    const idx = readPhaseIndex(h.phaseIndexPath);
    expect(idx.steps[0].status).toBe('error');
    expect(idx.steps[0].failed_at).toBeDefined();
    const plans = readPlansIndex(h.plansIndexPath);
    expect(plans.plans[0].status).toBe('error');
  });
});

describe('executeSingleStep — blocked short-circuits', () => {
  it('returns blocked without retry', () => {
    const h = setupRepo({
      steps: [{ step: 0, name: 'a' }],
      stepAcByNumber: { 0: ['true'] },
    });
    const claudeInvoke = vi.fn(() => {
      updateStep(h.phaseIndexPath, 0, {
        status: 'blocked',
        blocked_reason: 'need secret',
      });
      return { exitCode: 0, stdout: '', stderr: '', durationMs: 1 };
    });
    const ctx = makeContext(h, { claudeInvoke });

    const outcome = executeSingleStep(ctx, 0);
    expect(outcome.kind).toBe('blocked');
    expect(claudeInvoke).toHaveBeenCalledTimes(1);
    const plans = readPlansIndex(h.plansIndexPath);
    expect(plans.plans[0].status).toBe('blocked');
  });
});

describe('executeSingleStep — AC verify demotes to error', () => {
  it('demotes completed to error when AC re-run fails, then retries', () => {
    const h = setupRepo({
      steps: [{ step: 0, name: 'a' }],
      stepAcByNumber: { 0: ['true'] },
    });
    const claudeInvoke = vi.fn(() => {
      updateStep(h.phaseIndexPath, 0, { status: 'completed' });
      return { exitCode: 0, stdout: '', stderr: '', durationMs: 1 };
    });
    let verifyCalls = 0;
    const verifyAc = vi.fn((): ACVerifyResult => {
      verifyCalls++;
      if (verifyCalls === 1) {
        return {
          ok: false,
          executed: ['x'],
          failedCommand: 'x',
          failedExitCode: 1,
        };
      }
      return { ok: true, executed: ['x'] };
    });
    const ctx = makeContext(h, { claudeInvoke, verifyAc });

    const outcome = executeSingleStep(ctx, 0);
    expect(outcome.kind).toBe('completed');
    expect(claudeInvoke).toHaveBeenCalledTimes(2);
    expect(verifyAc).toHaveBeenCalledTimes(2);
  });
});

describe('executeAllSteps — pre-existing error blocks', () => {
  it('exits immediately when a prior step is already error', () => {
    const h = setupRepo({
      steps: [
        { step: 0, name: 'a', status: 'error' },
        { step: 1, name: 'b' },
      ],
      stepAcByNumber: { 0: ['true'], 1: ['true'] },
    });
    updateStep(h.phaseIndexPath, 0, { error_message: 'boom' });
    const ctx = makeContext(h);

    executeAllSteps(ctx);

    expect(ctx.exit).toHaveBeenCalledWith(1);
    expect(ctx.claudeInvoke).not.toHaveBeenCalled();
  });
});
