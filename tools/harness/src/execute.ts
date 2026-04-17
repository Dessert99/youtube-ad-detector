import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { invokeClaude } from './claude/invoker.js';
import {
  checkoutBranch,
  commitStaged,
  runGit,
  twoStageCommit,
} from './git/commands.js';
import { executeAllSteps } from './orchestrator/loop.js';
import type { OrchestratorContext } from './orchestrator/loop.js';
import { parseACFromStep, runACCommands } from './verify/ac.js';

const PROJECT = 'youtube-ad-detector';
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_CLAUDE_TIMEOUT_MS = 1_800_000;
const PLAN_NAME_RE = /^[a-z0-9_-]+$/i;

export interface ParsedArgv {
  planDirName: string;
  push: boolean;
}

export function parseArgv(argv: string[]): ParsedArgv {
  let planDirName: string | undefined;
  let push = false;
  for (const arg of argv) {
    if (arg === '--push') {
      push = true;
      continue;
    }
    if (arg.startsWith('--')) {
      throw new Error(`unknown flag: ${arg}`);
    }
    if (planDirName !== undefined) {
      throw new Error(`unexpected extra argument: ${arg}`);
    }
    planDirName = arg;
  }
  if (!planDirName) {
    throw new Error('usage: npm run harness <plan-dir-name> [--push]');
  }
  if (!PLAN_NAME_RE.test(planDirName)) {
    throw new Error(
      `invalid plan-dir-name "${planDirName}": must match ${PLAN_NAME_RE}`
    );
  }
  return { planDirName, push };
}

export interface RunHarnessDeps {
  repoRoot?: string;
  pushBranch?: (
    branch: string,
    cwd: string
  ) => { code: number; stderr: string };
  log?: (msg: string) => void;
  errLog?: (msg: string) => void;
  contextOverrides?: Partial<OrchestratorContext>;
}

export function runHarness(
  opts: { planDirName: string; push: boolean },
  deps: RunHarnessDeps = {}
): number {
  const repoRoot = deps.repoRoot ?? process.cwd();
  const log = deps.log ?? ((m: string) => console.log(m));
  const errLog = deps.errLog ?? ((m: string) => console.error(m));

  const docsPlanDir = join(repoRoot, 'docs', opts.planDirName);
  const phaseIndexPath = join(docsPlanDir, 'phases', 'index.json');
  const plansIndexPath = join(repoRoot, 'docs', 'plans-index.json');

  if (!existsSync(phaseIndexPath)) {
    errLog(
      `ERROR: phases/index.json not found at ${phaseIndexPath}. Did you run /harness first?`
    );
    return 1;
  }

  let capturedExit: number | null = null;
  const ctx: OrchestratorContext = {
    repoRoot,
    planDirName: opts.planDirName,
    phaseIndexPath,
    plansIndexPath,
    stepFilePath: (n) => join(docsPlanDir, 'phases', `step${n}.md`),
    stepOutputPath: (n) => join(docsPlanDir, 'phases', `step${n}-output.json`),
    project: PROJECT,
    phaseName: opts.planDirName,
    maxRetries: DEFAULT_MAX_RETRIES,
    claudeTimeoutMs: DEFAULT_CLAUDE_TIMEOUT_MS,
    claudeInvoke: invokeClaude,
    verifyAc: runACCommands,
    parseAc: parseACFromStep,
    nowIso: () => new Date().toISOString(),
    twoStageCommit,
    checkoutBranch,
    commitStaged,
    addAll: (cwd) => {
      runGit(['add', '-A'], cwd);
    },
    exit: (code) => {
      if (capturedExit === null) capturedExit = code;
    },
    log,
    ...(deps.contextOverrides ?? {}),
  };

  executeAllSteps(ctx);

  if (capturedExit !== null) return capturedExit;

  if (opts.push) {
    const branch = `feat-${opts.planDirName}`;
    const pusher =
      deps.pushBranch ??
      ((b: string, cwd: string) => {
        const r = runGit(['push', '-u', 'origin', b], cwd);
        return { code: r.code, stderr: r.stderr };
      });
    const result = pusher(branch, repoRoot);
    if (result.code !== 0) {
      errLog(`git push failed: ${result.stderr}`);
      return 1;
    }
    log(`pushed ${branch}`);
  }

  return 0;
}

function resolveRepoRootFromThisFile(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', '..', '..');
}

const isCli = process.argv[1]
  ? resolve(process.argv[1]) === fileURLToPath(import.meta.url)
  : false;

if (isCli) {
  try {
    const parsed = parseArgv(process.argv.slice(2));
    const code = runHarness(parsed, {
      repoRoot: resolveRepoRootFromThisFile(),
    });
    process.exit(code);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}
