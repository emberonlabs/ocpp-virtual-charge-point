import { useEffect, useState } from 'react';
import { Power, Activity, ShieldCheck, Zap, XSquare, Settings2 } from 'lucide-react';
import { executeOcppAction, fetchActiveTransactions, type ActiveTransaction } from '../services/api';

export const ActionControl: React.FC = () => {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [tagId, setTagId] = useState('DEADBEEF');
  const [connectorId, setConnectorId] = useState(1);
  
  // Power simulation parameters
  const [targetEnergyKwh, setTargetEnergyKwh] = useState<number>(50);
  const [durationSeconds, setDurationSeconds] = useState<number>(60);
  
  // Track true active transactions from the backend
  const [activeTx, setActiveTx] = useState<ActiveTransaction | undefined>();

  // Use an interval to poll the real active transactions from the VCP
  useEffect(() => {
    const interval = setInterval(async () => {
      const txs = await fetchActiveTransactions();
      const currentTx = txs.find(t => t.connectorId === connectorId);
      setActiveTx(currentTx);
    }, 2000);
    return () => clearInterval(interval);
  }, [connectorId]);

  // Calculate simulated speed: (kWh / (seconds / 3600)) = kW
  const simulatedKw = durationSeconds > 0 ? (targetEnergyKwh / (durationSeconds / 3600)).toFixed(1) : "0";

  const handleAction = async (action: string, payload: Record<string, unknown>) => {
    setLoadingAction(action);
    try {
      if (action === "StartTransaction") {
         // Configure the simulator before starting
         await executeOcppAction("UpdateSimulationConfig", {
           targetEnergy: targetEnergyKwh,
           durationSeconds: durationSeconds
         });
         const tempTxId = Math.floor(Math.random() * 100000); // Temporary ID until we poll and get the real CS one
         payload.transactionId = tempTxId;
      }
      await executeOcppAction(action, payload);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="glass-panel">
      <div className="panel-header">
        <Settings2 className="w-5 h-5" />
        Charge Point Controls
      </div>
      
      <div className="form-group" style={{ flexDirection: 'row', gap: '1rem', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: '150px' }}>
          <label>RFID Tag ID</label>
          <input 
            type="text" 
            className="form-control" 
            value={tagId} 
            onChange={e => setTagId(e.target.value)}
            style={{ width: '100%', marginTop: '0.25rem' }}
          />
        </div>
        <div style={{ flex: 1, minWidth: '150px' }}>
          <label>Connector ID</label>
          <input 
            type="number" 
            className="form-control" 
            value={connectorId} 
            onChange={e => setConnectorId(Number(e.target.value))}
            style={{ width: '100%', marginTop: '0.25rem' }}
          />
        </div>
        <div style={{ flex: 1, minWidth: '150px' }}>
          <label>Target Energy (kWh)</label>
          <input 
            type="number" 
            className="form-control" 
            value={targetEnergyKwh} 
            onChange={e => setTargetEnergyKwh(Number(e.target.value))}
            style={{ width: '100%', marginTop: '0.25rem' }}
          />
        </div>
        <div style={{ flex: 1, minWidth: '150px' }}>
          <label>Duration (Seconds)</label>
          <input 
            type="number" 
            className="form-control" 
            value={durationSeconds} 
            onChange={e => setDurationSeconds(Number(e.target.value))}
            style={{ width: '100%', marginTop: '0.25rem' }}
          />
        </div>
      </div>

      <div style={{
          background: 'rgba(59, 130, 246, 0.1)',
          border: '1px solid rgba(59, 130, 246, 0.2)',
          padding: '0.75rem',
          borderRadius: '0.5rem',
          marginBottom: '1rem',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
      }}>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              Simulated Charging Speed
          </span>
          <span style={{ fontWeight: '600', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <Zap className="w-4 h-4" /> {simulatedKw} kW
          </span>
      </div>

      <div className="action-grid">
        <button 
          className="btn btn-primary"
          disabled={loadingAction === 'BootNotification'}
          onClick={() => handleAction('BootNotification', {
            chargePointVendor: "Solidstudio",
            chargePointModel: "VirtualChargePoint",
            chargePointSerialNumber: "S001",
            firmwareVersion: "1.0.0"
          })}
        >
          <Power className="w-4 h-4" />
          Send Boot Notification
        </button>

        <button 
          className="btn btn-primary"
          disabled={loadingAction === 'Heartbeat'}
          onClick={() => handleAction('Heartbeat', {})}
        >
          <Activity className="w-4 h-4" />
          Send Heartbeat
        </button>

        <button 
          className="btn btn-primary"
          disabled={loadingAction === 'Authorize'}
          onClick={() => handleAction('Authorize', { idTag: tagId })}
        >
          <ShieldCheck className="w-4 h-4" />
          Verify RFID (Authorize)
        </button>

        <button 
          className="btn btn-primary"
          disabled={loadingAction === 'StartTransaction'}
          onClick={() => handleAction('StartTransaction', {
            connectorId,
            idTag: tagId,
            meterStart: 0,
            timestamp: new Date().toISOString()
          })}
        >
          <Zap className="w-4 h-4" />
          Start Transaction
        </button>

        <button 
          className="btn btn-primary"
          disabled={loadingAction === 'StatusNotification'}
          onClick={() => handleAction('StatusNotification', {
            connectorId,
            errorCode: "NoError",
            status: "Charging"
          })}
        >
          <Zap className="w-4 h-4" />
          Set Charging Status
        </button>

        <button 
          className="btn btn-danger"
          disabled={loadingAction === 'StopTransaction' || !activeTx}
          onClick={() => {
            handleAction('StopTransaction', {
              transactionId: activeTx?.transactionId || 0,
              idTag: tagId,
              meterStop: activeTx ? Math.floor(activeTx.meterValue) : 100,
              timestamp: new Date().toISOString()
            });
          }}
        >
          <XSquare className="w-4 h-4" />
          Stop Transaction
        </button>
      </div>
    </div>
  );
};
