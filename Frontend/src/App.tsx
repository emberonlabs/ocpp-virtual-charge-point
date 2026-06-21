
import { useEffect, useState } from 'react';
import { ActionControl } from './components/ActionControl';
import { LogViewer } from './components/LogViewer';
import { LoginPage } from './components/LoginPage';
import { ToastProvider } from './components/Toast';
import { Zap, LogOut } from 'lucide-react';
import { fetchStatus, clearAuthToken } from './services/api';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return sessionStorage.getItem('vcp_authenticated') === 'true';
  });
  const [adminApiReachable, setAdminApiReachable] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    const check = async () => {
      try {
        const status = await fetchStatus();
        setAdminApiReachable(!!status);
      } catch (e) {
        setAdminApiReachable(false);
      }
    };
    check();
    const interval = setInterval(check, 5000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const handleLogout = () => {
    clearAuthToken();
    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return <LoginPage onLogin={() => setIsAuthenticated(true)} />;
  }

  return (
    <ToastProvider>
    <div className="app-container">
      <div className="left-sidebar">
        <div className="glass-panel" style={{ padding: '1.25rem', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
            <div style={{ background: 'var(--primary)', padding: '0.5rem', borderRadius: '0.5rem' }}>
              <Zap className="w-6 h-6" style={{ color: 'white' }} />
            </div>
            <div style={{ flex: 1 }}>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Chargify VCP</h1>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>OCPP 1.6 Simulator</span>
            </div>
            <button
              onClick={handleLogout}
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: '#ef4444',
                padding: '0.35rem',
                borderRadius: '0.375rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'all 0.2s'
              }}
              title="Logout"
            >
              <LogOut style={{ width: 16, height: 16 }} />
            </button>
          </div>
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span className={`status-badge ${adminApiReachable ? 'connected' : 'disconnected'}`}>
              ● Admin API {adminApiReachable ? 'Active' : 'Unreachable'}
            </span>
          </div>
        </div>

        {/* Scrollable container for controls */}
        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: '1.5rem' }} className="hide-scrollbar">
          <ActionControl />
        </div>
      </div>

      <div className="main-content">
        {/* Terminal Logs Main Panel */}
        <LogViewer />
      </div>
    </div>
    </ToastProvider>
  );
}

export default App;
