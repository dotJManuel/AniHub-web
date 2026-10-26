import type { Status } from '../types';

// Dado progreso nuevo y total, decide el estado canónico objetivo:
//  - total alcanzado -> COMPLETED; avanzaste algo -> WATCHING; 0 -> PLANNING.
export function computeStatus(progress: number, total: number): Status {
  if (total && progress >= total) return 'COMPLETED';
  if (progress > 0) return 'WATCHING';
  return 'PLANNING';
}
