import { createApp } from './app.js';
import { config, logConfigSummary } from './config/env.js';

const app = createApp();

const server = app.listen(config.port, () => {
  logConfigSummary();
  console.log(`Server listening on port ${config.port}`);
  console.log(`Dashboard: http://localhost:${config.port}`);
  console.log(`Health Check: http://localhost:${config.port}/api/health`);
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('HTTP server closed');
  });
});
