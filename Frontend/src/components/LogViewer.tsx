import React, { useEffect, useRef, useState } from 'react';
import { Terminal } from 'lucide-react';
import { fetchLogs, type LogEntry } from '../services/api';

export const LogViewer: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const terminalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Poll the logs endpoint every 2 seconds
    const interval = setInterval(async () => {
      const newLogs = await fetchLogs();
      if (newLogs.length > 0) {
        setLogs(() => {
          // Add only new logs. Since backend returns all stored, we might get duplicates if we just append.
          // Very simple logic here: just overwrite local state with backend state, assuming backend maintains a circular buffer
          // For realtime experience we assume backend `getDiagnosticData` returns the history.
          return newLogs;
        });
      }
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  // auto scroll to bottom
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [logs]);

  const formatMessageLog = (rawMsg: string) => {
    // Remove ANSI escape codes (like [32m) from the string before processing
    // eslint-disable-next-line no-control-regex
    const logMsg = rawMsg.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');

    if (logMsg.includes('➡️')) {
       const parts = logMsg.split('➡️');
       return <><span className="log-direction-out">➡️OUT</span> {parts[1]}</>;
    } else if (logMsg.includes('⬅️')) {
       const parts = logMsg.split('⬅️');
       return <><span className="log-direction-in">⬅️IN </span> {parts[1]}</>;
    }
    return logMsg;
  };

  return (
    <div className="glass-panel" style={{ flex: 1, minHeight: 0 }}>
      <div className="panel-header" style={{ marginBottom: '0.75rem' }}>
        <Terminal className="w-5 h-5" />
        Real-time Protocol Terminal
      </div>
      
      <div className="log-terminal" ref={terminalRef}>
        {logs.map((log, i) => (
          <div key={i} className="log-entry">
            <span className="log-time">
              {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute:'2-digit', second:'2-digit' })}
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
