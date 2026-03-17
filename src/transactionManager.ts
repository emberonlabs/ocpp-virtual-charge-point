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

  getActiveTransactions() {
    return Array.from(this.transactions.values()).map(
      ({ meterValuesTimer, ...t }) => ({
        ...t,
        meterValue: this.getMeterValue(t.transactionId),
        soc: this.getSoC(t.transactionId),
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

  startTransaction(vcp: VCP, startTransactionProps: StartTransactionProps) {
    const config = this.simulationConfig;
    const intervalSec = config ? 5 : DEFAULT_METER_VALUES_INTERVAL_SEC;

    const meterValuesTimer = setInterval(() => {
      // biome-ignore lint/style/noNonNullAssertion: transaction must exist
      const currentTransactionState = this.transactions.get(
        startTransactionProps.transactionId,
      )!;
      const { meterValuesTimer, ...currentTransaction } =
        currentTransactionState;
      
      const meterValue = this.getMeterValue(startTransactionProps.transactionId);
      const soc = this.getSoC(startTransactionProps.transactionId);
      
      startTransactionProps.meterValuesCallback({
        ...currentTransaction,
        meterValue,
        soc,
      });

      const secondsElapsed = (new Date().getTime() - currentTransactionState.startedAt.getTime()) / 1000;

      // Auto-stop logic
      const isTimeUp = config && secondsElapsed >= config.durationSeconds;
      const isEnergyReached = config && meterValue >= config.targetEnergy * 1000;
      const isSoCReached = config && config.targetSoC !== undefined && soc >= config.targetSoC;

      if (config && (isTimeUp || isEnergyReached || isSoCReached)) {
        clearInterval(meterValuesTimer);
        // Dispatch stop transaction from the global factory wrapper
        import("./v16/messages/stopTransaction").then(({ stopTransactionOcppMessage }) => {
          vcp.send(
            stopTransactionOcppMessage.request({
              transactionId: startTransactionProps.transactionId as number,
              meterStop: Math.floor(meterValue),
              timestamp: new Date().toISOString(),
              idTag: startTransactionProps.idTag,
              reason: "Local"
            })
          );
          // And emit status notification Finishing
          import("./v16/messages/statusNotification").then(({ statusNotificationOcppMessage }) => {
            vcp.send(
              statusNotificationOcppMessage.request({
                connectorId: startTransactionProps.connectorId,
                errorCode: "NoError",
                status: "Finishing"
              })
            );
          });
        });
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
      meterValuesTimer: meterValuesTimer,
    });
  }

  stopTransaction(transactionId: TransactionId) {
    const transaction = this.transactions.get(transactionId);
    if (transaction?.meterValuesTimer) {
      clearInterval(transaction.meterValuesTimer);
    }
    this.transactions.delete(transactionId);
  }

  getMeterValue(transactionId: TransactionId) {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      return 0;
    }
    const secondsElapsed = (new Date().getTime() - transaction.startedAt.getTime()) / 1000;
    
    // If we have a simulation config, use linear interpolation to reach targetEnergy over durationSeconds
    if (this.simulationConfig) {
       const energyPerSecond = this.simulationConfig.targetEnergy / this.simulationConfig.durationSeconds;
       const currentEnergyKwh = Math.min(secondsElapsed * energyPerSecond, this.simulationConfig.targetEnergy);
       return currentEnergyKwh * 1000; // Return Wh
    }

    // Default legacy behavior: 1 Wh per 100ms
    return (new Date().getTime() - transaction.startedAt.getTime()) / 100;
  }

  getSoC(transactionId: TransactionId) {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      return 0;
    }
    const secondsElapsed = (new Date().getTime() - transaction.startedAt.getTime()) / 1000;

    if (this.simulationConfig && this.simulationConfig.initialSoC !== undefined && this.simulationConfig.targetSoC !== undefined) {
      const { initialSoC, targetSoC, durationSeconds } = this.simulationConfig;
      const socPerSecond = (targetSoC - initialSoC) / durationSeconds;
      return Math.min(initialSoC + secondsElapsed * socPerSecond, targetSoC);
    }

    return transaction.soc;
  }
}
