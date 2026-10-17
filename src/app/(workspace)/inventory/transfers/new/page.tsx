import { TransferStockForm } from '@/features/inventory/components/TransferStockForm';
import { PageHeader } from '@/components/ui/page-header';
import { ButtonLink } from '@/components/ui/button-link';
import '@/features/inventory/components/inventory-forms.css';
export default function Page() { return <div className="page-stack inventory-form-page"><PageHeader title="Transfer stock" description="Move stock between storage or production locations." actions={<ButtonLink href="/inventory">Back to inventory</ButtonLink>}/><TransferStockForm/></div>; }
