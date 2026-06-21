import { logger } from "./logger";
import { delay } from "./utils";
import type { VCP } from "./vcp";

const vcps: Map<VCP, () => Promise<VCP>> = new Map();

export async function close(vcp: VCP) {
  if (!process.env.AUTO_RESTART) {
    logger.warn("VCP Closed. Waiting for manual reconfiguration or restart.");
    vcp.disconnect(); // Just disconnect the WS, don't kill the admin server
    return;
  }

  logger.info("Auto-restart enabled. Closing old VCP...");
  vcp.close();
  logger.info("Waiting for 3 seconds...");
  await delay(3000);
  logger.info("Starting new VCP");

  const main = vcps.get(vcp);
  if (!main) {
    logger.error("Main function not found for VCP");
    process.exit(1);
  }

  deregisterVcp(vcp);
  const newVcp = await main();
  registerVcp(newVcp, main);
}

export function registerVcp(vcp: VCP, main: () => Promise<VCP>) {
  vcps.set(vcp, main);
}

export function deregisterVcp(vcp: VCP) {
  vcps.delete(vcp);
}

let isShuttingDown = false;
async function handleShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  logger.info(`Received ${signal}. Shutting down gracefully...`);
  
  for (const [vcp] of vcps) {
    try {
      vcp.close();
    } catch (err) {
      logger.error(`Error closing VCP during shutdown: ${err}`);
    }
  }
  
  // Give a short delay to allow socket disconnect packets to be sent/received
  await delay(500);
  process.exit(0);
}

process.on("SIGINT", () => handleShutdown("SIGINT"));
process.on("SIGTERM", () => handleShutdown("SIGTERM"));
