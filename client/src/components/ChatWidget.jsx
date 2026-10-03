import React, { useState, useEffect, useRef } from 'react';

export default function ChatWidget({ apiBase = 'http://localhost:5000/api' }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState('');
  const messagesEndRef = useRef(null);

  // Initialize unique session ID per tab and restore history from sessionStorage
  useEffect(() => {
    let sid = sessionStorage.getItem('clinic_chat_session_id');
    if (!sid) {
      sid = `web-session-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      sessionStorage.setItem('clinic_chat_session_id', sid);
    }
    setSessionId(sid);

    const savedMsgs = sessionStorage.getItem(`clinic_chat_msgs_${sid}`);
    if (savedMsgs) {
      try {
        setMessages(JSON.parse(savedMsgs));
      } catch (e) {
        console.error('Failed to parse saved chat history:', e);
      }
    } else {
      const initial = [
        {
          id: 1,
          sender: 'agent',
          text: '🩺 Hello! Welcome to Clinic Front-Desk. How can I assist you today? You can book appointments, check insurance, or submit intake symptoms.',
          agentName: 'Router',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ];
      setMessages(initial);
      sessionStorage.setItem(`clinic_chat_msgs_${sid}`, JSON.stringify(initial));
    }
  }, []);

  // Save messages to sessionStorage whenever updated
  useEffect(() => {
    if (sessionId && messages.length > 0) {
      sessionStorage.setItem(`clinic_chat_msgs_${sessionId}`, JSON.stringify(messages));
    }
  }, [messages, sessionId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userText = input.trim();
    setInput('');

    const userMsg = {
      id: Date.now(),
      sender: 'user',
      text: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    setMessages((prev) => [...prev, userMsg]);
    setLoading(true);

    try {
      const res = await fetch(`${apiBase}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userText,
          sessionId,
        }),
      });

      const data = await res.json();

      const agentMsg = {
        id: Date.now() + 1,
        sender: 'agent',
        text: data.reply || data.error || 'Request processed.',
        agentName: data.agentName || 'Agent',
        intent: data.intent,
        confidence: data.confidence,
        toolCalls: data.toolCalls || [],
        escalated: data.escalated,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      setMessages((prev) => [...prev, agentMsg]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now() + 1,
          sender: 'agent',
          text: '⚠️ Unable to connect to server. Please try again shortly.',
          agentName: 'System',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="chat-widget-container">
      <div className="chat-header">
        <div className="chat-title">
          <span className="dot-online"></span>
          <span>Clinic Front-Desk Agent</span>
        </div>
        <div className="session-tag">Session: {sessionId.slice(-6)}</div>
      </div>

      <div className="chat-messages">
        {messages.map((msg) => (
          <div key={msg.id} className={`message-row ${msg.sender}`}>
            <div className="message-bubble">
              {msg.sender === 'agent' && (
                <div className="agent-meta">
                  <span className="agent-badge">{msg.agentName}</span>
                  {msg.intent && <span className="intent-badge">{msg.intent}</span>}
                  {msg.escalated && <span className="escalated-badge">Escalated to Staff</span>}
                </div>
              )}
              <p className="message-text">{msg.text}</p>
              {msg.toolCalls && msg.toolCalls.length > 0 && (
                <div className="tool-calls-preview">
                  {msg.toolCalls.map((tc, idx) => (
                    <span key={idx} className="tool-pill">
                      🔧 {tc.toolName}
                    </span>
                  ))}
                </div>
              )}
              <span className="msg-time">{msg.timestamp}</span>
            </div>
          </div>
        ))}
        {loading && (
          <div className="message-row agent">
            <div className="message-bubble loading">
              <span className="typing-indicator">Agent thinking...</span>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <form className="chat-input-form" onSubmit={handleSendMessage}>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask to book appointment, check insurance, or submit intake..."
          disabled={loading}
        />
        <button type="submit" disabled={loading || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
