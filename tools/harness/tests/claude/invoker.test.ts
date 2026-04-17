import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { invokeClaude } from '../../src/claude/invoker.js';
import { readJson } from '../../src/state/io.js';

function makeMockClaude(dir: string): string {
  const path = join(dir, 'mock-claude.sh');
  writeFileSync(
    path,
    `#!/bin/bash
echo "\${MOCK_STDOUT:-mock ok}"
echo "stderr content" >&2
exit "\${MOCK_EXIT_CODE:-0}"
`,
    'utf8'
  );
  chmodSync(path, 0o755);
  return path;
}

function makeSleepMock(dir: string): string {
  const path = join(dir, 'mock-sleep.sh');
  writeFileSync(path, `#!/bin/bash\nsleep 5\n`, 'utf8');
  chmodSync(path, 0o755);
  return path;
}

describe('invokeClaude', () => {
  it('records exitCode/stdout/stderr/durationMs on success', () => {
    const dir = mkdtempSync(join(tmpdir(), 'harness-invoker-'));
    const bin = makeMockClaude(dir);
    const outputPath = join(dir, 'nested', 'step0-output.json');

    const result = invokeClaude({
      prompt: 'hello',
      cwd: dir,
      timeoutMs: 10_000,
      outputPath,
      claudeBin: bin,
      claudeArgs: [],
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('mock ok');
    expect(result.stderr).toContain('stderr content');
    expect(result.durationMs).toBeGreaterThan(0);

    const persisted = readJson<{
      exitCode: number | null;
      stdout: string;
      stderr: string;
      durationMs: number;
    }>(outputPath);
    expect(persisted.exitCode).toBe(0);
    expect(persisted.stdout).toContain('mock ok');
    expect(persisted.stderr).toContain('stderr content');
    expect(persisted.durationMs).toBeGreaterThan(0);
  });

  it('does not throw on non-zero exit code', () => {
    const dir = mkdtempSync(join(tmpdir(), 'harness-invoker-'));
    const bin = makeMockClaude(dir);

    const original = process.env.MOCK_EXIT_CODE;
    process.env.MOCK_EXIT_CODE = '1';
    try {
      const result = invokeClaude({
        prompt: 'fail me',
        cwd: dir,
        timeoutMs: 10_000,
        outputPath: join(dir, 'out.json'),
        claudeBin: bin,
        claudeArgs: [],
      });
      expect(result.exitCode).toBe(1);
    } finally {
      if (original === undefined) {
        delete process.env.MOCK_EXIT_CODE;
      } else {
        process.env.MOCK_EXIT_CODE = original;
      }
    }
  });

  it('terminates when timeout elapses before process completion', () => {
    const dir = mkdtempSync(join(tmpdir(), 'harness-invoker-'));
    const bin = makeSleepMock(dir);

    const result = invokeClaude({
      prompt: 'x',
      cwd: dir,
      timeoutMs: 200,
      outputPath: join(dir, 'out.json'),
      claudeBin: bin,
      claudeArgs: [],
    });

    expect(result.exitCode === null || result.exitCode !== 0).toBe(true);
  });
});
