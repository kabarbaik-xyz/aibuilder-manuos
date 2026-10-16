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
      'Belum ada teknisi yang ditetapkan untuk sesi kerja.',
      'Selesaikan blocker: Motor panas.',
      'Operasi sebelumnya OP-10 belum selesai (RUNNING).',
      'RAW-01 kurang 4 atom dari kebutuhan operasi.',
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
