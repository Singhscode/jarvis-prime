import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ClientWorkspace from './ClientWorkspace';

const snapshot = {
  client: { id: 'client-1', name: 'Acme' },
  projects: [{ id: 'project-1', name: 'Launch' }],
  tasks: [{ id: 'task-1', project_id: 'project-1', name: 'Review', completed: false }],
  documents: [{ id: 'document-1', project_id: 'project-1', title: 'Delivery', document_type: 'deliverable', created_at: '2026-07-18T00:00:00.000Z' }],
};

afterEach(cleanup);

describe('ClientWorkspace', () => {
  it('exposes accessible loading, error, empty, and responsive recovery states', () => {
    const { rerender } = render(<ClientWorkspace snapshot={null} loading error="" onRefresh={vi.fn()} onLogout={vi.fn()} onDocumentDownload={vi.fn()} />);
    expect(screen.getByRole('main').getAttribute('aria-busy')).toBe('true');
    rerender(<ClientWorkspace snapshot={null} loading={false} error="Unable to load." onRefresh={vi.fn()} onLogout={vi.fn()} onDocumentDownload={vi.fn()} />);
    expect(screen.getByRole('alert').textContent).toContain('Unable to load.');
    expect(screen.getByRole('button', { name: 'Refresh workspace' })).toBeTruthy();
    rerender(<ClientWorkspace snapshot={{ ...snapshot, projects: [], tasks: [], documents: [] }} loading={false} error="" onRefresh={vi.fn()} onLogout={vi.fn()} onDocumentDownload={vi.fn()} />);
    expect(screen.getByText('Nothing is available yet')).toBeTruthy();
    expect(screen.getByRole('main').className).toContain('min-h-screen');
  });

  it('supports named keyboard controls and on-demand document download', async () => {
    const user = userEvent.setup();
    const refresh = vi.fn();
    const logout = vi.fn();
    const download = vi.fn().mockResolvedValue(undefined);
    render(<ClientWorkspace snapshot={snapshot} loading={false} error="" onRefresh={refresh} onLogout={logout} onDocumentDownload={download} />);
    const refreshButton = screen.getByRole('button', { name: 'Refresh' });
    refreshButton.focus();
    await user.keyboard('{Enter}');
    expect(refresh).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: 'Download' }));
    expect(download).toHaveBeenCalledWith('document-1');
    await user.click(screen.getByRole('button', { name: 'Log out' }));
    expect(logout).toHaveBeenCalledOnce();
    expect(screen.getByText('Workspace up to date')).toBeTruthy();
  });
});
