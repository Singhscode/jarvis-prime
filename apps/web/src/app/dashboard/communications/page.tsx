'use client';

import CommunicationWorkspace from '@/components/communications/CommunicationWorkspace';
import { useOwnerWorkspace } from '../components/OwnerSessionBoundary';

export default function OwnerCommunicationsPage() {
  const { request } = useOwnerWorkspace();
  return <CommunicationWorkspace request={request} role="owner" heading="Communications" description="Participant-scoped conversations with your active employees and Client Portal users." />;
}
