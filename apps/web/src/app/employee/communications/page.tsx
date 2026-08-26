'use client';

import CommunicationWorkspace from '@/components/communications/CommunicationWorkspace';
import { PortalSignIn, usePortalSession } from '../../components/PortalSessionBoundary';

export default function EmployeeCommunicationsPage() {
  const { request, needsLogin } = usePortalSession();
  if (needsLogin) return <PortalSignIn label="Employee Portal" description="Sign in to access your participant-scoped conversations." />;
  return <CommunicationWorkspace request={request} role="employee" heading="Communications" description="Read and reply only in conversations where you remain an active participant." />;
}
