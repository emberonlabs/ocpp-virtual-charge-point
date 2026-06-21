import React, { useState } from 'react';
import { Zap, Lock, User, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { login, setAuthToken } from '../services/api';

interface LoginPageProps {
  onLogin: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [isShaking, setIsShaking] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const result = await login(username, password);
      setAuthToken(result.token);
      sessionStorage.setItem('vcp_authenticated', 'true');
      onLogin();
    } catch (err: any) {
      const message = err.response?.status === 401
        ? 'Invalid username or password'
        : err.response?.data?.error || 'Unable to reach the server';
      setError(message);
      setIsShaking(true);
      setTimeout(() => setIsShaking(false), 600);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-page">
      {/* Animated background orbs */}
      <div className="login-orb login-orb-1" />
      <div className="login-orb login-orb-2" />
      <div className="login-orb login-orb-3" />

      <div className={`login-card ${isShaking ? 'login-shake' : ''}`}>
        {/* Logo / branding */}
        <div className="login-header">
          <div className="login-logo">
            <div className="login-logo-icon">
              <Zap style={{ width: 28, height: 28, color: '#fff' }} />
            </div>
            <div className="login-logo-glow" />
          </div>
          <h1 className="login-title">Chargify VCP</h1>
          <p className="login-subtitle">OCPP 1.6 Virtual Charge Point Simulator</p>
        </div>

        {/* Error message */}
        {error && (
          <div className="login-error">
            <AlertCircle style={{ width: 16, height: 16, flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Login form */}
        <form onSubmit={handleSubmit} className="login-form">
          <div className="login-field">
            <label htmlFor="login-username">Username</label>
            <div className="login-input-wrapper">
              <User style={{ width: 16, height: 16 }} className="login-input-icon" />
              <input
                id="login-username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter username"
                autoComplete="username"
                autoFocus
              />
            </div>
          </div>

          <div className="login-field">
            <label htmlFor="login-password">Password</label>
            <div className="login-input-wrapper">
              <Lock style={{ width: 16, height: 16 }} className="login-input-icon" />
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter password"
                autoComplete="current-password"
              />
              <button
                type="button"
                className="login-toggle-password"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword
                  ? <EyeOff style={{ width: 16, height: 16 }} />
                  : <Eye style={{ width: 16, height: 16 }} />
                }
              </button>
            </div>
          </div>

          <button type="submit" className="login-submit" disabled={isLoading}>
            {isLoading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>

        <p className="login-footer">
          Secure access to the simulator dashboard
        </p>
      </div>
    </div>
  );
};
