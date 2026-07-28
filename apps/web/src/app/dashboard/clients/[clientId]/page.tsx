'use client';

import { useParams } from 'next/navigation';
import ClientPortalAdministration from '../../components/ClientPortalAdministration';

export default function ClientDetailPage() {
  const { clientId } = useParams<{ clientId: string }>();
  return <ClientPortalAdministration clientId={clientId} />;
}
