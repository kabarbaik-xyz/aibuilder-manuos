import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { IntakeWorkbench } from '@/features/intake/IntakeWorkbench';

export const metadata = { title: 'RFQ intake | ManuOS' };

export default function RFQIntakePage() {
  return (
    <div className="page-stack">
      <PageHeader title="RFQ intake" description="Extract and review pasted RFQ text, save the reviewed fields, then hand them to a new order draft. Document uploads and line-level citations are not available yet." actions={<Link href="/orders" className="btn soft">Back to orders</Link>} />
      <IntakeWorkbench />
    </div>
  );
}
