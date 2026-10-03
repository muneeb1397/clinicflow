import React, { useState, useEffect } from 'react';

export default function StaffDashboard({ apiBase = import.meta.env.VITE_API_URL || 'http://localhost:5000/api' }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginForm, setLoginForm] = useState({ username: 'staff@clinic.com', password: 'demo123' });
  const [loginError, setLoginError] = useState('');

  const [appointments, setAppointments] = useState([]);
  const [traces, setTraces] = useState([]);
  const [selectedSummary, setSelectedSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('appointments'); // 'appointments' | 'traces'

  // Poll appointments and traces every 3 seconds
  useEffect(() => {
    if (!isAuthenticated) return;

    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [isAuthenticated]);

  const fetchData = async () => {
    try {
      const [apptsRes, tracesRes] = await Promise.all([
        fetch(`${apiBase}/staff/appointments`),
        fetch(`${apiBase}/traces`),
      ]);
      const apptsData = await apptsRes.json();
      const tracesData = await tracesRes.json();
      if (Array.isArray(apptsData)) setAppointments(apptsData);
      if (Array.isArray(tracesData)) setTraces(tracesData);
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await fetch(`${apiBase}/staff/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIsAuthenticated(true);
      } else {
        setLoginError(data.error || 'Login failed');
      }
    } catch (err) {
      setLoginError('Server error logging in');
    }
  };

  const handleApprove = async (id) => {
    try {
      await fetch(`${apiBase}/staff/approve/${id}`, { method: 'POST' });
      fetchData();
    } catch (err) {
      console.error('Approve failed:', err);
    }
  };

  const handleOverride = async (id) => {
    try {
      await fetch(`${apiBase}/staff/override/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'override', status: 'cancelled' }),
      });
      fetchData();
    } catch (err) {
      console.error('Override failed:', err);
    }
  };

  const handleViewSummary = async (appt) => {
    if (appt.summary) {
      setSelectedSummary({ appointmentId: appt._id, summary: appt.summary, patientName: appt.patient?.name });
      return;
    }
    setSummaryLoading(true);
    try {
      const res = await fetch(`${apiBase}/staff/summary/${appt._id}`, { method: 'POST' });
      const data = await res.json();
      setSelectedSummary({
        appointmentId: appt._id,
        summary: data.summary,
        patientName: appt.patient?.name,
      });
      fetchData();
    } catch (err) {
      console.error('Failed to generate summary:', err);
    } finally {
      setSummaryLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="login-modal-overlay">
        <div className="login-card">
          <h2>🔒 Staff Dashboard Login</h2>
          <p>Please enter demo credentials to access staff approvals and trace panel.</p>
          {loginError && <div className="login-error-alert">{loginError}</div>}
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label>Email / Username</label>
              <input
                type="text"
                value={loginForm.username}
                onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                required
              />
            </div>
            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                value={loginForm.password}
                onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                required
              />
            </div>
            <button type="submit" className="btn-primary">
              Log In as Staff
            </button>
          </form>
          <span className="demo-hint">Demo credentials: staff@clinic.com / demo123</span>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <div className="dashboard-nav-tabs">
          <button
            className={`tab-btn ${activeTab === 'appointments' ? 'active' : ''}`}
            onClick={() => setActiveTab('appointments')}
          >
            📋 Appointments ({appointments.length})
          </button>
          <button
            className={`tab-btn ${activeTab === 'traces' ? 'active' : ''}`}
            onClick={() => setActiveTab('traces')}
          >
            🕵️ Agent Traces ({traces.length})
          </button>
        </div>
        <button className="btn-secondary" onClick={() => setIsAuthenticated(false)}>
          Log Out
        </button>
      </div>

      {activeTab === 'appointments' && (
        <div className="dashboard-section">
          <h2>Appointments & Human-in-the-loop Approval</h2>
          <div className="table-responsive">
            <table className="dashboard-table">
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Doctor</th>
                  <th>Date & Time</th>
                  <th>Reason</th>
                  <th>Status</th>
                  <th>Staff Approval</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {appointments.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="empty-table">
                      No appointments created yet. Use the chat widget to book an appointment!
                    </td>
                  </tr>
                ) : (
                  appointments.map((appt) => (
                    <tr key={appt._id}>
                      <td>
                        <strong>{appt.patient?.name || 'Patient'}</strong>
                        <div className="sub-text">{appt.patient?.email}</div>
                      </td>
                      <td>{appt.doctor?.name} ({appt.doctor?.specialty})</td>
                      <td>{appt.slot?.startTime ? new Date(appt.slot.startTime).toLocaleString() : 'N/A'}</td>
                      <td>{appt.reason || 'Consultation'}</td>
                      <td>
                        <span className={`status-pill status-${appt.status}`}>{appt.status}</span>
                      </td>
                      <td>
                        {appt.approvedByStaff ? (
                          <span className="approved-tag">✅ Approved</span>
                        ) : (
                          <span className="pending-tag">⏳ Pending Approval</span>
                        )}
                      </td>
                      <td className="action-cell">
                        <button
                          className="btn-approve"
                          onClick={() => handleApprove(appt._id)}
                          disabled={appt.approvedByStaff}
                        >
                          Approve
                        </button>
                        <button
                          className="btn-override"
                          onClick={() => handleOverride(appt._id)}
                        >
                          Override
                        </button>
                        <button
                          className="btn-summary"
                          onClick={() => handleViewSummary(appt)}
                        >
                          Summary
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'traces' && (
        <div className="dashboard-section">
          <h2>Live Agent Trace Panel</h2>
          <p className="sub-header">Shows agent hand-offs, Router confidence, specialist agents, and tool calls in order.</p>
          <div className="trace-list">
            {traces.length === 0 ? (
              <div className="empty-table">No agent traces logged yet.</div>
            ) : (
              traces.map((trace) => (
                <div key={trace._id} className="trace-card">
                  <div className="trace-header">
                    <span className={`agent-badge agent-${trace.agentName?.toLowerCase()}`}>
                      🤖 {trace.agentName}
                    </span>
                    <span className="intent-tag">Intent: {trace.intent || 'N/A'}</span>
                    {trace.confidence !== undefined && (
                      <span className="conf-tag">Conf: {(trace.confidence * 100).toFixed(0)}%</span>
                    )}
                    <span className="trace-time">{new Date(trace.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div className="trace-body">
                    <p><strong>Input:</strong> "{trace.input}"</p>
                    <p><strong>Output:</strong> {trace.output}</p>
                    {trace.toolCalls && trace.toolCalls.length > 0 && (
                      <div className="trace-tools">
                        <strong>Tool Calls:</strong>
                        {trace.toolCalls.map((tc, i) => (
                          <div key={i} className="tool-call-detail">
                            <code>{tc.toolName}({JSON.stringify(tc.args)})</code>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {selectedSummary && (
        <div className="modal-overlay" onClick={() => setSelectedSummary(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3>📄 Pre-Visit Summary: {selectedSummary.patientName}</h3>
            <pre className="summary-pre">{selectedSummary.summary}</pre>
            <button className="btn-primary" onClick={() => setSelectedSummary(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
