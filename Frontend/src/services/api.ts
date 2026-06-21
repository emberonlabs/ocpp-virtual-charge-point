import axios from 'axios';

const ADMIN_API_URL = (import.meta.env.VITE_ADMIN_API_URL as string) ?? 'http://localhost:9999';

export interface LogEntry {
  type: string;
  timestamp: string;
  level: string;
  message: string;
  metadata: Record<string, unknown>;
}

export interface ActiveTransaction {
  transactionId: number;
  idTag: string;
  connectorId: number;
  meterValue: number;
  soc: number;
  startedAt: string;
  energyFlowEnabled: boolean;
}

export interface VCPStatus {
  endpoint: string;
  chargePointId: string;
  ocppVersion: string;
  isConnected: boolean;
}

export const fetchStatus = async (): Promise<VCPStatus> => {
  const response = await axios.get(`${ADMIN_API_URL}/status`);
  return response.data;
};

export const fetchLogs = async (): Promise<LogEntry[]> => {
  const response = await axios.get(`${ADMIN_API_URL}/logs`);
  return response.data;
};

export const clearLogs = async (): Promise<void> => {
  await axios.post(`${ADMIN_API_URL}/logs/clear`);
};

export const fetchActiveTransactions = async (): Promise<ActiveTransaction[]> => {
  const response = await axios.get(`${ADMIN_API_URL}/transactions`);
  return response.data;
};

export const executeOcppAction = async (action: string, payload: Record<string, unknown>): Promise<unknown> => {
  const response = await axios.post(`${ADMIN_API_URL}/execute`, {
    action,
    payload
  });
  return response.data;
};

export const restartBackend = async (): Promise<void> => {
  await axios.post(`${ADMIN_API_URL}/restart`);
};
