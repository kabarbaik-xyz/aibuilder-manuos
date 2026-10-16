type StartReadinessInput = {
  hasTechnician: boolean;
  blockingIssueTitles: string[];
  predecessors: Array<{ nodeKey: string; status: string }>;
  materialDemands: Array<{
    itemCode: string;
    requiredAtoms: bigint;
    issuedAtoms: bigint;
    reservedAtoms: bigint;
    availableInWarehouseAtoms: bigint;
  }>;
};

export function getKnownTaskStartBlockReasons(input: StartReadinessInput): string[] {
  const reasons: string[] = [];

  if (!input.hasTechnician) {
    reasons.push('Belum ada teknisi yang ditetapkan untuk sesi kerja.');
  }

  for (const title of input.blockingIssueTitles) {
    reasons.push(`Selesaikan blocker: ${title}.`);
  }

  for (const predecessor of input.predecessors) {
    if (predecessor.status !== 'COMPLETED') {
      reasons.push(`Operasi sebelumnya ${predecessor.nodeKey} belum selesai (${predecessor.status}).`);
    }
  }

  for (const demand of input.materialDemands) {
    const coveredAtoms = demand.issuedAtoms + demand.reservedAtoms + demand.availableInWarehouseAtoms;
    if (coveredAtoms < demand.requiredAtoms) {
      reasons.push(
        `${demand.itemCode} kurang ${demand.requiredAtoms - coveredAtoms} atom dari kebutuhan operasi.`
      );
    }
  }

  return reasons;
}
