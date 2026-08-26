import { PortalSessionBoundary } from '../components/PortalSessionBoundary';

export default function EmployeeLayout({ children }: { children: React.ReactNode }) {
  return <PortalSessionBoundary portalName="Employee Portal">{children}</PortalSessionBoundary>;
}
