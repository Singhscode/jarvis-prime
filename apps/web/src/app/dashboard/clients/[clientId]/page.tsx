'use client';

import { useParams, useRouter } from 'next/navigation';
import ClientPortalAdministration from '../../components/ClientPortalAdministration';

export default function ClientDetailPage() {
  const { clientId } = useParams<{ clientId: string }>();
  const router = useRouter();
  return <ClientPortalAdministration clientId={clientId} onDeleted={() => { router.replace('/dashboard/clients?clientDeleted=1'); router.refresh(); }} />;
}
