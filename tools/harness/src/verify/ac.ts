import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export interface ACVerifyResult {
  ok: boolean;
  executed: string[];
  failedCommand?: string;
  failedExitCode?: number;
  failedStdout?: string;
  failedStderr?: string;
}

const AC_TIMEOUT_MS = 300_000;

export function parseACFromStep(stepMarkdownPath: string): string[] {
  const text = readFileSync(stepMarkdownPath, 'utf8');
  const lines = text.split(/\r?\n/);
  const cmds: string[] = [];

  let inTargetSection = false;
  let inBashFence = false;
  let fenceConsumed = false;

  for (const line of lines) {
    if (!inTargetSection) {
      if (/^##\s+Acceptance Criteria\s*$/.test(line)) {
        inTargetSection = true;
      }
      continue;
    }

    if (!inBashFence) {
      if (fenceConsumed) {
        if (/^##\s/.test(line)) break;
        continue;
      }
      if (/^```bash\s*$/.test(line)) {
        inBashFence = true;
      } else if (/^##\s/.test(line)) {
        break;
      }
      continue;
    }

    if (/^```\s*$/.test(line)) {
      inBashFence = false;
      fenceConsumed = true;
      break;
    }

    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    if (trimmed.startsWith('#')) continue;
    cmds.push(trimmed);
  }

  return cmds;
}

export function runACCommands(cmds: string[], cwd: string): ACVerifyResult {
  const executed: string[] = [];
  for (const cmd of cmds) {
    executed.push(cmd);
    const r = spawnSync('bash', ['-lc', cmd], {
      cwd,
      encoding: 'utf8',
      maxBuffer: 10_000_000,
      timeout: AC_TIMEOUT_MS,
    });
    const code = r.status ?? -1;
    if (code !== 0) {
      return {
        ok: false,
        executed,
        failedCommand: cmd,
        failedExitCode: code,
        failedStdout: r.stdout ?? '',
        failedStderr: r.stderr ?? '',
      };
    }
  }
  return { ok: true, executed };
}
