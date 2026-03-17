import axios from 'axios';

const ADMIN_API_URL = 'http://localhost:9999';

export interface LogEntry {
  type: string;
  timestamp: string;
  level: string;
  message: string;
  metadata: Record<string, any>;
}

export interface ActiveTransaction {
  transactionId: number;
  idTag: string;
  connectorId: number;
  meterValue: number;
  soc: number;
  startedAt: string;
}

export const fetchLogs = async (): Promise<LogEntry[]> => {
  try {
    const response = await axios.get(`${ADMIN_API_URL}/logs`);
    return response.data;
  } catch (error) {
    console.error('Error fetching logs:', error);
    return [];
  }
};

export const fetchActiveTransactions = async (): Promise<ActiveTransaction[]> => {
  try {
    const response = await axios.get(`${ADMIN_API_URL}/transactions`);
    return response.data;
  } catch (error) {
    console.error('Error fetching transactions:', error);
    return [];
  }
};

export const executeOcppAction = async (action: string, payload: Record<string, any>) => {
  try {
    const response = await axios.post(`${ADMIN_API_URL}/execute`, {
      action,
      payload
    });
    return response.data;
  } catch (error) {
    console.error(`Error executing ${action}:`, error);
    throw error;
  }
};
