export interface QualityLifecycleInspection {
  status: string;
  reworkAtoms: bigint;
  reinspectedAtoms: bigint;
  openReworkAttempts: number;
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
