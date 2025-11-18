import http from 'http';
import type { Logger } from '../utils/logger.util';
import type { Database } from './database';

export type HealthCheckConfig = {
  port: number;
  logger: Logger;
  database?: Database;
  getMetrics?: () => Record<string, unknown>;
};

export type HealthStatus = {
  status: 'healthy' | 'unhealthy';
  uptime: number;
  timestamp: string;
  database: 'connected' | 'disconnected' | 'not_configured';
  metrics?: Record<string, unknown>;
};

export class HealthCheckServer {
  private server?: http.Server;
  private config: HealthCheckConfig;
  private startTime: number;

  constructor(config: HealthCheckConfig) {
    this.config = config;
    this.startTime = Date.now();
  }

  start(): void {
    this.server = http.createServer((req, res) => {
      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET');
      res.setHeader('Content-Type', 'application/json');

      if (req.url === '/health' && req.method === 'GET') {
        this.handleHealthCheck(req, res);
      } else if (req.url === '/metrics' && req.method === 'GET') {
        this.handleMetrics(req, res);
      } else {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Not found' }));
      }
    });

    this.server.listen(this.config.port, () => {
      this.config.logger.info(`Health check server listening on port ${this.config.port}`, {
        endpoints: [
          `http://localhost:${this.config.port}/health`,
          `http://localhost:${this.config.port}/metrics`,
        ],
      });
    });

    this.server.on('error', (err) => {
      this.config.logger.error('Health check server error', err);
    });
  }

  stop(): void {
    if (this.server) {
      this.server.close(() => {
        this.config.logger.info('Health check server stopped');
      });
    }
  }

  private handleHealthCheck(req: http.IncomingMessage, res: http.ServerResponse): void {
    const dbStatus = this.config.database
      ? this.config.database.isActive()
        ? 'connected'
        : 'disconnected'
      : 'not_configured';

    const health: HealthStatus = {
      status: 'healthy',
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      timestamp: new Date().toISOString(),
      database: dbStatus,
    };

    res.writeHead(200);
    res.end(JSON.stringify(health, null, 2));
  }

  private handleMetrics(req: http.IncomingMessage, res: http.ServerResponse): void {
    const metrics = this.config.getMetrics ? this.config.getMetrics() : {};

    const response = {
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime) / 1000),
      ...metrics,
    };

    res.writeHead(200);
    res.end(JSON.stringify(response, null, 2));
  }
}
