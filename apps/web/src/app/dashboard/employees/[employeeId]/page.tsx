'use client';

import { useParams } from 'next/navigation';
import OwnerEmployeeDetail from '../../components/OwnerEmployeeDetail';

export default function EmployeeDetailPage() {
  const { employeeId } = useParams<{ employeeId: string }>();
  return <OwnerEmployeeDetail employeeId={employeeId} />;
}
