import http from 'http';
import app from './index.js';

const PORT = 5000;

app.listen(PORT, async () => {
  console.log(`Verification server running on http://localhost:${PORT}`);
  
  // Test curl http://localhost:5000/health
  http.get(`http://localhost:${PORT}/health`, (res) => {
    let data = '';
    res.on('data', (chunk) => (data += chunk));
    res.on('end', () => {
      console.log('GET /health response:', data);
      const parsed = JSON.parse(data);
      if (parsed.ok === true) {
        console.log('✅ GET /health check PASSED: { ok: true }');
      } else {
        console.error('❌ GET /health check FAILED');
      }
      process.exit(0);
    });
  }).on('error', (err) => {
    console.error('HTTP request error:', err);
    process.exit(1);
  });
});
