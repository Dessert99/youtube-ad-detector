import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { parseArgv, runHarness } from '../src/execute.js';
import { writeJson } from '../src/state/io.js';
import type { PhaseIndex, PlansIndex } from '../src/state/schema.js';

describe('parseArgv', () => {
  it('throws with usage when no args given', () => {
    expect(() => parseArgv([])).toThrow(/usage/i);
  });

  it('parses a plan-dir-name', () => {
    expect(parseArgv(['plan_harness'])).toEqual({
      planDirName: 'plan_harness',
      push: false,
    });
  });

  it('accepts --push after the name', () => {
    expect(parseArgv(['plan_harness', '--push']).push).toBe(true);
  });

  it('accepts --push before the name', () => {
    expect(parseArgv(['--push', 'plan_harness']).push).toBe(true);
  });

  it('rejects unknown flags', () => {
    expect(() => parseArgv(['plan_x', '--unknown'])).toThrow(/unknown flag/i);
  });

  it('rejects path-traversal-shaped names', () => {
    expect(() => parseArgv(['../etc'])).toThrow(/invalid/i);
  });

  it('rejects names with slashes', () => {
    expect(() => parseArgv(['a/b'])).toThrow(/invalid/i);
  });
});

function makeRepoWithPlan(): { root: string; planDirName: string } {
  const root = mkdtempSync(join(tmpdir(), 'harness-cli-'));
  const planDirName = 'plan_smoke';
  const phasesDir = join(root, 'docs', planDirName, 'phases');
  mkdirSync(phasesDir, { recursive: true });
  writeFileSync(join(root, 'CLAUDE.md'), '# root');
  writeFileSync(join(root, 'docs', planDirName, 'PRD.md'), '# prd');
  const phaseIndex: PhaseIndex = {
    project: 'p',
    phase: planDirName,
    steps: [{ step: 0, name: 'only', status: 'completed', summary: 'done' }],
  };
  writeJson(join(phasesDir, 'index.json'), phaseIndex);
  writeJson(join(root, 'docs', 'plans-index.json'), {
    plans: [],
  } satisfies PlansIndex);
  writeFileSync(
    join(phasesDir, 'step0.md'),
    `## Acceptance Criteria\n\n\`\`\`bash\ntrue\n\`\`\`\n`
  );
  return { root, planDirName };
}

describe('runHarness', () => {
  it('returns 1 with friendly message when phases/index.json is missing', () => {
    const root = mkdtempSync(join(tmpdir(), 'harness-cli-missing-'));
    const errLog = vi.fn();
    const code = runHarness(
      { planDirName: 'plan_nope', push: false },
      { repoRoot: root, errLog }
    );
    expect(code).toBe(1);
    expect(errLog).toHaveBeenCalledWith(
      expect.stringContaining('phases/index.json not found')
    );
  });

  it('invokes pushBranch only when --push and all steps are completed', () => {
    const { root, planDirName } = makeRepoWithPlan();
    const pushBranch = vi.fn(() => ({ code: 0, stderr: '' }));

    const code = runHarness(
      { planDirName, push: true },
      {
        repoRoot: root,
        pushBranch,
        contextOverrides: {
          checkoutBranch: vi.fn(),
          commitStaged: vi.fn(() => null),
          addAll: vi.fn(),
        },
      }
    );

    expect(code).toBe(0);
    expect(pushBranch).toHaveBeenCalledWith(`feat-${planDirName}`, root);
  });

  it('does not push when push=false', () => {
    const { root, planDirName } = makeRepoWithPlan();
    const pushBranch = vi.fn(() => ({ code: 0, stderr: '' }));
    runHarness(
      { planDirName, push: false },
      {
        repoRoot: root,
        pushBranch,
        contextOverrides: {
          checkoutBranch: vi.fn(),
          commitStaged: vi.fn(() => null),
          addAll: vi.fn(),
        },
      }
    );
    expect(pushBranch).not.toHaveBeenCalled();
  });
});
