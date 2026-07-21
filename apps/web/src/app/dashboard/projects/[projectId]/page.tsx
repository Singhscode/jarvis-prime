'use client';

import { useParams } from 'next/navigation';
import OwnerProjectDetail from '../../components/OwnerProjectDetail';

export default function ProjectDetailPage() {
  const { projectId } = useParams<{ projectId: string }>();
  return <OwnerProjectDetail projectId={projectId} />;
}
