import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildPreamble,
  buildStepContext,
  loadGuardrails,
} from '../../src/claude/preamble.js';
import type { PhaseIndex } from '../../src/state/schema.js';

function makeFakeRepo(planName: string): string {
  const root = mkdtempSync(join(tmpdir(), 'harness-preamble-'));
  mkdirSync(join(root, 'docs', planName, 'phases'), { recursive: true });
  return root;
}

describe('loadGuardrails', () => {
  it('merges CLAUDE.md and plan .md files with separators', () => {
    const root = makeFakeRepo('plan_x');
    writeFileSync(join(root, 'CLAUDE.md'), '# root');
    writeFileSync(join(root, 'docs', 'plan_x', 'PRD.md'), '# prd');
    writeFileSync(join(root, 'docs', 'plan_x', 'ADR.md'), '# adr');
    const out = loadGuardrails({ repoRoot: root, planDir: 'plan_x' });
    expect(out).toContain('# root');
    expect(out).toContain('# prd');
    expect(out).toContain('# adr');
    expect(out).toContain('---');
  });

  it('ignores files under phases/', () => {
    const root = makeFakeRepo('plan_x');
    writeFileSync(join(root, 'docs', 'plan_x', 'PRD.md'), 'PRD CONTENT');
    writeFileSync(
      join(root, 'docs', 'plan_x', 'phases', 'step0.md'),
      'STEP0 CONTENT'
    );
    const out = loadGuardrails({ repoRoot: root, planDir: 'plan_x' });
    expect(out).toContain('PRD CONTENT');
    expect(out).not.toContain('STEP0 CONTENT');
  });

  it('returns only plan docs when CLAUDE.md is missing', () => {
    const root = makeFakeRepo('plan_x');
    writeFileSync(join(root, 'docs', 'plan_x', 'PRD.md'), 'PRDONLY');
    const out = loadGuardrails({ repoRoot: root, planDir: 'plan_x' });
    expect(out).toContain('PRDONLY');
    expect(out).not.toContain('# CLAUDE.md');
  });
});

describe('buildStepContext', () => {
  it('lists completed steps that have a summary', () => {
    const idx: PhaseIndex = {
      project: 'p',
      phase: 'ph',
      steps: [
        { step: 0, name: 'a', status: 'completed', summary: 'sa' },
        { step: 1, name: 'b', status: 'completed' },
        { step: 2, name: 'c', status: 'pending' },
      ],
    };
    const out = buildStepContext(idx);
    expect(out).toContain('step 0 (a): sa');
    expect(out).not.toContain('step 1');
    expect(out).not.toContain('step 2');
  });

  it('returns empty string when nothing to include', () => {
    const idx: PhaseIndex = {
      project: 'p',
      phase: 'ph',
      steps: [{ step: 0, name: 'a', status: 'pending' }],
    };
    expect(buildStepContext(idx)).toBe('');
  });
});

describe('buildPreamble', () => {
  const base = {
    project: 'limjaejoon.com',
    phaseName: 'plan_harness',
    phaseDirName: 'plan_harness',
    guardrails: '# guard',
    stepContext: '## 이전 step 요약\n- step 0: ok',
    maxRetries: 3,
  };

  it('omits retry section when prevError is not provided', () => {
    const out = buildPreamble(base);
    expect(out).not.toContain('이전 시도 실패');
  });

  it('includes prev error body when provided', () => {
    const out = buildPreamble({ ...base, prevError: 'AC FAILED on line 3' });
    expect(out).toContain('이전 시도 실패');
    expect(out).toContain('AC FAILED on line 3');
  });

  it('includes all six work rules', () => {
    const out = buildPreamble(base);
    expect(out).toContain('이전 step에서 작성된 코드와 일관성');
    expect(out).toContain('이 step에 명시된 작업만 수행');
    expect(out).toContain('기존 테스트를 깨뜨리지 않는다');
    expect(out).toContain('AC(Acceptance Criteria) 커맨드를 직접 실행');
    expect(out).toContain('phases/index.json');
    expect(out).toContain('커밋은 하네스');
    console.log('\n--- preamble sample ---\n' + out + '\n--- end ---\n');
  });
});
