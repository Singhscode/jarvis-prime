'use client';

import { useParams } from 'next/navigation';
import OwnerDocumentDetail from '../../components/OwnerDocumentDetail';

export default function DocumentDetailPage() {
  const { documentId } = useParams<{ documentId: string }>();
  return <OwnerDocumentDetail documentId={documentId} />;
}
