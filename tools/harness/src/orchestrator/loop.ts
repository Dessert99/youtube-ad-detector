import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import type { GitResult } from '../git/commands.js';
import {
  buildPreamble,
  buildStepContext,
  loadGuardrails,
} from '../claude/preamble.js';
import type { ClaudeResult, InvokeOptions } from '../claude/invoker.js';
import type { ACVerifyResult } from '../verify/ac.js';
import {
  readPhaseIndex,
  updateStep,
  upsertPlanStatus,
  writePhaseIndex,
} from '../state/io.js';
import { checkBlockers } from './blocker.js';

export interface OrchestratorContext {
  repoRoot: string;
  planDirName: string;
  phaseIndexPath: string;
  plansIndexPath: string;
  stepFilePath: (stepNum: number) => string;
  stepOutputPath: (stepNum: number) => string;
  project: string;
  phaseName: string;
  maxRetries: number;
  claudeTimeoutMs: number;
  claudeInvoke: (opts: InvokeOptions) => ClaudeResult;
  verifyAc: (cmds: string[], cwd: string) => ACVerifyResult;
  parseAc: (stepMarkdownPath: string) => string[];
  nowIso: () => string;
  twoStageCommit: (opts: {
    cwd: string;
    featMessage: string;
    choreMessage: string;
    excludeFromFeat: string[];
  }) => { feat: GitResult | null; chore: GitResult | null };
  checkoutBranch: (name: string, cwd: string) => void;
  commitStaged: (message: string, cwd: string) => GitResult | null;
  addAll: (cwd: string) => void;
  exit: (code: number) => void;
  log: (msg: string) => void;
}

export interface StepRunOutcome {
  kind: 'completed' | 'error' | 'blocked';
  stepNum: number;
  stepName: string;
  message?: string;
}

export function executeSingleStep(
  ctx: OrchestratorContext,
  stepNum: number
): StepRunOutcome {
  const preIdx = readPhaseIndex(ctx.phaseIndexPath);
  const preStep = preIdx.steps.find((s) => s.step === stepNum);
  if (!preStep) throw new Error(`step ${stepNum} not found`);
  if (!preStep.started_at) {
    updateStep(ctx.phaseIndexPath, stepNum, { started_at: ctx.nowIso() });
  }

  let prevError: string | undefined;
  const phaseIndexRel = relative(ctx.repoRoot, ctx.phaseIndexPath);
  const stepOutputRel = relative(ctx.repoRoot, ctx.stepOutputPath(stepNum));

  for (let attempt = 1; attempt <= ctx.maxRetries; attempt++) {
    const guardrails = loadGuardrails({
      repoRoot: ctx.repoRoot,
      planDir: ctx.planDirName,
    });
    const idxNow = readPhaseIndex(ctx.phaseIndexPath);
    const stepContext = buildStepContext(idxNow);
    const preamble = buildPreamble({
      project: ctx.project,
      phaseName: ctx.phaseName,
      phaseDirName: ctx.planDirName,
      guardrails,
      stepContext,
      prevError,
      maxRetries: ctx.maxRetries,
    });
    const stepBody = readFileSync(ctx.stepFilePath(stepNum), 'utf8');
    const prompt = `${preamble}\n\n---\n\n# stepN.md 본문\n\n${stepBody}`;

    ctx.log(`[step ${stepNum}] attempt ${attempt}/${ctx.maxRetries}`);
    ctx.claudeInvoke({
      prompt,
      cwd: ctx.repoRoot,
      timeoutMs: ctx.claudeTimeoutMs,
      outputPath: ctx.stepOutputPath(stepNum),
    });

    const afterIdx = readPhaseIndex(ctx.phaseIndexPath);
    const afterStep = afterIdx.steps.find((s) => s.step === stepNum);
    if (!afterStep) throw new Error(`step ${stepNum} disappeared`);
    let status = afterStep.status;
    let errorMessage = afterStep.error_message;

    if (status === 'completed') {
      const cmds = ctx.parseAc(ctx.stepFilePath(stepNum));
      const verify = ctx.verifyAc(cmds, ctx.repoRoot);
      if (verify.ok) {
        updateStep(ctx.phaseIndexPath, stepNum, { completed_at: ctx.nowIso() });
        ctx.twoStageCommit({
          cwd: ctx.repoRoot,
          featMessage: `feat(${ctx.planDirName}): step ${stepNum} — ${afterStep.name}`,
          choreMessage: `chore(${ctx.planDirName}): step ${stepNum} output`,
          excludeFromFeat: [phaseIndexRel, stepOutputRel],
        });
        return {
          kind: 'completed',
          stepNum,
          stepName: afterStep.name,
        };
      }
      const msg = `AC 재실행 실패: ${verify.failedCommand} (exit ${verify.failedExitCode})`;
      updateStep(ctx.phaseIndexPath, stepNum, {
        status: 'error',
        error_message: msg,
      });
      status = 'error';
      errorMessage = msg;
    }

    if (status === 'blocked') {
      updateStep(ctx.phaseIndexPath, stepNum, { blocked_at: ctx.nowIso() });
      upsertPlanStatus(
        ctx.plansIndexPath,
        ctx.planDirName,
        'blocked',
        ctx.nowIso()
      );
      return {
        kind: 'blocked',
        stepNum,
        stepName: afterStep.name,
        message: afterStep.blocked_reason,
      };
    }

    if (status === 'pending') {
      errorMessage = 'Step did not report status';
      status = 'error';
    }

    if (status === 'error') {
      if (attempt < ctx.maxRetries) {
        prevError = errorMessage ?? 'unknown error';
        updateStep(ctx.phaseIndexPath, stepNum, {
          status: 'pending',
          error_message: null as unknown as undefined,
        });
        continue;
      }
      const finalMsg = `[${ctx.maxRetries}회 시도 후 실패] ${errorMessage ?? prevError ?? 'unknown'}`;
      updateStep(ctx.phaseIndexPath, stepNum, {
        status: 'error',
        error_message: finalMsg,
        failed_at: ctx.nowIso(),
      });
      ctx.twoStageCommit({
        cwd: ctx.repoRoot,
        featMessage: `chore(${ctx.planDirName}): step ${stepNum} failed attempts`,
        choreMessage: `chore(${ctx.planDirName}): step ${stepNum} output (failure)`,
        excludeFromFeat: [phaseIndexRel, stepOutputRel],
      });
      upsertPlanStatus(
        ctx.plansIndexPath,
        ctx.planDirName,
        'error',
        ctx.nowIso()
      );
      return {
        kind: 'error',
        stepNum,
        stepName: afterStep.name,
        message: finalMsg,
      };
    }
  }

  throw new Error(
    `unreachable: step ${stepNum} exhausted attempts without outcome`
  );
}

export function executeAllSteps(ctx: OrchestratorContext): void {
  ctx.checkoutBranch(`feat-${ctx.planDirName}`, ctx.repoRoot);

  const initial = readPhaseIndex(ctx.phaseIndexPath);
  const block = checkBlockers(initial);
  if (block.kind === 'error') {
    ctx.log(
      `BLOCK: step ${block.step} (${block.name}) is in error: ${block.message}`
    );
    ctx.exit(1);
    return;
  }
  if (block.kind === 'blocked') {
    ctx.log(
      `BLOCK: step ${block.step} (${block.name}) is blocked: ${block.reason}`
    );
    ctx.exit(2);
    return;
  }

  while (true) {
    const idx = readPhaseIndex(ctx.phaseIndexPath);
    const nextPending = idx.steps.find((s) => s.status === 'pending');
    if (!nextPending) break;

    const outcome = executeSingleStep(ctx, nextPending.step);
    if (outcome.kind === 'error') {
      ctx.exit(1);
      return;
    }
    if (outcome.kind === 'blocked') {
      ctx.exit(2);
      return;
    }
  }

  const finalIdx = readPhaseIndex(ctx.phaseIndexPath);
  finalIdx.completed_at = ctx.nowIso();
  writePhaseIndex(ctx.phaseIndexPath, finalIdx);
  upsertPlanStatus(
    ctx.plansIndexPath,
    ctx.planDirName,
    'completed',
    ctx.nowIso()
  );
  ctx.addAll(ctx.repoRoot);
  ctx.commitStaged(
    `chore(${ctx.planDirName}): mark phase completed`,
    ctx.repoRoot
  );
  ctx.log(`DONE: ${ctx.planDirName} completed.`);
}
