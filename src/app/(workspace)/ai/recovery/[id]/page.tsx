import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { RecoveryProposalDetail } from '@/features/intelligence/components/RecoveryProposalDetail';

export const metadata = { title: 'Recovery proposal | ManuOS' };

export default async function RecoveryProposalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <div className="page-stack"><PageHeader title="Recovery proposal" description="Review the saved simulation and its source order." actions={<Link href="/ai/recovery" className="btn">Back to proposals</Link>} /><RecoveryProposalDetail id={id} /></div>;
}
