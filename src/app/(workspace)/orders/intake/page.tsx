import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { IntakeWorkbench } from '@/features/intake/IntakeWorkbench';

export const metadata = { title: 'RFQ intake | ManuOS' };

export default function RFQIntakePage() {
  return (
    <div className="page-stack">
      <PageHeader title="RFQ intake" description="Turn a customer request into reviewed order details. Paste text or upload a TXT/CSV file to get started." actions={<Link href="/orders" className="btn soft">Back to orders</Link>} />
      <IntakeWorkbench />
    </div>
  );
}
