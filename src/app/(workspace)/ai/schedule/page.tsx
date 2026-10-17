import Link from 'next/link';
import { PageHeader } from '@/components/ui/page-header';
import { Panel } from '@/components/ui/panel';
import { ScheduleProposalWorkbench } from '@/features/planning/components/ScheduleProposalWorkbench';

export const metadata = { title: 'Build a production schedule | ManuOS' };

export default function Page() {
  return <div className="page-stack"><PageHeader title="Build a production schedule" description="Choose a released job, review proposed task times and resources, then explicitly apply the reviewed schedule." actions={<Link href="/ai" className="btn soft">Back to CoreAI</Link>} /><Panel className="p-5"><ScheduleProposalWorkbench initialOpen /></Panel></div>;
}
