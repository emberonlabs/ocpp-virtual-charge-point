
import { ActionControl } from './components/ActionControl';
import { LogViewer } from './components/LogViewer';
import { Zap } from 'lucide-react';

function App() {
  return (
    <div className="app-container">
      <div className="left-sidebar">
        <div className="glass-panel" style={{ padding: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <div style={{ background: 'var(--primary)', padding: '0.5rem', borderRadius: '0.5rem' }}>
              <Zap className="w-6 h-6" style={{ color: 'white' }} />
            </div>
            <div>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Chargify VCP</h1>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>OCPP 1.6 Simulator</span>
            </div>
          </div>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span className="status-badge connected">● Admin API Active</span>
          </div>
        </div>

        {/* Action Controls Side Panel */}
        <ActionControl />
      </div>

      <div className="main-content">
        {/* Terminal Logs Main Panel */}
        <LogViewer />
      </div>
    </div>
  );
}

export default App;
