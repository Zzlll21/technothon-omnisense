import type { CoolingMode, OccupancyState, OutputSetting } from './types.js';
/** Versioned constants shared by evaluation and generated SQL validation. */
export const COOLING_POLICY = Object.freeze({ version: 'omnisense-cooling-v1', confirmation_ms: 300_000,
  long_vacancy_ms: 1_200_000, precool_gap_ms: 1_800_000,
  outputs: { OCCUPIED: { fan: 'AUTO', setpoint_c: 24.5 }, SHORT_VACANCY: { fan: 'LOW', setpoint_c: 27 },
    LONG_VACANCY: { fan: 'OFF', setpoint_c: null }, PRECOOL: { fan: 'HIGH', setpoint_c: 24.5 } } as const });
export function coolingPolicy(at: number, occupancy: OccupancyState, vacantSince: number | null,
  forecast: { next_use_at: number; planned_restart_at: number } | null) {
  if (!Number.isFinite(at) || !['OCCUPIED','VACANT','UNCERTAIN'].includes(occupancy) ||
    (vacantSince !== null && (!Number.isFinite(vacantSince) || vacantSince > at)) ||
    (forecast && (!Number.isFinite(forecast.next_use_at) || !Number.isFinite(forecast.planned_restart_at) || forecast.planned_restart_at > forecast.next_use_at))) throw new Error('Invalid cooling policy input');
  const elapsed = vacantSince === null ? 0 : at - vacantSince;
  let mode: CoolingMode = 'OCCUPIED';
  if (occupancy === 'VACANT' && vacantSince !== null && elapsed >= COOLING_POLICY.confirmation_ms) {
    mode = forecast && forecast.next_use_at - vacantSince >= COOLING_POLICY.precool_gap_ms && at >= forecast.planned_restart_at && at < forecast.next_use_at ? 'PRECOOL'
      : elapsed >= COOLING_POLICY.long_vacancy_ms ? 'LONG_VACANCY' : 'SHORT_VACANCY';
  }
  return { mode, output: { ...COOLING_POLICY.outputs[mode] } as OutputSetting,
    vacancy_confirmed_at: occupancy === 'VACANT' && vacantSince !== null && elapsed >= COOLING_POLICY.confirmation_ms ? new Date(vacantSince + COOLING_POLICY.confirmation_ms).toISOString() : null };
}
