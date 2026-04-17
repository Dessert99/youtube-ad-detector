import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseACFromStep, runACCommands } from '../../src/verify/ac.js';

function writeStepMd(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'harness-ac-'));
  const path = join(dir, 'stepX.md');
  writeFileSync(path, contents, 'utf8');
  return path;
}

describe('parseACFromStep', () => {
  it('extracts commands from the first bash fence under Acceptance Criteria', () => {
    const md = `# title

## Acceptance Criteria

\`\`\`bash
echo a
echo b
\`\`\`
`;
    expect(parseACFromStep(writeStepMd(md))).toEqual(['echo a', 'echo b']);
  });

  it('ignores earlier bash fences in other sections', () => {
    const md = `# title

## Other

\`\`\`bash
echo skip
\`\`\`

## Acceptance Criteria

\`\`\`bash
echo a
\`\`\`
`;
    expect(parseACFromStep(writeStepMd(md))).toEqual(['echo a']);
  });

  it('skips comment lines and blank lines', () => {
    const md = `## Acceptance Criteria

\`\`\`bash
# this is a comment
echo a

echo b
\`\`\`
`;
    expect(parseACFromStep(writeStepMd(md))).toEqual(['echo a', 'echo b']);
  });

  it('returns [] when the section is missing', () => {
    const md = `# some doc

no AC here.
`;
    expect(parseACFromStep(writeStepMd(md))).toEqual([]);
  });
});

describe('runACCommands', () => {
  it('returns ok=true when every command succeeds', () => {
    const dir = mkdtempSync(join(tmpdir(), 'harness-ac-run-'));
    const r = runACCommands(['true'], dir);
    expect(r.ok).toBe(true);
    expect(r.executed).toEqual(['true']);
  });

  it('stops at the first failing command', () => {
    const dir = mkdtempSync(join(tmpdir(), 'harness-ac-run-'));
    const r = runACCommands(['true', 'false', 'true'], dir);
    expect(r.ok).toBe(false);
    expect(r.executed).toEqual(['true', 'false']);
    expect(r.failedCommand).toBe('false');
    expect(r.failedExitCode).toBe(1);
  });

  it('evaluates shell features like pipes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'harness-ac-run-'));
    const r = runACCommands(['echo hello | cat'], dir);
    expect(r.ok).toBe(true);
  });

  it('captures stderr of a failing command', () => {
    const dir = mkdtempSync(join(tmpdir(), 'harness-ac-run-'));
    const r = runACCommands(['echo boom >&2 && exit 1'], dir);
    expect(r.ok).toBe(false);
    expect(r.failedStderr).toContain('boom');
  });
});
