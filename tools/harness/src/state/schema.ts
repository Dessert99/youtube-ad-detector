export type StepStatus = 'pending' | 'completed' | 'error' | 'blocked';

export interface StepEntry {
  step: number;
  name: string;
  status: StepStatus;
  summary?: string;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
  failed_at?: string;
  blocked_reason?: string;
  blocked_at?: string;
}

export interface PhaseIndex {
  project: string;
  phase: string;
  created_at?: string;
  completed_at?: string;
  steps: StepEntry[];
}

export interface PlanEntry {
  dir: string;
  status: StepStatus;
  completed_at?: string;
  failed_at?: string;
  blocked_at?: string;
}

export interface PlansIndex {
  plans: PlanEntry[];
}
