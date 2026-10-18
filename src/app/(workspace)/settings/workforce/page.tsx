import { PageHeader } from '@/components/ui/page-header';
import { OvertimeControls } from '@/features/planning/components/OvertimeControls';

export const metadata = {
  title: 'Workforce & Overtime | ManuOS',
  description: 'Manage workspace overtime limits and review requests awaiting your approval.',
};

export default function WorkforceSettingsPage() {
  return (
    <div className="page-stack">
      <PageHeader
        title="Workforce & overtime"
        description="Set workspace overtime limits and review requests assigned to you. Shift planning stays in Production Planning."
      />
      <OvertimeControls />
    </div>
  );
}
