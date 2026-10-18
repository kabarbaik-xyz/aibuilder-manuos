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
    reasons.push('No technician assigned for the work session.');
  }

  for (const title of input.blockingIssueTitles) {
    reasons.push(`Resolve blocker: ${title}.`);
  }

  for (const predecessor of input.predecessors) {
    if (predecessor.status !== 'COMPLETED') {
      reasons.push(`Predecessor operation ${predecessor.nodeKey} not yet complete (${predecessor.status}).`);
    }
  }

  for (const demand of input.materialDemands) {
    const coveredAtoms = demand.issuedAtoms + demand.reservedAtoms + demand.availableInWarehouseAtoms;
    if (coveredAtoms < demand.requiredAtoms) {
      reasons.push(
        `${demand.itemCode} short ${demand.requiredAtoms - coveredAtoms} atoms from operation requirement.`
      );
    }
  }

  return reasons;
}
