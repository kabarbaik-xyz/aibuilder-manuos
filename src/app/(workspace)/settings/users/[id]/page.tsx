import { PersonDetail } from '@/features/access/person-detail';
export default async function Page({ params }: { params: Promise<{ id: string }> }) { return <PersonDetail membershipId={(await params).id} />; }
