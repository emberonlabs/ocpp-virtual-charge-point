require("dotenv").config();

import { OcppVersion } from "./src/ocppVersion";
import { registerVcp } from "./src/close";
import { bootNotificationOcppMessage } from "./src/v16/messages/bootNotification";
import { statusNotificationOcppMessage } from "./src/v16/messages/statusNotification";
import { VCP } from "./src/vcp";

async function main(): Promise<VCP> {
  const vcp = new VCP({
    endpoint: process.env.WS_URL ?? "ws://localhost:3000",
    chargePointId: process.env.CP_ID ?? "123456",
    ocppVersion: OcppVersion.OCPP_1_6,
    basicAuthPassword: process.env.PASSWORD ?? undefined,
    adminPort: Number.parseInt(process.env.ADMIN_PORT ?? "9999"),
  });

  // Automatically send Boot and Status notifications upon ANY successful connection
  vcp.postMessageAction("connect", () => {
    vcp.send(
      bootNotificationOcppMessage.request({
        chargePointVendor: "Solidstudio",
        chargePointModel: "VirtualChargePoint",
        chargePointSerialNumber: "S001",
        firmwareVersion: "1.0.0",
      }),
    );
    vcp.send(
      statusNotificationOcppMessage.request({
        connectorId: 1,
        errorCode: "NoError",
        status: "Available",
      }),
    );
  });

  // We DO NOT call vcp.connect() here. 
  // The Admin API is already started in the VCP constructor.
  // The user will trigger the connection from the frontend.
  console.log("\x1b[32m%s\x1b[0m", `🚀 Virtual Charge Point (OCPP 1.6) Admin API started on port ${process.env.ADMIN_PORT ?? "9999"}`);
  console.log("\x1b[34m%s\x1b[0m", "📡 Waiting for CMS configuration from frontend dashboard...");
  
  return vcp;
}

main().then((vcp) => registerVcp(vcp, main));
