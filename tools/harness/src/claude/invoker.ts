import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { writeJson } from '../state/io.js';

export interface ClaudeResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface InvokeOptions {
  prompt: string;
  cwd: string;
  timeoutMs: number;
  outputPath: string;
  claudeBin?: string;
  claudeArgs?: string[];
}

const DEFAULT_ARGS = [
  '-p',
  '--dangerously-skip-permissions',
  '--output-format',
  'json',
];

export function invokeClaude(opts: InvokeOptions): ClaudeResult {
  const {
    prompt,
    cwd,
    timeoutMs,
    outputPath,
    claudeBin = 'claude',
    claudeArgs = DEFAULT_ARGS,
  } = opts;

  mkdirSync(dirname(outputPath), { recursive: true });

  const started = Date.now();
  const r = spawnSync(claudeBin, [...claudeArgs, prompt], {
    cwd,
    encoding: 'utf8',
    timeout: timeoutMs,
    maxBuffer: 10_000_000,
  });
  const durationMs = Date.now() - started;

  const result: ClaudeResult = {
    exitCode: r.status,
    stdout: r.stdout ?? '',
    stderr: r.stderr ?? '',
    durationMs,
  };

  writeJson(outputPath, result);
  return result;
}
