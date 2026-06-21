import axios from 'axios';

const ADMIN_API_URL = (import.meta.env.VITE_ADMIN_API_URL as string) ?? '/api';

// ── Auth token management ──
let authToken: string | null = sessionStorage.getItem('vcp_auth_token');

export const setAuthToken = (token: string) => {
  authToken = token;
  sessionStorage.setItem('vcp_auth_token', token);
};

export const clearAuthToken = () => {
  authToken = null;
  sessionStorage.removeItem('vcp_auth_token');
  sessionStorage.removeItem('vcp_authenticated');
};

export const getAuthToken = (): string | null => authToken;

// ── Axios interceptor: attach Bearer token to every request ──
axios.interceptors.request.use((config) => {
  if (authToken && !config.url?.endsWith('/login')) {
    config.headers.Authorization = `Bearer ${authToken}`;
  }
  return config;
});

// ── Axios response interceptor: handle 401 by clearing auth ──
axios.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !error.config?.url?.endsWith('/login')) {
      clearAuthToken();
      window.location.reload();
    }
    return Promise.reject(error);
  }
);

// ── API Types ──
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

// ── Auth API ──
export const login = async (username: string, password: string): Promise<{ token: string }> => {
  const response = await axios.post(`${ADMIN_API_URL}/login`, { username, password });
  return response.data;
};

// ── Protected APIs ──
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
