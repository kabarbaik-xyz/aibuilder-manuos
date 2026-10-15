import { InspectionDetailView } from '@/features/quality/components/InspectionDetailView';

export default async function QualityInspectionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <InspectionDetailView inspectionId={id} />;
}
