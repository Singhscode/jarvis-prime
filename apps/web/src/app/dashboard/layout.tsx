import OwnerSessionBoundary from './components/OwnerSessionBoundary';
import OwnerWorkspaceShell from './components/OwnerWorkspaceShell';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <OwnerSessionBoundary><OwnerWorkspaceShell>{children}</OwnerWorkspaceShell></OwnerSessionBoundary>;
}
