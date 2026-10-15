import { PageHeader } from '@/components/ui/page-header';
import { SupplyOrderForm } from '@/features/supply/components/supply-order-form';
export default function NewSupplyOrderPage() {
  return <div className="page-stack"><PageHeader title="New supply order" description="Purchase materials from a supplier and set the expected delivery date." /><SupplyOrderForm /></div>;
}
