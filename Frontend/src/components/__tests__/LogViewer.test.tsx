import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LogViewer } from '../LogViewer';
import * as api from '../../services/api';
import { ToastProvider } from '../Toast';

// Mock the API service
vi.mock('../../services/api', () => ({
  fetchLogs: vi.fn(),
  clearLogs: vi.fn(),
}));

const renderWithToast = (ui: React.ReactNode) => {
  return render(<ToastProvider>{ui}</ToastProvider>);
};

describe('LogViewer Component - Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.fetchLogs as any).mockResolvedValue([]);
  });

  it('strips ANSI garbage codes from incoming logs', async () => {
    const dirtyLog = {
      timestamp: '2026-03-17 12:00:00',
      level: 'info',
      message: '\u001b[32m[INFO]\u001b[39m Connection established',
      type: 'Application',
      metadata: {}
    };
    (api.fetchLogs as any).mockResolvedValue([dirtyLog]);

    renderWithToast(<LogViewer />);

    await waitFor(() => {
      // The [INFO] text should remain, but the escape codes should be gone
      expect(screen.getByText(/Connection established/i)).toBeInTheDocument();
      expect(screen.queryByText(/\\u001b/i)).not.toBeInTheDocument();
    });
  });

  it('correctly handles directional indicators in messages', async () => {
    const outLog = {
      timestamp: '2026-03-17 12:00:01',
      level: 'info',
      message: 'Sending message ➡️ {"action": "BootNotification"}',
      type: 'Application',
      metadata: {}
    };
    (api.fetchLogs as any).mockResolvedValue([outLog]);

    renderWithToast(<LogViewer />);

    await waitFor(() => {
      expect(screen.getByText(/➡️OUT/i)).toBeInTheDocument();
      expect(screen.getByText(/{"action": "BootNotification"}/i)).toBeInTheDocument();
    });
  });

  it('shows "Buffer Full" warning when logs reach 100 entries', async () => {
    const manyLogs = Array(100).fill({
      timestamp: '2026-03-17 12:00:00',
      level: 'info',
      message: 'Log message',
      type: 'Application',
      metadata: {}
    });
    (api.fetchLogs as any).mockResolvedValue(manyLogs);

    renderWithToast(<LogViewer />);

    await waitFor(() => {
      expect(screen.getByText(/Buffer Full/i)).toBeInTheDocument();
    });
  });

  it('toggles auto-scroll mode', async () => {
    (api.fetchLogs as any).mockResolvedValue([]);
    renderWithToast(<LogViewer />);

    const toggleBtn = screen.getByText(/Auto-scroll: ON/i);
    fireEvent.click(toggleBtn);

    expect(screen.getByText(/Auto-scroll: OFF/i)).toBeInTheDocument();
  });

  it('handles log clearing and shows error toast on failure', async () => {
    (api.fetchLogs as any).mockResolvedValue([{
        timestamp: '2026-03-17 12:00:00',
        level: 'info',
        message: 'Existing log',
        type: 'Application',
        metadata: {}
    }]);
    (api.clearLogs as any).mockRejectedValue(new Error('Failed to reach server'));

    renderWithToast(<LogViewer />);

    await waitFor(() => {
        expect(screen.getByText(/Existing log/i)).toBeInTheDocument();
    });

    const clearBtn = screen.getByTitle(/Clear Terminal/i);
    fireEvent.click(clearBtn);

    await waitFor(() => {
        expect(screen.getByText(/Failed to clear terminal logs/i)).toBeInTheDocument();
    });
  });
});
