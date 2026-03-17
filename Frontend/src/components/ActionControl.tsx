import { useEffect, useRef, useState } from 'react';
import { Power, Activity, ShieldCheck, Zap, XSquare, Settings2, ChevronDown, ChevronUp, Globe, Cpu } from 'lucide-react';
import { executeOcppAction, fetchActiveTransactions, fetchStatus, type ActiveTransaction } from '../services/api';
import { useToast } from './Toast';

export const ActionControl: React.FC = () => {
  const { showError, showSuccess } = useToast();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [tagId, setTagId] = useState('DEADBEEF');
  const [connectorId, setConnectorId] = useState(1);

  // CMS Configuration
  const [wsUrl, setWsUrl] = useState('ws://localhost:3000');
  const [cpId, setCpId] = useState('123456');
  const [cmsExpanded, setCmsExpanded] = useState(false);
  const [controlsExpanded, setControlsExpanded] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const prevIsConnected = useRef<boolean | null>(null);

  // Power simulation parameters
  const [targetEnergyKwh, setTargetEnergyKwh] = useState<number>(50);
  const [durationSeconds, setDurationSeconds] = useState<number>(60);
  const [initialSoC, setInitialSoC] = useState<number>(20);
  const [targetSoC, setTargetSoC] = useState<number>(80);
  
  // Track true active transactions from the backend
  const [activeTx, setActiveTx] = useState<ActiveTransaction | undefined>();

  // Fetch initial status
  useEffect(() => {
    const getInitialStatus = async () => {
      const status = await fetchStatus();
      if (status) {
        setWsUrl(status.endpoint);
        setCpId(status.chargePointId);
        setIsConnected(status.isConnected);
      }
    };
    getInitialStatus();
  }, []);

  // Use an interval to poll the real active transactions and status from the VCP
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const txs = await fetchActiveTransactions();
        const currentTx = txs.find(t => t.connectorId === connectorId);
        setActiveTx(currentTx);
      } catch {
        // transaction fetch failing is covered by the status check below
      }

      const status = await fetchStatus();
      if (status) {
        const nowConnected = status.isConnected;
        if (prevIsConnected.current === true && !nowConnected) {
          showError('Charge point disconnected from CMS');
        } else if (prevIsConnected.current === false && nowConnected) {
          showSuccess('Charge point connected to CMS');
        }
        prevIsConnected.current = nowConnected;
        setIsConnected(nowConnected);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [connectorId, showError, showSuccess]);

  // Calculate simulated speed: (kWh / (seconds / 3600)) = kW
  const simulatedKw = durationSeconds > 0 ? (targetEnergyKwh / (durationSeconds / 3600)).toFixed(1) : "0";

  // Derived validation errors — no state needed, computed on every render
  const errors = {
    wsUrl: !/^wss?:\/\//.test(wsUrl) ? 'Must start with ws:// or wss://' : '',
    cpId: cpId.trim() === '' ? 'Required' : /\s/.test(cpId) ? 'No spaces allowed' : '',
    tagId: tagId.trim() === '' ? 'Required' : !/^[a-zA-Z0-9\-]+$/.test(tagId) ? 'Alphanumeric and hyphens only' : '',
    connectorId: !Number.isInteger(connectorId) || connectorId < 1 ? 'Must be an integer ≥ 1' : '',
    targetEnergyKwh: targetEnergyKwh <= 0 ? 'Must be > 0' : '',
    durationSeconds: durationSeconds <= 0 ? 'Must be > 0' : '',
    initialSoC: initialSoC < 0 || initialSoC > 100 ? 'Must be 0–100' : '',
    targetSoC: targetSoC > 100 ? 'Must be ≤ 100' : targetSoC <= initialSoC ? 'Must be > Initial SOC' : '',
  };

  const cmsConfigInvalid = !!(errors.wsUrl || errors.cpId);
  const txParamsInvalid = !!(errors.tagId || errors.connectorId || errors.targetEnergyKwh || errors.durationSeconds || errors.initialSoC || errors.targetSoC);

  const handleAction = async (action: string, payload: Record<string, unknown>) => {
    setLoadingAction(action);
    try {
      if (action === "StartTransaction") {
        // Configure the simulator before starting
        await executeOcppAction("UpdateSimulationConfig", {
          targetEnergy: targetEnergyKwh,
          durationSeconds: durationSeconds,
          initialSoC: initialSoC,
          targetSoC: targetSoC
        });
      }
      const result = await executeOcppAction(action, payload);
      if (action === "UpdateCMSConfig") {
        showSuccess(`Reconnected to ${wsUrl}`);
      } else if (action !== "UpdateSimulationConfig") {
        showSuccess(`${action} sent`);
      }
      return result;
    } catch (e: unknown) {
      const detail = e instanceof Error ? e.message : String(e);
      showError(`${action} failed: ${detail}`);
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="glass-panel">
      {/* CMS Configuration Dropdown */}
      <div style={{ marginBottom: '1.5rem', borderBottom: '1px solid var(--panel-border)', paddingBottom: '1rem' }}>
        <button 
          onClick={() => setCmsExpanded(!cmsExpanded)}
          style={{
            width: '100%',
            background: 'none',
            border: 'none',
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            padding: '0.5rem 0'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Globe className="w-5 h-5" style={{ color: isConnected ? 'var(--success)' : 'var(--danger)' }} />
            <span style={{ fontWeight: 600 }}>CMS Configuration</span>
          </div>
          {cmsExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {cmsExpanded && (
          <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <Globe className="w-3 h-3" /> Central System URL
              </label>
              <input
                type="text"
                className={`form-control${errors.wsUrl ? ' invalid' : ''}`}
                style={{ width: '100%', padding: '0.5rem' }}
                value={wsUrl}
                onChange={e => setWsUrl(e.target.value)}
                placeholder="ws://localhost:3000"
              />
              {errors.wsUrl && <span className="field-error">{errors.wsUrl}</span>}
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <Cpu className="w-3 h-3" /> Charge Point ID
              </label>
              <input
                type="text"
                className={`form-control${errors.cpId ? ' invalid' : ''}`}
                style={{ width: '100%', padding: '0.5rem' }}
                value={cpId}
                onChange={e => setCpId(e.target.value)}
              />
              {errors.cpId && <span className="field-error">{errors.cpId}</span>}
            </div>
            <button
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '0.5rem' }}
              disabled={loadingAction === 'UpdateCMSConfig' || cmsConfigInvalid}
              onClick={() => handleAction('UpdateCMSConfig', { endpoint: wsUrl, chargePointId: cpId })}
            >
              {loadingAction === 'UpdateCMSConfig' ? <><span className="spinner" /> Connecting...</> : 'Save & Reconnect'}
            </button>
          </div>
        )}
      </div>

      {/* Charge Point Controls Dropdown */}
      <div className="panel-header" style={{ borderBottom: '1px solid var(--panel-border)', marginBottom: '1rem', paddingBottom: '0.5rem' }}>
        <button 
          onClick={() => setControlsExpanded(!controlsExpanded)}
          style={{
            width: '100%',
            background: 'none',
            border: 'none',
            color: 'var(--text-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            padding: '0.5rem 0'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Settings2 className="w-5 h-5" />
            <span style={{ fontWeight: 600, fontSize: '1.25rem' }}>Charge Point Controls</span>
          </div>
          {controlsExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>
      
      {controlsExpanded && (
        <div style={{ marginTop: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>RFID Tag ID</label>
              <input
                type="text"
                className={`form-control${errors.tagId ? ' invalid' : ''}`}
                style={{ width: '90%', padding: '0.5rem' }}
                value={tagId}
                onChange={e => setTagId(e.target.value)}
              />
              {errors.tagId && <span className="field-error">{errors.tagId}</span>}
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Connector ID</label>
              <input
                type="number"
                className={`form-control${errors.connectorId ? ' invalid' : ''}`}
                style={{ width: '90%', padding: '0.5rem' }}
                value={connectorId}
                min={1}
                step={1}
                onChange={e => setConnectorId(Number(e.target.value))}
              />
              {errors.connectorId && <span className="field-error">{errors.connectorId}</span>}
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Target Energy (kWh)</label>
              <input
                type="number"
                className={`form-control${errors.targetEnergyKwh ? ' invalid' : ''}`}
                style={{ width: '90%', padding: '0.5rem' }}
                value={targetEnergyKwh}
                min={0.1}
                step={0.1}
                onChange={e => setTargetEnergyKwh(Number(e.target.value))}
              />
              {errors.targetEnergyKwh && <span className="field-error">{errors.targetEnergyKwh}</span>}
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Duration (Seconds)</label>
              <input
                type="number"
                className={`form-control${errors.durationSeconds ? ' invalid' : ''}`}
                style={{ width: '90%', padding: '0.5rem' }}
                value={durationSeconds}
                min={1}
                step={1}
                onChange={e => setDurationSeconds(Number(e.target.value))}
              />
              {errors.durationSeconds && <span className="field-error">{errors.durationSeconds}</span>}
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Initial SOC (%)</label>
              <input
                type="number"
                className={`form-control${errors.initialSoC ? ' invalid' : ''}`}
                style={{ width: '90%', padding: '0.5rem' }}
                value={initialSoC}
                min={0}
                max={99}
                step={1}
                onChange={e => setInitialSoC(Number(e.target.value))}
              />
              {errors.initialSoC && <span className="field-error">{errors.initialSoC}</span>}
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label>Target SOC (%)</label>
              <input
                type="number"
                className={`form-control${errors.targetSoC ? ' invalid' : ''}`}
                style={{ width: '90%', padding: '0.5rem' }}
                value={targetSoC}
                min={1}
                max={100}
                step={1}
                onChange={e => setTargetSoC(Number(e.target.value))}
              />
              {errors.targetSoC && <span className="field-error">{errors.targetSoC}</span>}
            </div>
          </div>

          <div style={{
              background: 'rgba(59, 130, 246, 0.1)',
              border: '1px solid rgba(59, 130, 246, 0.2)',
              padding: '0.75rem',
              borderRadius: '0.5rem',
              marginBottom: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem'
          }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Simulated Charging Speed
                </span>
                <span style={{ fontWeight: '600', color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <Zap className="w-4 h-4" /> {simulatedKw} kW
                </span>
              </div>
              {activeTx && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                      Current Battery SOC
                  </span>
                  <span style={{ fontWeight: '600', color: '#10b981', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <Activity className="w-4 h-4" /> {activeTx.soc?.toFixed(1)}%
                  </span>
                </div>
              )}
          </div>
        </div>
      )}

      <div className="action-grid" style={{ marginTop: controlsExpanded ? 0 : '1rem' }}>
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
          {loadingAction === 'BootNotification' ? <span className="spinner" /> : <Power className="w-4 h-4" />}
          Send Boot Notification
        </button>

        <button
          className="btn btn-primary"
          disabled={loadingAction === 'Heartbeat'}
          onClick={() => handleAction('Heartbeat', {})}
        >
          {loadingAction === 'Heartbeat' ? <span className="spinner" /> : <Activity className="w-4 h-4" />}
          Send Heartbeat
        </button>

        <button
          className="btn btn-primary"
          disabled={loadingAction === 'Authorize' || !!(errors.tagId)}
          onClick={() => handleAction('Authorize', { idTag: tagId })}
        >
          {loadingAction === 'Authorize' ? <span className="spinner" /> : <ShieldCheck className="w-4 h-4" />}
          Verify RFID (Authorize)
        </button>

        <button
          className="btn btn-primary"
          disabled={loadingAction === 'StartTransaction' || txParamsInvalid}
          onClick={() => handleAction('StartTransaction', {
            connectorId,
            idTag: tagId,
            meterStart: 0,
            timestamp: new Date().toISOString()
          })}
        >
          {loadingAction === 'StartTransaction' ? <span className="spinner" /> : <Zap className="w-4 h-4" />}
          Start Transaction
        </button>

        <button
          className="btn btn-primary"
          disabled={loadingAction === 'StatusNotification' || !!(errors.connectorId)}
          onClick={() => handleAction('StatusNotification', {
            connectorId,
            errorCode: "NoError",
            status: "Charging"
          })}
        >
          {loadingAction === 'StatusNotification' ? <span className="spinner" /> : <Zap className="w-4 h-4" />}
          Set Charging Status
        </button>

        <button
          className="btn btn-danger"
          disabled={loadingAction === 'StopTransaction' || !activeTx || !!(errors.tagId)}
          onClick={() => {
            handleAction('StopTransaction', {
              transactionId: activeTx!.transactionId,
              idTag: tagId,
              meterStop: Math.floor(activeTx!.meterValue),
              timestamp: new Date().toISOString()
            });
          }}
        >
          {loadingAction === 'StopTransaction' ? <span className="spinner" /> : <XSquare className="w-4 h-4" />}
          Stop Transaction
        </button>
      </div>
    </div>
  );
};
