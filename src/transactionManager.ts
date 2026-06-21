import type { VCP } from "./vcp";

const DEFAULT_METER_VALUES_INTERVAL_SEC = 15;

type TransactionId = string | number;

export interface SimulationConfig {
  targetEnergy: number; // in kWh
  durationSeconds: number;
  initialSoC?: number; // 0-100
  targetSoC?: number; // 0-100
}

interface TransactionState {
  startedAt: Date;
  idTag: string;
  transactionId: TransactionId;
  meterValue: number;
  soc: number;
  currentPowerW: number;  // simulated watts currently flowing
  voltage: number;        // simulated voltage (V)
  currentAmps: number;    // simulated current (A)
  evseId?: number;
  connectorId: number;
}

interface StartTransactionProps {
  transactionId: TransactionId;
  idTag: string;
  evseId?: number;
  connectorId: number;
  meterValuesCallback: (transactionState: TransactionState) => Promise<void>;
}

export class TransactionManager {
  transactions: Map<
    TransactionId,
    TransactionState & { meterValuesTimer: NodeJS.Timer }
  > = new Map();

  private simulationConfig?: SimulationConfig;

  // Energy flow state — decoupled from transaction state
  private energyFlowEnabled = false;
  private energyFlowStartedAt?: Date;

  // ─── Energy Flow Control ─────────────────────────────────────────────────

  enableEnergyFlow() {
    if (!this.energyFlowEnabled) {
      this.energyFlowEnabled = true;
      // Set the energy flow start time NOW, not at transaction start
      this.energyFlowStartedAt = new Date();
    }
  }

  disableEnergyFlow() {
    this.energyFlowEnabled = false;
    // Keep energyFlowStartedAt so we know how much energy was already delivered
  }

  isEnergyFlowEnabled() {
    return this.energyFlowEnabled;
  }

  // ─── Config & Transactions ────────────────────────────────────────────────

  getActiveTransactions() {
    return Array.from(this.transactions.values()).map(
      ({ meterValuesTimer, ...t }) => ({
        ...t,
        meterValue: this.getMeterValue(t.transactionId),
        soc: this.getSoC(t.transactionId),
        energyFlowEnabled: this.energyFlowEnabled,
      }),
    );
  }

  setSimulationConfig(config: SimulationConfig) {
    this.simulationConfig = config;
  }

  canStartNewTransaction(connectorId: number) {
    return !Array.from(this.transactions.values()).some(
      (transaction) => transaction.connectorId === connectorId,
    );
  }

  // ─── Transaction Lifecycle ────────────────────────────────────────────────

  startTransaction(vcp: VCP, startTransactionProps: StartTransactionProps) {
    const config = this.simulationConfig;
    const intervalSec = config ? 5 : DEFAULT_METER_VALUES_INTERVAL_SEC;

    // Reset energy flow state for new transaction
    this.energyFlowEnabled = false;
    this.energyFlowStartedAt = undefined;

    const meterValuesTimer = setInterval(() => {
      // biome-ignore lint/style/noNonNullAssertion: transaction must exist
      const currentTransactionState = this.transactions.get(
        startTransactionProps.transactionId,
      )!;
      const { meterValuesTimer, ...currentTransaction } =
        currentTransactionState;

      // ── GATE: Only send meter values if energy flow is enabled ──
      if (!this.energyFlowEnabled) {
        return;
      }

      const meterValue = this.getMeterValue(startTransactionProps.transactionId);
      const soc = this.getSoC(startTransactionProps.transactionId);
      const currentPowerW = this.energyFlowEnabled ? this.getPowerW() : 0;
      const voltage = 230; // Standard AC single-phase voltage (V)
      const currentAmps = voltage > 0 ? currentPowerW / voltage : 0;

      startTransactionProps.meterValuesCallback({
        ...currentTransaction,
        meterValue,
        soc,
        currentPowerW,
        voltage,
        currentAmps,
      });

      // Auto-stop logic — only evaluated while energy is flowing
      if (config) {
        const secondsFlowing = this.energyFlowStartedAt
          ? (new Date().getTime() - this.energyFlowStartedAt.getTime()) / 1000
          : 0;

        const isTimeUp = secondsFlowing >= config.durationSeconds;
        const isEnergyReached = meterValue >= config.targetEnergy * 1000;
        const isSoCReached =
          config.targetSoC !== undefined && soc >= config.targetSoC;

        if (isTimeUp || isEnergyReached || isSoCReached) {
          this.energyFlowEnabled = false;
          clearInterval(meterValuesTimer);

          import("./v16/messages/stopTransaction").then(
            ({ stopTransactionOcppMessage }) => {
              vcp.send(
                stopTransactionOcppMessage.request({
                  transactionId: startTransactionProps.transactionId as number,
                  meterStop: Math.floor(meterValue),
                  timestamp: new Date().toISOString(),
                  idTag: startTransactionProps.idTag,
                  reason: "Local",
                }),
              );
              import("./v16/messages/statusNotification").then(
                ({ statusNotificationOcppMessage }) => {
                  vcp.send(
                    statusNotificationOcppMessage.request({
                      connectorId: startTransactionProps.connectorId,
                      errorCode: "NoError",
                      status: "Finishing",
                    }),
                  );
                  setTimeout(() => {
                    vcp.send(
                      statusNotificationOcppMessage.request({
                        connectorId: startTransactionProps.connectorId,
                        errorCode: "NoError",
                        status: "Available",
                      }),
                    );
                  }, 3000);
                },
              );
            },
          );
        }
      }
    }, intervalSec * 1000);

    this.transactions.set(startTransactionProps.transactionId, {
      transactionId: startTransactionProps.transactionId,
      idTag: startTransactionProps.idTag,
      meterValue: 0,
      soc: config?.initialSoC ?? 0,
      startedAt: new Date(),
      evseId: startTransactionProps.evseId,
      connectorId: startTransactionProps.connectorId,
      currentPowerW: 0,
      voltage: 230,
      currentAmps: 0,
      meterValuesTimer: meterValuesTimer,
    });
  }

  stopTransaction(transactionId: TransactionId) {
    const transaction = this.transactions.get(transactionId);
    if (transaction?.meterValuesTimer) {
      clearInterval(transaction.meterValuesTimer);
    }
    this.transactions.delete(transactionId);
    // Reset flow state when transaction ends
    this.energyFlowEnabled = false;
    this.energyFlowStartedAt = undefined;
  }

  // ─── Meter Calculations (based on energyFlowStartedAt) ───────────────────

  getMeterValue(transactionId: TransactionId) {
    if (!this.energyFlowStartedAt) {
      return 0;
    }
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      return 0;
    }

    const secondsFlowing =
      (new Date().getTime() - this.energyFlowStartedAt.getTime()) / 1000;

    if (this.simulationConfig) {
      const energyPerSecond =
        this.simulationConfig.targetEnergy / this.simulationConfig.durationSeconds;
      const currentEnergyKwh = Math.min(
        secondsFlowing * energyPerSecond,
        this.simulationConfig.targetEnergy,
      );
      return currentEnergyKwh * 1000; // Return Wh
    }

    // Default legacy behavior: 1 Wh per 100ms of flow
    return secondsFlowing * 10;
  }

  getSoC(transactionId: TransactionId) {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      return 0;
    }

    if (
      this.simulationConfig?.initialSoC !== undefined &&
      this.simulationConfig?.targetSoC !== undefined
    ) {
      if (!this.energyFlowStartedAt) {
        return this.simulationConfig.initialSoC;
      }
      const { initialSoC, targetSoC, durationSeconds } = this.simulationConfig;
      const secondsFlowing =
        (new Date().getTime() - this.energyFlowStartedAt.getTime()) / 1000;
      const socPerSecond = (targetSoC - initialSoC) / durationSeconds;
      return Math.min(initialSoC + secondsFlowing * socPerSecond, targetSoC);
    }

    return transaction.soc;
  }

  // Returns simulated power in Watts based on the simulation profile
  getPowerW(): number {
    if (!this.simulationConfig) {
      // Legacy default: ~360W (1 Wh per 10ms tick → 10 Wh/s = 36kW, too high — use 360W as a sane default)
      return 360;
    }
    // P (W) = E (kWh) / t (h) = targetEnergy * 3600 / durationSeconds
    return (this.simulationConfig.targetEnergy * 3600 * 1000) / this.simulationConfig.durationSeconds;
  }
}
