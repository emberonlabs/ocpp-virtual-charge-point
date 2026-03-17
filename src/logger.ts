import { createLogger, format, transports } from "winston";

export const memoryTransport = new transports.File({ 
  filename: 'app.log',
  options: { flags: 'w' }, // Overwrite on start
  format: format.combine(
    format.timestamp(),
    format.json()
  )
});

// A simple in-memory array to store the last 100 logs
export const logBuffer: any[] = [];

export const logger = createLogger({
  transports: [
    new transports.Console({
      format: format.combine(
        format.timestamp({
          format: "YYYY-MM-DD HH:mm:ss",
        }),
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

// Add a hook to store logs in our buffer
logger.on('data', (chunk) => {
  logBuffer.push(chunk);
  if (logBuffer.length > 100) {
    logBuffer.shift();
  }
});
