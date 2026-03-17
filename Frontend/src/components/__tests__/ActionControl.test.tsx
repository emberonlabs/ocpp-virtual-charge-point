import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ActionControl } from '../ActionControl';
import * as api from '../../services/api';
import { ToastProvider } from '../Toast';

// Mock the API service
vi.mock('../../services/api', () => ({
  fetchStatus: vi.fn(),
  fetchActiveTransactions: vi.fn(),
  executeOcppAction: vi.fn(),
}));

const renderWithToast = (ui: React.ReactNode) => {
  return render(<ToastProvider>{ui}</ToastProvider>);
};

describe('ActionControl Component - Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.fetchStatus as any).mockResolvedValue({
      endpoint: 'ws://localhost:3000',
      chargePointId: '123456',
      isConnected: false
    });
    (api.fetchActiveTransactions as any).mockResolvedValue([]);
  });

  it('validates WS URL pattern correctly', async () => {
    renderWithToast(<ActionControl />);
    fireEvent.click(screen.getByText(/CMS Configuration/i));
    const wsInput = screen.getByLabelText(/Central System URL/i);
    fireEvent.change(wsInput, { target: { value: 'http://invalid.com' } });
    fireEvent.click(screen.getByText(/Save & Reconnect/i));
    expect(screen.getByText(/Invalid WebSocket URL/i)).toBeInTheDocument();
  });

  it('validates SOC range and logic (Target > Initial)', async () => {
    renderWithToast(<ActionControl />);
    fireEvent.click(screen.getByText(/Charge Point Controls/i));
    const initialInput = screen.getByLabelText(/Initial SOC/i);
    const targetInput = screen.getByLabelText(/Target SOC/i);
    fireEvent.change(initialInput, { target: { value: '80' } });
    fireEvent.change(targetInput, { target: { value: '20' } });
    fireEvent.click(screen.getByText(/Send Heartbeat/i));
    expect(screen.getByText(/Must be > 80% and <= 100%/i)).toBeInTheDocument();
  });

  it('shows loading spinner during API calls', async () => {
    (api.executeOcppAction as any).mockImplementation(() => new Promise(res => setTimeout(res, 100)));
    renderWithToast(<ActionControl />);
    const heartbeatBtn = screen.getByText(/Send Heartbeat/i);
    fireEvent.click(heartbeatBtn);
    expect(document.querySelector('.spinner')).toBeInTheDocument();
  });

  it('shows error toast when API fails', async () => {
    const errorMsg = 'Server is down';
    (api.executeOcppAction as any).mockRejectedValue({ message: errorMsg });
    
    renderWithToast(<ActionControl />);
    fireEvent.click(screen.getByText(/Send Heartbeat/i));
    
    await waitFor(() => {
      expect(screen.getByText(new RegExp(errorMsg, 'i'))).toBeInTheDocument();
    }, { timeout: 3000 });
  });

  it('enables "Stop Transaction" and shows current SOC when transaction is active', async () => {
    (api.fetchActiveTransactions as any).mockResolvedValue([{
      transactionId: 193,
      idTag: 'RFID001',
      connectorId: 1,
      meterValue: 5000,
      soc: 45.5,
      startedAt: new Date().toISOString()
    }]);

    renderWithToast(<ActionControl />);
    
    // We must expand the controls to see the SOC value (it's hidden when collapsed)
    fireEvent.click(screen.getByText(/Charge Point Controls/i));

    // Polling happens every 2s, waitFor handles the async update
    await waitFor(() => {
      expect(screen.getByTestId('current-soc-value')).toHaveTextContent('45.5%');
      expect(screen.getByText(/Stop Transaction/i).closest('button')).not.toBeDisabled();
    }, { timeout: 8000 });
  }, 15000);

  it('validates that Charge Point ID has no spaces', async () => {
    renderWithToast(<ActionControl />);
    fireEvent.click(screen.getByText(/CMS Configuration/i));
    const cpIdInput = screen.getByLabelText(/Charge Point ID/i);
    fireEvent.change(cpIdInput, { target: { value: 'ID-SPACE ' } });
    fireEvent.click(screen.getByText(/Save & Reconnect/i));
    expect(screen.getByText(/Required \(no spaces\)/i)).toBeInTheDocument();
  });
});
