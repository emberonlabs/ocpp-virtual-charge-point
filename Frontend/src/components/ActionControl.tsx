import { useEffect, useState, useCallback } from 'react';
import { Power, Activity, ShieldCheck, Zap, XSquare, Settings2, ChevronDown, ChevronUp, Globe, Cpu } from 'lucide-react';
import { executeOcppAction, fetchActiveTransactions, fetchStatus, type ActiveTransaction } from '../services/api';
import { useToast } from './Toast';

interface ValidationErrors {
  tagId?: string;
  connectorId?: string;
  targetEnergy?: string;
  duration?: string;
  initialSoC?: string;
  targetSoC?: string;
  wsUrl?: string;
  cpId?: string;
}

export const ActionControl: React.FC = () => {
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [tagId, setTagId] = useState('RFID001');
  const [connectorId, setConnectorId] = useState(1);
  const [isTabVisible, setIsTabVisible] = useState(true);
  const { showError, showSuccess } = useToast();
  
  // CMS Configuration
  const [wsUrl, setWsUrl] = useState('ws://localhost:3000');
  const [cpId, setCpId] = useState('123456');
  const [cmsExpanded, setCmsExpanded] = useState(false);
  const [controlsExpanded, setControlsExpanded] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

  // Power simulation parameters
  const [targetEnergyKwh, setTargetEnergyKwh] = useState<number>(50);
  const [durationSeconds, setDurationSeconds] = useState<number>(60);
  const [initialSoC, setInitialSoC] = useState<number>(20);
  const [targetSoC, setTargetSoC] = useState<number>(80);
  
  // Validation
  const [errors, setErrors] = useState<ValidationErrors>({});

  // Track true active transactions from the backend
  const [activeTx, setActiveTx] = useState<ActiveTransaction | undefined>();
  const [energyFlowEnabled, setEnergyFlowEnabled] = useState(false);

  const validate = useCallback((): boolean => {
    const newErrors: ValidationErrors = {};
    
    if (!tagId.trim()) newErrors.tagId = 'RFID Tag is required';
    if (connectorId < 1) newErrors.connectorId = 'Must be >= 1';
    if (targetEnergyKwh <= 0) newErrors.targetEnergy = 'Must be > 0';
    if (durationSeconds <= 0) newErrors.duration = 'Must be > 0';
    if (initialSoC < 0 || initialSoC > 100) newErrors.initialSoC = '0-100%';
    if (targetSoC <= initialSoC || targetSoC > 100) newErrors.targetSoC = `Must be > ${initialSoC}% and <= 100%`;
    
    if (!wsUrl.match(/^wss?:\/\/.+/)) newErrors.wsUrl = 'Invalid WebSocket URL';
    if (!cpId.trim() || cpId.includes(' ')) newErrors.cpId = 'Required (no spaces)';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [tagId, connectorId, targetEnergyKwh, durationSeconds, initialSoC, targetSoC, wsUrl, cpId]);

  // Track tab visibility
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsTabVisible(document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  // Fetch initial status
  useEffect(() => {
    const getInitialStatus = async () => {
      try {
        const status = await fetchStatus();
        if (status) {
          setWsUrl(status.endpoint);
          setCpId(status.chargePointId);
          setIsConnected(status.isConnected);
        }
      } catch (e) {
        console.error("Initial status fetch failed", e);
      }
    };
    getInitialStatus();
  }, []);

  // Use an interval to poll the real active transactions and status from the VCP
  useEffect(() => {
    if (!isTabVisible) return;

    const interval = setInterval(async () => {
      try {
        const txs = await fetchActiveTransactions();
        const currentTx = txs.find(t => t.connectorId === connectorId);
        setActiveTx(currentTx);
        setEnergyFlowEnabled(currentTx?.energyFlowEnabled ?? false);
        
        const status = await fetchStatus();
        if (status) {
          setIsConnected(status.isConnected);
        }
      } catch (e) {
        console.error("Polling failed", e);
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [connectorId, isTabVisible]);

  // Calculate simulated speed: (kWh / (seconds / 3600)) = kW
  const simulatedKw = durationSeconds > 0 ? (targetEnergyKwh / (durationSeconds / 3600)).toFixed(1) : "0";

  const handleAction = async (action: string, payload: Record<string, unknown>) => {
    if (!validate()) {
      showError('Please fix the validation errors before proceeding');
      return;
    }

    setLoadingAction(action);
    try {
      if (action === "StartTransaction") {
         await executeOcppAction("UpdateSimulationConfig", {
           targetEnergy: targetEnergyKwh,
           durationSeconds: durationSeconds,
           initialSoC: initialSoC,
           targetSoC: targetSoC
         });
      }
      
      const result = await executeOcppAction(action, payload);
      
      if (action === "UpdateCMSConfig") {
        showSuccess(`Connected to ${payload.endpoint}`);
      } else {
        showSuccess(`${action} sent successfully`);
      }
      
      return result;
    } catch (e: any) {
      const errorMsg = e.response?.data?.error || e.message || `Failed to execute ${action}`;
      showError(errorMsg);
    } finally {
      setLoadingAction(null);
    }
  };

  const isFormInvalid = Object.keys(errors).length > 0;

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
              <label htmlFor="ws-url-input" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <Globe className="w-3 h-3" /> Central System URL
              </label>
              <input 
                id="ws-url-input"
                type="text" 
                className={`form-control ${errors.wsUrl ? 'invalid' : ''}`}
                style={{ width: '100%', padding: '0.5rem' }}
                value={wsUrl} 
                onChange={e => setWsUrl(e.target.value)}
                placeholder="ws://localhost:3000"
              />
              {errors.wsUrl && <span className="field-error">{errors.wsUrl}</span>}
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="cp-id-input" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <Cpu className="w-3 h-3" /> Charge Point ID
              </label>
              <input 
                id="cp-id-input"
                type="text" 
                className={`form-control ${errors.cpId ? 'invalid' : ''}`}
                style={{ width: '100%', padding: '0.5rem' }}
                value={cpId} 
                onChange={e => setCpId(e.target.value)}
              />
              {errors.cpId && <span className="field-error">{errors.cpId}</span>}
            </div>
            <button 
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '0.5rem' }}
              disabled={loadingAction === 'UpdateCMSConfig'}
              onClick={() => handleAction('UpdateCMSConfig', { endpoint: wsUrl, chargePointId: cpId })}
            >
              {loadingAction === 'UpdateCMSConfig' ? <span className="spinner" /> : 'Save & Reconnect'}
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
              <label htmlFor="tag-id-input">RFID Tag ID</label>
              <input 
                id="tag-id-input"
                type="text" 
                className={`form-control ${errors.tagId ? 'invalid' : ''}`}
                style={{ width: '90%', padding: '0.5rem' }}
                value={tagId} 
                onChange={e => setTagId(e.target.value)}
              />
              {errors.tagId && <span className="field-error">{errors.tagId}</span>}
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="connector-id-input">Connector ID</label>
              <input 
                id="connector-id-input"
                type="number" 
                className={`form-control ${errors.connectorId ? 'invalid' : ''}`}
                style={{ width: '90%', padding: '0.5rem' }}
                value={connectorId} 
                onChange={e => setConnectorId(Number(e.target.value))}
              />
              {errors.connectorId && <span className="field-error">{errors.connectorId}</span>}
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="target-energy-input">Target Energy (kWh)</label>
              <input 
                id="target-energy-input"
                type="number" 
                className={`form-control ${errors.targetEnergy ? 'invalid' : ''}`}
                style={{ width: '90%', padding: '0.5rem' }}
                value={targetEnergyKwh} 
                onChange={e => setTargetEnergyKwh(Number(e.target.value))}
              />
              {errors.targetEnergy && <span className="field-error">{errors.targetEnergy}</span>}
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="duration-input">Duration (Seconds)</label>
              <input 
                id="duration-input"
                type="number" 
                className={`form-control ${errors.duration ? 'invalid' : ''}`}
                style={{ width: '90%', padding: '0.5rem' }}
                value={durationSeconds} 
                onChange={e => setDurationSeconds(Number(e.target.value))}
              />
              {errors.duration && <span className="field-error">{errors.duration}</span>}
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="initial-soc-input">Initial SOC (%)</label>
              <input 
                id="initial-soc-input"
                type="number" 
                className={`form-control ${errors.initialSoC ? 'invalid' : ''}`}
                style={{ width: '90%', padding: '0.5rem' }}
                value={initialSoC} 
                onChange={e => setInitialSoC(Number(e.target.value))}
              />
              {errors.initialSoC && <span className="field-error">{errors.initialSoC}</span>}
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label htmlFor="target-soc-input">Target SOC (%)</label>
              <input 
                id="target-soc-input"
                type="number" 
                className={`form-control ${errors.targetSoC ? 'invalid' : ''}`}
                style={{ width: '90%', padding: '0.5rem' }}
                value={targetSoC} 
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
                      <Activity className="w-4 h-4" /> <span data-testid="current-soc-value">{activeTx.soc?.toFixed(1)}%</span>
                  </span>
                </div>
              )}
          </div>
        </div>
      )}

      <div className="action-grid" style={{ marginTop: controlsExpanded ? 0 : '1rem' }}>
        <button 
          className="btn btn-primary"
          disabled={loadingAction !== null || isFormInvalid}
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
          disabled={loadingAction !== null || isFormInvalid}
          onClick={() => handleAction('Heartbeat', {})}
        >
          {loadingAction === 'Heartbeat' ? <span className="spinner" /> : <Activity className="w-4 h-4" />}
          Send Heartbeat
        </button>

        <button 
          className="btn btn-primary"
          disabled={loadingAction !== null || isFormInvalid}
          onClick={() => handleAction('Authorize', { idTag: tagId })}
        >
          {loadingAction === 'Authorize' ? <span className="spinner" /> : <ShieldCheck className="w-4 h-4" />}
          Verify RFID (Authorize)
        </button>

        <button 
          className="btn btn-primary"
          disabled={loadingAction === 'StartTransaction' || isFormInvalid}
          onClick={async () => {
            await handleAction('StartTransaction', {
              connectorId,
              idTag: tagId,
              meterStart: 0,
              timestamp: new Date().toISOString()
            });
          }}
        >
          {loadingAction === 'StartTransaction' ? <span className="spinner" /> : <Zap className="w-4 h-4" />}
          Start Transaction
        </button>

        <button 
          style={{
            padding: '0.6rem 1rem',
            borderRadius: '0.5rem',
            fontWeight: 600,
            fontSize: '0.85rem',
            border: 'none',
            cursor: activeTx && !energyFlowEnabled ? 'pointer' : (!activeTx ? 'not-allowed' : 'pointer'),
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            opacity: !activeTx ? 0.5 : 1,
            background: energyFlowEnabled
              ? 'linear-gradient(135deg, #f59e0b, #d97706)'
              : 'linear-gradient(135deg, #10b981, #059669)',
            color: '#fff',
            transition: 'all 0.2s ease'
          }}
          disabled={!activeTx || loadingAction === 'StartEnergyFlow' || loadingAction === 'StopEnergyFlow'}
          onClick={async () => {
            const action = energyFlowEnabled ? 'StopEnergyFlow' : 'StartEnergyFlow';
            setLoadingAction(action);
            try {
              if (action === 'StartEnergyFlow') {
                // Push the current form config to the backend BEFORE starting energy flow.
                // This is critical for remote-started transactions where UpdateSimulationConfig
                // was never called (no local StartTransaction button was clicked).
                await executeOcppAction('UpdateSimulationConfig', {
                  targetEnergy: targetEnergyKwh,
                  durationSeconds: durationSeconds,
                  initialSoC: initialSoC,
                  targetSoC: targetSoC
                });
              }
              await executeOcppAction(action, {});
              setEnergyFlowEnabled(!energyFlowEnabled);
            } catch (e: any) {
              showError(e.message);
            } finally {
              setLoadingAction(null);
            }
          }}
        >
          {(loadingAction === 'StartEnergyFlow' || loadingAction === 'StopEnergyFlow')
            ? <span className="spinner" />
            : <Zap className="w-4 h-4" />
          }
          {energyFlowEnabled ? 'Stop Energy Flow' : 'Start Energy Flow'}
        </button>

        <button 
          className="btn btn-primary"
          disabled={loadingAction === 'StatusNotification' || isFormInvalid}
          onClick={() => handleAction('StatusNotification', {
            connectorId,
            errorCode: "NoError",
            status: "Available"
          })}
        >
          {loadingAction === 'StatusNotification' && !activeTx ? <span className="spinner" /> : <Zap className="w-4 h-4" />}
          Set Available Status
        </button>

        <button 
          className="btn btn-primary"
          disabled={loadingAction === 'StatusNotification' || isFormInvalid}
          onClick={() => handleAction('StatusNotification', {
            connectorId,
            errorCode: "NoError",
            status: "Preparing"
          })}
        >
          {loadingAction === 'StatusNotification' ? <span className="spinner" /> : <Zap className="w-4 h-4" />}
          Set Preparing Status
        </button>

        <button 
          className="btn btn-primary"
          disabled={loadingAction === 'StatusNotification' || isFormInvalid}
          onClick={() => handleAction('StatusNotification', {
            connectorId,
            errorCode: "NoError",
            status: "Charging"
          })}
        >
          {loadingAction === 'StatusNotification' && activeTx ? <span className="spinner" /> : <Zap className="w-4 h-4" />}
          Set Charging Status
        </button>

        <button 
          className="btn btn-danger"
          disabled={loadingAction !== null || !activeTx}
          onClick={async () => {
            await handleAction('StopTransaction', {
              transactionId: activeTx?.transactionId || 0,
              idTag: tagId,
              meterStop: activeTx ? Math.floor(activeTx.meterValue) : 100,
              timestamp: new Date().toISOString()
            });
            // Immediately send Finishing status to CMS
            await handleAction('StatusNotification', {
              connectorId,
              errorCode: "NoError",
              status: "Finishing"
            });

            // Wait 3 seconds then set back to Available
            setTimeout(async () => {
              await handleAction('StatusNotification', {
                connectorId,
                errorCode: "NoError",
                status: "Available"
              });
            }, 3000);
          }}
        >
          {loadingAction === 'StopTransaction' ? <span className="spinner" /> : <XSquare className="w-4 h-4" />}
          Stop Transaction
        </button>
      </div>

      {/* ── Force Stop ── always visible, for test cleanup ── */}
      <ForceStopSection tagId={tagId} connectorId={connectorId} showError={showError} showSuccess={showSuccess} />
    </div>
  );
};

interface ForceStopProps {
  tagId: string;
  connectorId: number;
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
}

const ForceStopSection: React.FC<ForceStopProps> = ({ tagId, connectorId, showError, showSuccess }) => {
  const [manualTxId, setManualTxId] = useState('');
  const [loading, setLoading] = useState(false);

  const handleForceStop = async () => {
    const txId = parseInt(manualTxId, 10);
    if (isNaN(txId) || txId <= 0) {
      showError('Enter a valid positive Transaction ID');
      return;
    }
    setLoading(true);
    try {
      await executeOcppAction('StopTransaction', {
        transactionId: txId,
        idTag: tagId,
        meterStop: 0,
        timestamp: new Date().toISOString(),
        reason: 'Local'
      });
      // also send StatusNotification Available
      await executeOcppAction('StatusNotification', {
        connectorId,
        errorCode: 'NoError',
        status: 'Finishing'
      });
      setTimeout(async () => {
        await executeOcppAction('StatusNotification', {
          connectorId,
          errorCode: 'NoError',
          status: 'Available'
        });
      }, 3000);
      showSuccess(`Force-stopped transaction #${txId}`);
      setManualTxId('');
    } catch (e: any) {
      showError(e.message || 'Force stop failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      marginTop: '1.25rem',
      padding: '1rem',
      borderRadius: '0.6rem',
      border: '1px dashed rgba(239, 68, 68, 0.4)',
      background: 'rgba(239, 68, 68, 0.05)'
    }}>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '0.6rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        <XSquare style={{ width: '0.9rem', height: '0.9rem', color: '#ef4444' }} />
        <span style={{ fontWeight: 600, color: '#ef4444' }}>Force Stop</span>
        <span>— manually close any transaction by ID</span>
      </div>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <input
          type="number"
          className="form-control"
          placeholder="Transaction ID"
          value={manualTxId}
          onChange={e => setManualTxId(e.target.value)}
          style={{ flex: 1, padding: '0.45rem 0.6rem', fontSize: '0.9rem' }}
          onKeyDown={e => e.key === 'Enter' && handleForceStop()}
        />
        <button
          className="btn btn-danger"
          disabled={loading || !manualTxId}
          onClick={handleForceStop}
          style={{ whiteSpace: 'nowrap', padding: '0.45rem 1rem' }}
        >
          {loading ? <span className="spinner" /> : <XSquare className="w-4 h-4" />}
          Stop
        </button>
      </div>
    </div>
  );
};
