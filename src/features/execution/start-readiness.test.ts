import { describe, expect, it } from 'vitest';
import { getKnownTaskStartBlockReasons } from './start-readiness';

describe('getKnownTaskStartBlockReasons', () => {
  const readyInput = {
    hasTechnician: true,
    blockingIssueTitles: [] as string[],
    predecessors: [] as Array<{ nodeKey: string; status: string }>,
    materialDemands: [] as Array<{
      itemCode: string;
      requiredAtoms: bigint;
      issuedAtoms: bigint;
      reservedAtoms: bigint;
      availableInWarehouseAtoms: bigint;
    }>,
  };

  it('reports every known reason that prevents starting the task', () => {
    expect(getKnownTaskStartBlockReasons({
      ...readyInput,
      hasTechnician: false,
      blockingIssueTitles: ['Motor panas'],
      predecessors: [{ nodeKey: 'OP-10', status: 'RUNNING' }],
      materialDemands: [{
        itemCode: 'RAW-01', requiredAtoms: 10n, issuedAtoms: 2n, reservedAtoms: 3n, availableInWarehouseAtoms: 1n,
      }],
    })).toEqual([
      'No technician assigned for the work session.',
      'Resolve blocker: Motor panas.',
      'Predecessor operation OP-10 not yet complete (RUNNING).',
      'RAW-01 short 4 atoms from operation requirement.',
    ]);
  });

  it('allows start when all locally visible prerequisites are covered', () => {
    expect(getKnownTaskStartBlockReasons({
      ...readyInput,
      materialDemands: [{
        itemCode: 'RAW-01', requiredAtoms: 10n, issuedAtoms: 2n, reservedAtoms: 3n, availableInWarehouseAtoms: 5n,
      }],
    })).toEqual([]);
  });
});
