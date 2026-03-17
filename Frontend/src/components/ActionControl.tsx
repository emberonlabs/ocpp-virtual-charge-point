import { useState } from 'react';
import { Power, Activity, ShieldCheck, Zap, XSquare, Settings2 } from 'lucide-react';
import { executeOcppAction } from '../services/api';

export const ActionControl: React.FC = () => {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [tagId, setTagId] = useState('DEADBEEF');
  const [connectorId, setConnectorId] = useState(1);
  const [transactionId, setTransactionId] = useState(0);

  const handleAction = async (action: string, payload: Record<string, unknown>) => {
    setLoadingAction(action);
    try {
      if (action === "StartTransaction") {
         const newTxId = Math.floor(Math.random() * 1000000);
         setTransactionId(newTxId);
         payload.transactionId = newTxId;
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
          className="btn btn-danger"
          disabled={loadingAction === 'StopTransaction' || transactionId === 0}
          onClick={() => {
            handleAction('StopTransaction', {
              transactionId,
              idTag: tagId,
              meterStop: 100,
              timestamp: new Date().toISOString()
            });
            setTransactionId(0);
          }}
        >
          <XSquare className="w-4 h-4" />
          Stop Transaction
        </button>
      </div>
    </div>
  );
};
