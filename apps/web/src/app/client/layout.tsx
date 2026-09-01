import { PortalSessionBoundary } from '../components/PortalSessionBoundary';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return <PortalSessionBoundary portalName="Client Portal">{children}</PortalSessionBoundary>;
}
