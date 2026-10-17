import { PersonDetail } from '@/features/access/person-detail';
export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <PersonDetail technicianId={(await params).id} />; }
