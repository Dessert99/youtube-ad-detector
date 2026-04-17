import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { PhaseIndex } from '../state/schema.js';

export function loadGuardrails(opts: {
  repoRoot: string;
  planDir: string;
}): string {
  const { repoRoot, planDir } = opts;
  const parts: string[] = [];

  const claudeMdPath = join(repoRoot, 'CLAUDE.md');
  if (existsSync(claudeMdPath)) {
    parts.push(`# CLAUDE.md\n\n${readFileSync(claudeMdPath, 'utf8').trim()}`);
  }

  const planPath = join(repoRoot, 'docs', planDir);
  if (existsSync(planPath) && statSync(planPath).isDirectory()) {
    const names = readdirSync(planPath).sort();
    for (const name of names) {
      if (!name.endsWith('.md')) continue;
      const full = join(planPath, name);
      if (!statSync(full).isFile()) continue;
      parts.push(
        `# docs/${planDir}/${name}\n\n${readFileSync(full, 'utf8').trim()}`
      );
    }
  }

  return parts.join('\n\n---\n\n');
}

export function buildStepContext(phaseIndex: PhaseIndex): string {
  const done = phaseIndex.steps.filter(
    (s) => s.status === 'completed' && s.summary
  );
  if (done.length === 0) return '';
  const lines = done.map((s) => `- step ${s.step} (${s.name}): ${s.summary}`);
  return `## 이전 step 요약\n\n${lines.join('\n')}`;
}

export interface BuildPreambleInput {
  project: string;
  phaseName: string;
  phaseDirName: string;
  guardrails: string;
  stepContext: string;
  prevError?: string;
  maxRetries: number;
}

const WORK_RULES = [
  '1. 이전 step에서 작성된 코드와 일관성을 유지한다.',
  '2. 이 step에 명시된 작업만 수행하고, 범위 밖의 기능을 추가하지 않는다.',
  '3. 기존 테스트를 깨뜨리지 않는다.',
  '4. AC(Acceptance Criteria) 커맨드를 직접 실행해 통과를 확인한다.',
  '5. `docs/plan_<name>/phases/index.json`의 해당 step status를 업데이트한다(완료 시 completed + summary, 실패 시 error + error_message, 차단 시 blocked + blocked_reason).',
  '6. 커밋은 하네스 오케스트레이터가 2단계로 자동 처리하므로 직접 `git commit`을 실행하지 않는다.',
];

export function buildPreamble(input: BuildPreambleInput): string {
  const {
    project,
    phaseName,
    phaseDirName,
    guardrails,
    stepContext,
    prevError,
    maxRetries,
  } = input;

  const sections: string[] = [];
  sections.push(
    `당신은 ${project} 프로젝트의 개발자입니다. 아래 step을 수행하세요.`
  );
  sections.push(`플랜: ${phaseName} (phases/${phaseDirName})`);

  if (guardrails.trim().length > 0) {
    sections.push(guardrails);
  }
  if (stepContext.trim().length > 0) {
    sections.push(stepContext);
  }
  if (prevError && prevError.trim().length > 0) {
    sections.push(
      `## ⚠ 이전 시도 실패 (최대 ${maxRetries}회 재시도)\n\n이 step은 직전에 실패했습니다. 실패 원인을 반영해 재시도하세요.\n\n\`\`\`\n${prevError.trim()}\n\`\`\``
    );
  }
  sections.push(`## 작업 규칙\n\n${WORK_RULES.join('\n')}`);

  return sections.join('\n\n');
}
