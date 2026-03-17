import React, { useEffect, useRef, useState } from 'react';
import { Terminal, Trash2, AlertCircle } from 'lucide-react';
import { fetchLogs, clearLogs, type LogEntry } from '../services/api';
import { useToast } from './Toast';

export const LogViewer: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [isTabVisible, setIsTabVisible] = useState(true);
  const terminalRef = useRef<HTMLDivElement>(null);
  const lastLogRef = useRef<string>('');
  const { showError } = useToast();

  // Track tab visibility
  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsTabVisible(document.visibilityState === 'visible');
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  useEffect(() => {
    if (!isTabVisible) return;

    const interval = setInterval(async () => {
      try {
        const newLogs = await fetchLogs();
        
        // Skip re-render if logs haven't changed
        if (newLogs.length === logs.length) {
          const newLastLog = newLogs.length > 0 ? `${newLogs[newLogs.length - 1].timestamp}-${newLogs[newLogs.length - 1].message}` : '';
          if (newLastLog === lastLogRef.current) return;
        }

        if (newLogs.length > 0) {
          lastLogRef.current = `${newLogs[newLogs.length - 1].timestamp}-${newLogs[newLogs.length - 1].message}`;
        } else {
          lastLogRef.current = '';
        }
        
        setLogs(newLogs);
      } catch (error) {
        // We don't toast on every poll failure to avoid spam, just log to console
        console.error("Failed to fetch logs:", error);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [isTabVisible, logs.length]);

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
      lastLogRef.current = '';
    } catch (e) {
      showError('Failed to clear terminal logs');
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
          {logs.length >= 100 && (
            <span style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.25rem', 
              fontSize: '0.65rem', 
              color: 'var(--text-secondary)',
              background: 'rgba(255, 255, 255, 0.05)',
              padding: '0.1rem 0.4rem',
              borderRadius: '4px',
              marginLeft: '0.5rem'
            }} title="The buffer is limited to the last 100 entries to maintain performance.">
              <AlertCircle className="w-3 h-3" /> Buffer Full
            </span>
          )}
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
            <span className="log-time">
              {log.timestamp.split(' ')[1]}
            </span>
            <span className={`log-level-tag log-${log.level}`}>[{log.level.toUpperCase()}]</span>
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
