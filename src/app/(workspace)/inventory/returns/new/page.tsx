import { ReturnMaterialForm } from '@/features/inventory/components/ReturnMaterialForm';
import { PageHeader } from '@/components/ui/page-header';
import { ButtonLink } from '@/components/ui/button-link';
import '@/features/inventory/components/inventory-forms.css';
export default function Page() { return <div className="page-stack inventory-form-page"><PageHeader title="Return unused material" description="Move unused production material back into storage." actions={<ButtonLink href="/inventory">Back to inventory</ButtonLink>}/><ReturnMaterialForm/></div>; }
