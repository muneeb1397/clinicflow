import React, { useEffect, useState } from 'react';
import ChatWidget from './components/ChatWidget';
import StaffDashboard from './components/StaffDashboard';

export default function App() {
  const [serverHealth, setServerHealth] = useState(null);
  const [currentView, setCurrentView] = useState('patient'); // 'patient' | 'staff'

  useEffect(() => {
    fetch('http://localhost:5000/health')
      .then((res) => res.json())
      .then((data) => setServerHealth(data))
      .catch((err) => console.log('Server not reachable yet:', err.message));
  }, []);

  return (
    <div className="app-container">
      <nav className="navbar">
        <div className="brand">
          <span>🩺</span> Clinic Front-Desk Agent
        </div>
        <div className="nav-controls">
          <button
            className={`nav-mode-btn ${currentView === 'patient' ? 'active' : ''}`}
            onClick={() => setCurrentView('patient')}
          >
            💬 Patient Web Chat
          </button>
          <button
            className={`nav-mode-btn ${currentView === 'staff' ? 'active' : ''}`}
            onClick={() => setCurrentView('staff')}
          >
            👩‍⚕️ Staff Dashboard
          </button>
          <div className="status-badge">
            <span className="pulse"></span>
            <span>{serverHealth?.ok ? 'API Online' : 'Connecting...'}</span>
          </div>
        </div>
      </nav>

      <main className="main-content">
        {currentView === 'patient' ? (
          <div className="patient-view-layout">
            <div className="patient-intro">
              <h1>Clinic Assistant</h1>
              <p>
                Book appointments, submit symptom intakes, check insurance coverage, and receive reminders in under 60 seconds.
              </p>
              <div className="info-chips">
                <span className="chip">⚡ Under 60s Booking</span>
                <span className="chip">🛡️ Safe & Private</span>
                <span className="chip">👨‍⚕️ Human-in-the-Loop</span>
              </div>
            </div>
            <ChatWidget />
          </div>
        ) : (
          <StaffDashboard />
        )}
      </main>
    </div>
  );
}
