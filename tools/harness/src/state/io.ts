import { readFileSync, writeFileSync } from 'node:fs';
import type {
  PhaseIndex,
  PlanEntry,
  PlansIndex,
  StepEntry,
  StepStatus,
} from './schema.js';

export function readJson<T>(path: string): T {
  const raw = readFileSync(path, 'utf8');
  return JSON.parse(raw) as T;
}

export function writeJson(path: string, data: unknown): void {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export function readPhaseIndex(path: string): PhaseIndex {
  return readJson<PhaseIndex>(path);
}

export function writePhaseIndex(path: string, idx: PhaseIndex): void {
  writeJson(path, idx);
}

export function readPlansIndex(path: string): PlansIndex {
  return readJson<PlansIndex>(path);
}

export function writePlansIndex(path: string, idx: PlansIndex): void {
  writeJson(path, idx);
}

export function updateStep(
  phaseIndexPath: string,
  stepNum: number,
  patch: Partial<StepEntry>
): PhaseIndex {
  const idx = readPhaseIndex(phaseIndexPath);
  const target = idx.steps.find((s) => s.step === stepNum);
  if (!target) {
    throw new Error(`step ${stepNum} not found in ${phaseIndexPath}`);
  }
  const bag = target as unknown as Record<string, unknown>;
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined) {
      delete bag[k];
    } else {
      bag[k] = v;
    }
  }
  writePhaseIndex(phaseIndexPath, idx);
  return idx;
}

const STATUS_TO_TIMESTAMP_KEY: Partial<Record<StepStatus, keyof PlanEntry>> = {
  completed: 'completed_at',
  error: 'failed_at',
  blocked: 'blocked_at',
};

export function upsertPlanStatus(
  plansIndexPath: string,
  dir: string,
  status: StepStatus,
  timestamp?: string
): PlansIndex {
  const idx = readPlansIndex(plansIndexPath);
  let entry = idx.plans.find((p) => p.dir === dir);
  if (!entry) {
    entry = { dir, status };
    idx.plans.push(entry);
  } else {
    entry.status = status;
  }
  if (timestamp) {
    const tsKey = STATUS_TO_TIMESTAMP_KEY[status];
    if (tsKey) {
      (entry as unknown as Record<string, unknown>)[tsKey] = timestamp;
    }
  }
  writePlansIndex(plansIndexPath, idx);
  return idx;
}
