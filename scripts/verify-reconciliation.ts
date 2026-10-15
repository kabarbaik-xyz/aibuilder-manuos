import { PrismaClient } from '@prisma/client';
import { reconcileStock } from '../src/server/modules/inventory/ledger';

const prisma = new PrismaClient();

export async function runReconciliation(targetWorkspaceId?: string): Promise<boolean> {
  try {
    const workspaces = targetWorkspaceId
      ? await prisma.workspace.findMany({ where: { id: targetWorkspaceId } })
      : await prisma.workspace.findMany();

    if (workspaces.length === 0) {
      console.log('No workspaces found for reconciliation.');
      return true;
    }

    let allBalanced = true;

    for (const ws of workspaces) {
      const result = await reconcileStock(prisma, ws.id);
      console.log(`\n========================================`);
      console.log(`Reconciliation Report for Workspace: ${ws.name} (${ws.code}) [${ws.id}]`);
      console.log(`Total Movements: ${result.totalMovements}`);
      console.log(`Total Buckets:   ${result.totalBuckets}`);
      console.log(`Balanced:        ${result.balanced ? '✓ YES' : '✗ NO (MISMATCH DETECTED)'}`);

      if (!result.balanced) {
        allBalanced = false;
        console.error(`\nMismatches:`);
        for (const m of result.mismatches) {
          console.error(
            ` - Bucket: ${m.bucketKey} | Projected: ${m.projectedOnHand.toString()} | Calculated: ${m.calculatedOnHand.toString()} | Delta: ${m.delta.toString()}`
          );
        }
      }
      console.log(`========================================\n`);
    }

    return allBalanced;
  } catch (error) {
    console.error('Error during reconciliation:', error);
    return false;
  } finally {
    await prisma.$disconnect();
  }
}

// If run directly from CLI
if (require.main === module || process.argv[1]?.includes('verify-reconciliation')) {
  const targetId = process.argv[2];
  runReconciliation(targetId).then((success) => {
    if (!success) {
      process.exit(1);
    }
  });
}
