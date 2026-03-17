import { createLogger, format, transports, Transport } from "winston";

export interface LogInfo {
  timestamp: string;
  level: string;
  message: string;
  [key: string]: unknown;
}

// A simple in-memory array to store the last 100 logs
export let logBuffer: LogInfo[] = [];

// Custom transport to handle our memory buffer
class MemoryTransport extends Transport {
  log(info: LogInfo, callback: () => void) {
    setImmediate(() => {
      this.emit('logged', info);
    });
    
    logBuffer.push(info);
    if (logBuffer.length > 100) {
      logBuffer.shift();
    }
    
    if (callback) {
      callback();
    }
  }
}

export const clearLogBuffer = () => {
  console.log("🧹 Backend: Clearing log buffer...");
  logBuffer = [];
};

export const logger = createLogger({
  format: format.combine(
    format.timestamp({
      format: "YYYY-MM-DD HH:mm:ss",
    }),
  ),
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.simple(),
        format.printf((info) => {
          const { level, message, timestamp, ...meta } = info;
          return `${timestamp} ${level}: ${message} ${
            Object.keys(meta).length ? JSON.stringify(meta) : ""
          }`;
        }),
      ),
      level: process.env.LOG_LEVEL ?? "info",
    }),
    new MemoryTransport()
  ],
});
