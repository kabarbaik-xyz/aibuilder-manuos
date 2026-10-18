export interface QualityLifecycleInspection {
  status: string;
  reworkAtoms: bigint;
  reinspectedAtoms: bigint;
  openReworkAttempts: number;
}

export type QualityLifecycleOutcome = 'PASSED' | 'PASSED_AFTER_REWORK' | 'PARTIAL' | 'REJECTED';

export interface QualityOutcomeInspection {
  status: string;
  passedAtoms: bigint;
  reworkAtoms: bigint;
  scrappedAtoms: bigint;
  reinspections: Array<{ status: string; passedAtoms: bigint; scrappedAtoms: bigint }>;
}

/** Returns true only when every output has a final inspection and no rework remains unsettled. */
export function isQualityLifecycleComplete(outputs: QualityLifecycleInspection[][]): boolean {
  if (outputs.length === 0 || outputs.some((inspections) => inspections.length === 0)) return false;

  return outputs.every((inspections) => inspections.every((inspection) =>
    inspection.status === 'FINALIZED'
    && inspection.reinspectedAtoms <= inspection.reworkAtoms
    && inspection.openReworkAttempts === 0
    && (inspection.reworkAtoms === 0n || inspection.reinspectedAtoms === inspection.reworkAtoms)
  ));
}

/** Derives one stable lifecycle route only after every root inspection and rework disposition is final. */
export function deriveQualityLifecycleOutcome(inspections: QualityOutcomeInspection[]): QualityLifecycleOutcome | null {
  if (inspections.length === 0 || inspections.some((inspection) => inspection.status !== 'FINALIZED')) return null;
  if (inspections.some((inspection) => {
    const reinspectedAtoms = inspection.reinspections.filter((item) => item.status === 'FINALIZED')
      .reduce((total, item) => total + item.passedAtoms + item.scrappedAtoms, 0n);
    return inspection.reinspections.some((item) => item.status !== 'FINALIZED') || reinspectedAtoms !== inspection.reworkAtoms;
  })) return null;

  const passedAtoms = inspections.reduce((total, inspection) => total + inspection.passedAtoms
    + inspection.reinspections.reduce((sum, item) => sum + item.passedAtoms, 0n), 0n);
  const scrappedAtoms = inspections.reduce((total, inspection) => total + inspection.scrappedAtoms
    + inspection.reinspections.reduce((sum, item) => sum + item.scrappedAtoms, 0n), 0n);
  if (scrappedAtoms > 0n) return passedAtoms > 0n ? 'PARTIAL' : 'REJECTED';
  return inspections.some((inspection) => inspection.reworkAtoms > 0n) ? 'PASSED_AFTER_REWORK' : 'PASSED';
}
