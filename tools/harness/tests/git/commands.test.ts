import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  checkoutBranch,
  commitStaged,
  runGit,
  twoStageCommit,
} from '../../src/git/commands.js';

const GIT_ENV = {
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
};

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'harness-git-'));
  spawnSync('git', ['init', '-b', 'main'], { cwd: dir });
  spawnSync('git', ['config', 'user.email', 'test@example.com'], { cwd: dir });
  spawnSync('git', ['config', 'user.name', 'test'], { cwd: dir });
  spawnSync('git', ['config', 'commit.gpgsign', 'false'], { cwd: dir });
  writeFileSync(join(dir, 'seed.txt'), 'seed\n');
  spawnSync('git', ['add', '-A'], { cwd: dir });
  spawnSync('git', ['commit', '-m', 'seed'], {
    cwd: dir,
    env: { ...process.env, ...GIT_ENV },
  });
  return dir;
}

function logOneline(cwd: string): string {
  const r = spawnSync('git', ['log', '--oneline'], { cwd, encoding: 'utf8' });
  return r.stdout;
}

describe('runGit', () => {
  it('runs a read-only command and returns code=0', () => {
    const dir = makeRepo();
    const r = runGit(['rev-parse', '--is-inside-work-tree'], dir);
    expect(r.code).toBe(0);
    expect(r.stdout.trim()).toBe('true');
  });
});

describe('checkoutBranch', () => {
  let dir: string;
  beforeEach(() => {
    dir = makeRepo();
  });

  it('creates and moves to a new branch', () => {
    checkoutBranch('test-1', dir);
    const r = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], dir);
    expect(r.stdout.trim()).toBe('test-1');
  });

  it('is a no-op when already on the branch', () => {
    checkoutBranch('test-1', dir);
    expect(() => checkoutBranch('test-1', dir)).not.toThrow();
  });

  it('checks out an existing branch instead of creating', () => {
    checkoutBranch('test-1', dir);
    checkoutBranch('main', dir);
    checkoutBranch('test-1', dir);
    const r = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], dir);
    expect(r.stdout.trim()).toBe('test-1');
  });
});

describe('commitStaged', () => {
  it('returns null when nothing is staged', () => {
    const dir = makeRepo();
    expect(commitStaged('msg', dir)).toBeNull();
  });

  it('creates a commit when files are staged', () => {
    const dir = makeRepo();
    writeFileSync(join(dir, 'a.txt'), 'hello\n');
    spawnSync('git', ['add', '-A'], { cwd: dir });
    const original = { ...process.env };
    try {
      Object.assign(process.env, GIT_ENV);
      const r = commitStaged('chore: test', dir);
      expect(r).not.toBeNull();
    } finally {
      for (const k of Object.keys(GIT_ENV))
        delete (process.env as Record<string, string | undefined>)[k];
      Object.assign(process.env, original);
    }
    expect(logOneline(dir)).toContain('chore: test');
  });
});

describe('twoStageCommit', () => {
  function withGitEnv<T>(fn: () => T): T {
    const original = { ...process.env };
    Object.assign(process.env, GIT_ENV);
    try {
      return fn();
    } finally {
      for (const k of Object.keys(GIT_ENV))
        delete (process.env as Record<string, string | undefined>)[k];
      Object.assign(process.env, original);
    }
  }

  it('splits code changes and excluded files into two commits', () => {
    const dir = makeRepo();
    writeFileSync(join(dir, 'code.ts'), 'x\n');
    writeFileSync(join(dir, 'meta.json'), '{}\n');

    const { feat, chore } = withGitEnv(() =>
      twoStageCommit({
        cwd: dir,
        featMessage: 'feat: add code',
        choreMessage: 'chore: add meta',
        excludeFromFeat: ['meta.json'],
      })
    );

    expect(feat).not.toBeNull();
    expect(chore).not.toBeNull();
    const log = logOneline(dir);
    expect(log).toContain('feat: add code');
    expect(log).toContain('chore: add meta');
  });

  it('returns feat=null when only excluded files changed', () => {
    const dir = makeRepo();
    writeFileSync(join(dir, 'meta.json'), '{}\n');

    const { feat, chore } = withGitEnv(() =>
      twoStageCommit({
        cwd: dir,
        featMessage: 'feat: none',
        choreMessage: 'chore: meta only',
        excludeFromFeat: ['meta.json'],
      })
    );

    expect(feat).toBeNull();
    expect(chore).not.toBeNull();
    expect(logOneline(dir)).toContain('chore: meta only');
  });
});
