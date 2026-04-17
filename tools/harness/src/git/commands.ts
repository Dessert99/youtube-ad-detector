import { spawnSync } from 'node:child_process';

export interface GitResult {
  code: number;
  stdout: string;
  stderr: string;
}

export function runGit(args: string[], cwd: string): GitResult {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  return {
    code: r.status ?? -1,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
  };
}

function branchExists(name: string, cwd: string): boolean {
  const r = runGit(['rev-parse', '--verify', `refs/heads/${name}`], cwd);
  return r.code === 0;
}

function currentBranch(cwd: string): string {
  const r = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
  if (r.code !== 0) {
    throw new Error(`git rev-parse failed: ${r.stderr}`);
  }
  return r.stdout.trim();
}

export function checkoutBranch(name: string, cwd: string): void {
  if (currentBranch(cwd) === name) return;
  const args = branchExists(name, cwd)
    ? ['checkout', name]
    : ['checkout', '-b', name];
  const r = runGit(args, cwd);
  if (r.code !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  }
}

function hasStagedChanges(cwd: string): boolean {
  const r = runGit(['diff', '--cached', '--quiet'], cwd);
  return r.code === 1;
}

export function commitStaged(message: string, cwd: string): GitResult | null {
  if (!hasStagedChanges(cwd)) return null;
  const r = runGit(['commit', '-m', message], cwd);
  if (r.code !== 0) {
    throw new Error(`git commit failed: ${r.stderr}`);
  }
  return r;
}

export function twoStageCommit(opts: {
  cwd: string;
  featMessage: string;
  choreMessage: string;
  excludeFromFeat: string[];
}): { feat: GitResult | null; chore: GitResult | null } {
  const { cwd, featMessage, choreMessage, excludeFromFeat } = opts;

  runGit(['add', '-A'], cwd);
  for (const p of excludeFromFeat) {
    runGit(['reset', 'HEAD', '--', p], cwd);
  }
  const feat = commitStaged(featMessage, cwd);

  runGit(['add', '-A'], cwd);
  const chore = commitStaged(choreMessage, cwd);

  return { feat, chore };
}
