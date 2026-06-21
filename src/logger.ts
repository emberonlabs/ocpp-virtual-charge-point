import { createLogger, format, transports } from "winston";

export interface LogInfo {
  timestamp: string;
  level: string;
  message: string;
  [key: string]: unknown;
}

// A simple in-memory array to store the last 100 logs
export let logBuffer: LogInfo[] = [];

// Custom format to store logs in our memory buffer
const memoryFormat = format((info) => {
  // Store a clone of the log info to prevent mutate issues
  const logEntry: LogInfo = {
    timestamp: (info.timestamp as string) ?? new Date().toISOString(),
    level: (info.level as string) ?? "",
    message: (info.message as string) ?? "",
    ...Object.fromEntries(
      Object.entries(info).filter(
        ([key]) => !["timestamp", "level", "message"].includes(key)
      )
    ),
  };
  
  logBuffer.push(logEntry);
  if (logBuffer.length > 100) {
    logBuffer.shift();
  }
  return info;
});

export const clearLogBuffer = () => {
  console.log("🧹 Backend: Clearing log buffer...");
  logBuffer = [];
};

export const logger = createLogger({
  format: format.combine(
    format.timestamp({
      format: "YYYY-MM-DD HH:mm:ss",
    }),
    memoryFormat(),
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
  ],
});
