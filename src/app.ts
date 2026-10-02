import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import customerRoutes from './routes/customerRoutes.js';
import callRoutes from './routes/callRoutes.js';
import webhookRoutes from './routes/webhookRoutes.js';

export function createApp(): Express {
  const app = express();

  // Basic security and parsing middlewares
  app.use(cors());
  app.use(express.json());
  // Twilio sends webhook payloads as application/x-www-form-urlencoded
  app.use(express.urlencoded({ extended: true }));

  // Serve static files for Dashboard UI
  const publicDir = path.resolve(process.cwd(), 'src/public');
  app.use(express.static(publicDir));

  // Health check endpoint
  app.get('/api/health', (req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'autopay-recovery-voice-agent',
      timestamp: new Date().toISOString(),
    });
  });

  // API Routes
  app.use('/api/customers', customerRoutes);
  app.use('/api/calls', callRoutes);
  app.use('/api/webhooks', webhookRoutes);

  // Global 404 handler for unknown API routes
  app.use('/api/*', (req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: `API Route not found: ${req.method} ${req.originalUrl}`,
    });
  });

  // Global Error Handler
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    console.error('[App] Unhandled Error:', err);
    res.status(500).json({
      success: false,
      error: 'Internal server error occurred',
      message: process.env.NODE_ENV === 'development' ? err.message : undefined,
    });
  });

  return app;
}
