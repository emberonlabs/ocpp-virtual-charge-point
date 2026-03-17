import React, { useEffect, useRef, useState } from 'react';
import { Terminal, Trash2 } from 'lucide-react';
import { fetchLogs, clearLogs, type LogEntry } from '../services/api';
import { useToast } from './Toast';

export const LogViewer: React.FC = () => {
  const { showError } = useToast();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Poll the logs endpoint every 500ms for real-time feel
    const interval = setInterval(async () => {
      try {
        const newLogs = await fetchLogs();
        setLogs(newLogs);
      } catch {
        // silently skip — connection lost is reported by ActionControl's status poll
      }
    }, 500);

    return () => clearInterval(interval);
  }, []);

  // auto scroll to bottom
  useEffect(() => {
    if (autoScroll && terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleClearLogs = async () => {
    try {
      await clearLogs();
      setLogs([]);
    } catch {
      showError('Failed to clear logs');
    }
  };

  const formatMessageLog = (rawMsg: string) => {
    // Aggressive ANSI escape code removal
    // eslint-disable-next-line no-control-regex
    let logMsg = rawMsg.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
    
    // Sometimes colorize adds [32m etc without the escape character if it was partially stripped
    logMsg = logMsg.replace(/\[\d+m/g, '');

    if (logMsg.includes('➡️')) {
       const parts = logMsg.split('➡️');
       const payload = parts[1].trim();
       return <><span className="log-direction-out">➡️OUT</span> <span className="log-payload">{payload}</span></>;
    } else if (logMsg.includes('⬅️')) {
       const parts = logMsg.split('⬅️');
       const payload = parts[1].trim();
       return <><span className="log-direction-in">⬅️IN </span> <span className="log-payload">{payload}</span></>;
    }
    return logMsg;
  };

  return (
    <div className="glass-panel" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
      <div className="panel-header" style={{ marginBottom: '0.75rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Terminal className="w-5 h-5" />
          Real-time Protocol Terminal
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button 
            onClick={handleClearLogs}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid var(--panel-border)',
              color: 'var(--text-secondary)',
              padding: '0.2rem 0.6rem',
              borderRadius: '0.375rem',
              fontSize: '0.7rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.25rem',
              fontWeight: '600',
              textTransform: 'uppercase',
              transition: 'all 0.2s'
            }}
            title="Clear Terminal"
          >
            <Trash2 className="w-3 h-3" /> Clear
          </button>
          <button 
            onClick={() => setAutoScroll(!autoScroll)}
            style={{
              background: autoScroll ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
              border: `1px solid ${autoScroll ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
              color: autoScroll ? '#22c55e' : '#ef4444',
              padding: '0.2rem 0.6rem',
              borderRadius: '0.375rem',
              fontSize: '0.7rem',
              cursor: 'pointer',
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: '0.025em',
              transition: 'all 0.2s',
              zIndex: 10
            }}
          >
            Auto-scroll: {autoScroll ? 'ON' : 'OFF'}
          </button>
        </div>
      </div>
      
      <div className="log-terminal" ref={terminalRef} style={{ flex: 1 }}>
        {logs.map((log, i) => (
          <div key={i} className="log-entry">
            <span className="log-time" title={log.timestamp}>
              {log.timestamp.split(' ')[1]}
            </span>
            <span className={`log-${log.level}`}>[{log.level.toUpperCase()}]</span>
            <span>{formatMessageLog(log.message)}</span>
          </div>
        ))}
        {logs.length === 0 && (
          <div style={{ color: '#52525b', fontStyle: 'italic', padding: '1rem' }}>
            Waiting for connection and logs...
          </div>
        )}
      </div>
    </div>
  );
};
