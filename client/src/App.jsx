import React, { useEffect, useState } from 'react';

export default function App() {
  const [serverHealth, setServerHealth] = useState(null);

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
          <span>🩺</span> Clinic Agent Platform
        </div>
        <div className="status-badge">
          <span className="pulse"></span>
          <span>{serverHealth?.ok ? 'API Connected' : 'System Initialized'}</span>
        </div>
      </nav>

      <main className="hero">
        <h1>Clinic Front-Desk Multi-Agent System</h1>
        <p>
          AI-driven patient booking, intake, insurance verification, and automated reminders with human-in-the-loop staff approval.
        </p>

        <div className="card-grid">
          <div className="card">
            <h3>🤖 Router Agent</h3>
            <p>Classifies incoming patient intents and routes requests smoothly.</p>
          </div>
          <div className="card">
            <h3>📅 Scheduler Agent</h3>
            <p>Lists doctor availability and manages real-time appointments.</p>
          </div>
          <div className="card">
            <h3>📋 Intake Agent</h3>
            <p>Conversational symptom & history intake into structured JSON.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
