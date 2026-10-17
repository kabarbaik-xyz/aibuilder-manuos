import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { Panel } from '@/components/ui/panel';
import { PromiseModal } from '@/features/promise/promise-modal';
import { orderReturnHref } from '@/features/intelligence/memory-navigation';

export const metadata = { title: 'Check a delivery date | ManuOS' };

export default async function Page({ searchParams }: { searchParams: Promise<{ orderId?: string }> }) {
  const { orderId } = await searchParams;
  const returnHref = orderReturnHref(orderId);
  return <div className="page-stack"><PageHeader title="Check a delivery date" description="Select a released order and active job. Compare the full job quantity against a requested delivery date; the result does not change the customer commitment." actions={<Link href={returnHref ?? '/ai'} className="btn soft">{returnHref ? 'Back to order' : 'Back to CoreAI'}</Link>} /><Panel className="p-5"><PromiseModal initialOrderId={orderId} /></Panel></div>;
}
