import { IssueMaterialForm } from '@/features/inventory/components/IssueMaterialForm';
import { PageHeader } from '@/components/ui/page-header';
import { ButtonLink } from '@/components/ui/button-link';
import '@/features/inventory/components/inventory-forms.css';
export default function Page() { return <div className="page-stack inventory-form-page"><PageHeader title="Issue material to production" description="Move material from storage to an active production order." actions={<ButtonLink href="/inventory">Back to inventory</ButtonLink>}/><IssueMaterialForm/></div>; }
