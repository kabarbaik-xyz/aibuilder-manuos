import { runReconciliation } from './verify-reconciliation';

const targetId = process.argv[2];
runReconciliation(targetId).then((success) => {
  if (!success) {
    process.exit(1);
  }
});
