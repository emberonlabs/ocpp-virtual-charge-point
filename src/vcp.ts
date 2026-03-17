import * as util from "node:util";
import { WebSocket } from "ws";

import { serve, type ServerType } from "@hono/node-server";
import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { z } from "zod";
import { logger, logBuffer } from "./logger";
import { call } from "./messageFactory";
import type { OcppCall, OcppCallError, OcppCallResult } from "./ocppMessage";
import {
  type OcppMessageHandler,
  resolveMessageHandler,
} from "./ocppMessageHandler";
import { ocppOutbox } from "./ocppOutbox";
import { type OcppVersion, toProtocolVersion } from "./ocppVersion";
import {
  validateOcppIncomingRequest,
  validateOcppIncomingResponse,
  validateOcppOutgoingRequest,
  validateOcppOutgoingResponse,
} from "./schemaValidator";
import { TransactionManager } from "./transactionManager";
import { heartbeatOcppMessage } from "./v16/messages/heartbeat";
import { close } from "./close";

interface VCPOptions {
  ocppVersion: OcppVersion;
  endpoint: string;
  chargePointId: string;
  basicAuthPassword?: string;
  adminPort?: number;
}

interface LogEntry {
  type: "Application";
  timestamp: string;
  level: string;
  message: string;
  metadata: Record<string, unknown>;
}

export class VCP {
  private ws?: WebSocket;
  private adminServer?: ServerType;
  private messageHandler: OcppMessageHandler;
  private heartbeatInterval?: NodeJS.Timeout;

  private isFinishing = false;

  private postMessageActions: Record<string, () => void | Promise<void>> = {};

  transactionManager = new TransactionManager();

  constructor(private vcpOptions: VCPOptions) {
    this.messageHandler = resolveMessageHandler(vcpOptions.ocppVersion);
    if (vcpOptions.adminPort) {
      const adminApi = new Hono();
      adminApi.use("/*", cors());
      adminApi.get("/health", (c) => c.text("OK"));
      adminApi.get("/status", (c) => c.json({
        endpoint: this.vcpOptions.endpoint,
        chargePointId: this.vcpOptions.chargePointId,
        ocppVersion: this.vcpOptions.ocppVersion,
        isConnected: this.ws?.readyState === WebSocket.OPEN
      }));
      adminApi.get("/logs", async (c) => c.json(await this.getDiagnosticData()));
      adminApi.get("/transactions", (c) => c.json(this.transactionManager.getActiveTransactions()));
      adminApi.post(
        "/execute",
        zValidator(
          "json",
          z.object({
            action: z.string(),
            payload: z.any(),
          }),
        ),
        async (c) => {
          const validated = c.req.valid("json");
          if (validated.action === "UpdateSimulationConfig") {
            this.transactionManager.setSimulationConfig(validated.payload);
            return c.json({ status: "Configuration Updated" });
          }
          if (validated.action === "UpdateCMSConfig") {
            const { endpoint, chargePointId } = validated.payload;
            this.disconnect();
            this.vcpOptions.endpoint = endpoint;
            this.vcpOptions.chargePointId = chargePointId;
            try {
              await this.connect();
              return c.json({ status: "Reconnected", config: this.vcpOptions });
            } catch (err) {
              return c.json({ status: "Connection Failed", error: String(err) }, 500);
            }
          }
          this.send(call(validated.action, validated.payload));
          return c.text("OK");
        },
      );
      this.adminServer = serve({
        fetch: adminApi.fetch,
        port: vcpOptions.adminPort,
      });
    }
  }

  async connect(): Promise<void> {
    logger.info(`Connecting... | ${util.inspect(this.vcpOptions)}`);
    this.isFinishing = false;
    return new Promise((resolve) => {
      const websocketUrl = `${this.vcpOptions.endpoint}/${this.vcpOptions.chargePointId}`;
      const protocol = toProtocolVersion(this.vcpOptions.ocppVersion);
      this.ws = new WebSocket(websocketUrl, [protocol], {
        rejectUnauthorized: false,
        followRedirects: true,
        headers: {
          ...(this.vcpOptions.basicAuthPassword && {
            Authorization: `Basic ${Buffer.from(
              `${this.vcpOptions.chargePointId}:${this.vcpOptions.basicAuthPassword}`,
            ).toString("base64")}`,
          }),
        },
      });

      this.ws.on("open", () => {
        resolve();
        console.log("\x1b[32m%s\x1b[0m", `✅ Connected to CMS: ${this.vcpOptions.endpoint}/${this.vcpOptions.chargePointId}`);
        if (this.postMessageActions["connect"]) {
          this.postMessageActions["connect"]();
        }
      });
      this.ws.on("message", (message: string) => this._onMessage(message));
      this.ws.on("ping", () => {
        logger.info("Received PING");
      });
      this.ws.on("pong", () => {
        logger.info("Received PONG");
      });
      this.ws.on("close", (code: number, reason: string) =>
        this._onClose(code, reason),
      );
      this.ws.on("error", (error: Error) => {
        logger.error("Websocket error:");
        logger.error(error);
        close(this);
      });
    });
  }

  // biome-ignore lint/suspicious/noExplicitAny: ocpp types
  send(ocppCall: OcppCall<any>) {
    if (!this.ws) {
      throw new Error("Websocket not initialized. Call connect() first");
    }
    ocppOutbox.enqueue(ocppCall);
    const jsonMessage = JSON.stringify([
      2,
      ocppCall.messageId,
      ocppCall.action,
      ocppCall.payload,
    ]);
    logger.info(`Sending message ➡️  ${jsonMessage}`);
    validateOcppOutgoingRequest(
      this.vcpOptions.ocppVersion,
      ocppCall.action,
      JSON.parse(JSON.stringify(ocppCall.payload)),
    );
    this.ws.send(jsonMessage);
  }

  // biome-ignore lint/suspicious/noExplicitAny: ocpp types
  respond(result: OcppCallResult<any>) {
    if (!this.ws) {
      throw new Error("Websocket not initialized. Call connect() first");
    }
    const jsonMessage = JSON.stringify([3, result.messageId, result.payload]);
    logger.info(`Responding with ➡️  ${jsonMessage}`);
    validateOcppIncomingResponse(
      this.vcpOptions.ocppVersion,
      result.action,
      JSON.parse(JSON.stringify(result.payload)),
    );
    this.ws.send(jsonMessage);
  }

  // biome-ignore lint/suspicious/noExplicitAny: ocpp types
  respondError(error: OcppCallError<any>) {
    if (!this.ws) {
      throw new Error("Websocket not initialized. Call connect() first");
    }
    const jsonMessage = JSON.stringify([
      4,
      error.messageId,
      error.errorCode,
      error.errorDescription,
      error.errorDetails,
    ]);
    logger.info(`Responding with ➡️  ${jsonMessage}`);
    this.ws.send(jsonMessage);
  }

  configureHeartbeat(interval: number) {
    this.heartbeatInterval = setInterval(() => {
      if (!this.ws) {
        return;
      }
      this.send(heartbeatOcppMessage.request({}));
    }, interval);
  }

  disconnect() {
    if (this.ws) {
      this.isFinishing = true;
      this.ws.close();
      this.ws = undefined;
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }
  }

  close() {
    this.disconnect();
    if (this.adminServer) {
      this.adminServer.close();
      this.adminServer = undefined;
    }
  }

  async getDiagnosticData(): Promise<LogEntry[]> {
    return logBuffer.map((info) => ({
      type: "Application",
      timestamp: info.timestamp || new Date().toISOString(),
      level: info.level,
      message: info.message,
      metadata: Object.fromEntries(
        Object.entries(info).filter(
          ([key]) => !["timestamp", "level", "message"].includes(key),
        ),
      ),
    }));
  }

  async postMessageAction(
    action: string,
    callback: () => void | Promise<void>,
  ) {
    this.postMessageActions[action] = callback;
  }

  private _onMessage(message: string) {
    logger.info(`Receive message ⬅️  ${message}`);
    const data = JSON.parse(message);
    const [type, ...rest] = data;
    if (type === 2) {
      const [messageId, action, payload] = rest;
      validateOcppIncomingRequest(this.vcpOptions.ocppVersion, action, payload);
      this.messageHandler.handleCall(this, { messageId, action, payload });
      if (this.postMessageActions[action]) {
        logger.info(`Executing postMessageAction for ${action}`);
        this.postMessageActions[action]();
      }
    } else if (type === 3) {
      const [messageId, payload] = rest;
      const enqueuedCall = ocppOutbox.get(messageId);
      if (!enqueuedCall) {
        if (process.env.CONTINUE_ON_UNKNOWN_MESSAGE_ID) {
          return;
        }
        throw new Error(
          `Received CallResult for unknown messageId=${messageId}`,
        );
      }
      validateOcppOutgoingResponse(
        this.vcpOptions.ocppVersion,
        enqueuedCall.action,
        payload,
      );
      this.messageHandler.handleCallResult(this, enqueuedCall, {
        messageId,
        payload,
        action: enqueuedCall.action,
      });
    } else if (type === 4) {
      const [messageId, errorCode, errorDescription, errorDetails] = rest;
      this.messageHandler.handleCallError(this, {
        messageId,
        errorCode,
        errorDescription,
        errorDetails,
      });
    } else {
      throw new Error(`Unrecognized message type ${type}`);
    }
  }

  private _onClose(code: number, reason: string) {
    if (this.isFinishing) {
      return;
    }
    logger.info(`Connection closed. code=${code}, reason=${reason}`);
    close(this);
  }
}
