'use client';

import CommunicationWorkspace from '@/components/communications/CommunicationWorkspace';
import { PortalSignIn, usePortalSession } from '../../components/PortalSessionBoundary';

export default function ClientCommunicationsPage() {
  const { request, needsLogin } = usePortalSession();
  if (needsLogin) return <PortalSignIn label="Client Portal" description="Sign in to access your participant-scoped conversations." />;
  return <CommunicationWorkspace request={request} role="client" heading="Communications" description="Read and reply only in conversations where your Client Portal access remains active." />;
}
