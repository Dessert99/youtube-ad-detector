import { describe, expect, it } from 'vitest';
import type {
  PhaseIndex,
  PlanEntry,
  PlansIndex,
  StepEntry,
  StepStatus,
} from '../../src/state/schema.js';

describe('state/schema types', () => {
  it('compiles and accepts a representative shape', () => {
    const status: StepStatus = 'pending';
    const step: StepEntry = { step: 0, name: 'x', status };
    const phase: PhaseIndex = {
      project: 'p',
      phase: 'ph',
      steps: [step],
    };
    const plan: PlanEntry = { dir: 'plan_x', status };
    const plans: PlansIndex = { plans: [plan] };
    expect(phase.steps[0].status).toBe('pending');
    expect(plans.plans[0].dir).toBe('plan_x');
  });
});
