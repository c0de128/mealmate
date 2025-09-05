import { Request, Response, NextFunction } from 'express';
import { logger, performanceLogger, errorLogger, securityLogger } from './logger';
import os from 'os';

// Error tracking and metrics collection
interface ErrorMetric {
  timestamp: string;
  error: string;
  stack?: string;
  endpoint: string;
  method: string;
  statusCode: number;
  userAgent?: string;
  ip: string;
  responseTime: number;
  requestId?: string;
}

interface PerformanceMetric {
  timestamp: string;
  endpoint: string;
  method: string;
  responseTime: number;
  statusCode: number;
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: NodeJS.CpuUsage;
}

interface SecurityEvent {
  timestamp: string;
  type: string;
  endpoint: string;
  ip: string;
  userAgent?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: any;
}

// In-memory storage for metrics (in production, use Redis/Database)
class MetricsStore {
  private errors: ErrorMetric[] = [];
  private performance: PerformanceMetric[] = [];
  private security: SecurityEvent[] = [];
  private readonly maxEntries = 10000; // Keep last 10k entries

  addError(error: ErrorMetric) {
    this.errors.push(error);
    if (this.errors.length > this.maxEntries) {
      this.errors = this.errors.slice(-this.maxEntries);
    }
  }

  addPerformance(metric: PerformanceMetric) {
    this.performance.push(metric);
    if (this.performance.length > this.maxEntries) {
      this.performance = this.performance.slice(-this.maxEntries);
    }
  }

  addSecurity(event: SecurityEvent) {
    this.security.push(event);
    if (this.security.length > this.maxEntries) {
      this.security = this.security.slice(-this.maxEntries);
    }
  }

  getErrors(limit = 100) {
    return this.errors.slice(-limit).reverse();
  }

  getPerformance(limit = 100) {
    return this.performance.slice(-limit).reverse();
  }

  getSecurity(limit = 100) {
    return this.security.slice(-limit).reverse();
  }

  getStats() {
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    const oneDay = 24 * oneHour;

    return {
      errors: {
        total: this.errors.length,
        lastHour: this.errors.filter(e => now - new Date(e.timestamp).getTime() < oneHour).length,
        lastDay: this.errors.filter(e => now - new Date(e.timestamp).getTime() < oneDay).length
      },
      performance: {
        total: this.performance.length,
        avgResponseTime: this.performance.length > 0 
          ? this.performance.reduce((sum, p) => sum + p.responseTime, 0) / this.performance.length 
          : 0,
        slowRequests: this.performance.filter(p => p.responseTime > 1000).length
      },
      security: {
        total: this.security.length,
        lastHour: this.security.filter(e => now - new Date(e.timestamp).getTime() < oneHour).length,
        critical: this.security.filter(e => e.severity === 'critical').length
      }
    };
  }
}

export const metricsStore = new MetricsStore();

// Error tracking middleware
export const errorTrackingMiddleware = (err: any, req: Request, res: Response, next: NextFunction) => {
  const startTime = (req as any).startTime || Date.now();
  const responseTime = Date.now() - startTime;

  const errorMetric: ErrorMetric = {
    timestamp: new Date().toISOString(),
    error: err.message,
    stack: err.stack,
    endpoint: req.originalUrl,
    method: req.method,
    statusCode: err.statusCode || 500,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    responseTime,
    requestId: (req as any).requestId
  };

  // Store error metric
  metricsStore.addError(errorMetric);

  // Log error with context
  errorLogger.error('Request Error', {
    ...errorMetric,
    userId: (req as any).user?.id,
    sessionId: (req as any).sessionID
  });

  // Alert on critical errors
  if (err.statusCode >= 500) {
    logger.error('Critical Error Alert', {
      error: err.message,
      endpoint: req.originalUrl,
      stack: err.stack,
      requestId: (req as any).requestId
    });
  }

  next(err);
};

// Performance monitoring middleware
export const performanceMonitoringMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  const startCpuUsage = process.cpuUsage();

  // Store initial values
  (req as any).startTime = startTime;
  (req as any).startCpuUsage = startCpuUsage;

  res.on('finish', () => {
    const responseTime = Date.now() - startTime;
    const cpuUsage = process.cpuUsage(startCpuUsage);
    const memoryUsage = process.memoryUsage();

    const performanceMetric: PerformanceMetric = {
      timestamp: new Date().toISOString(),
      endpoint: req.originalUrl,
      method: req.method,
      responseTime,
      statusCode: res.statusCode,
      memoryUsage,
      cpuUsage
    };

    // Store performance metric
    metricsStore.addPerformance(performanceMetric);

    // Log slow requests
    if (responseTime > 1000) {
      performanceLogger.warn('Slow Request', {
        ...performanceMetric,
        requestId: (req as any).requestId
      });
    }

    // Log performance metrics for API endpoints
    if (req.originalUrl.startsWith('/api/')) {
      performanceLogger.info('API Performance', {
        endpoint: req.originalUrl,
        method: req.method,
        responseTime,
        statusCode: res.statusCode,
        memoryUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024), // MB
        requestId: (req as any).requestId
      });
    }
  });

  next();
};

// Security monitoring middleware
export const securityMonitoringMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const suspiciousPatterns = [
    { pattern: /(\.\./|\.\.\\)/, severity: 'high' as const, type: 'Path Traversal' },
    { pattern: /(union\s+select|drop\s+table|delete\s+from)/i, severity: 'critical' as const, type: 'SQL Injection' },
    { pattern: /<script|javascript:|onload=|onerror=/i, severity: 'high' as const, type: 'XSS Attempt' },
    { pattern: /(\bexec\b|\beval\b|\bsystem\b)/i, severity: 'critical' as const, type: 'Code Injection' },
    { pattern: /(\bselect\b.*\bfrom\b.*\bwhere\b)/i, severity: 'medium' as const, type: 'Potential SQL Injection' }
  ];

  const fullUrl = req.originalUrl.toLowerCase();
  const userAgent = req.get('User-Agent') || '';
  
  // Check for suspicious patterns
  suspiciousPatterns.forEach(({ pattern, severity, type }) => {
    if (pattern.test(fullUrl) || pattern.test(userAgent)) {
      const securityEvent: SecurityEvent = {
        timestamp: new Date().toISOString(),
        type,
        endpoint: req.originalUrl,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        severity,
        details: {
          matchedPattern: pattern.toString(),
          requestMethod: req.method,
          requestId: (req as any).requestId
        }
      };

      metricsStore.addSecurity(securityEvent);
      
      securityLogger.warn(`Security Threat Detected: ${type}`, {
        ...securityEvent,
        body: req.method === 'POST' ? '[REDACTED]' : undefined
      });
    }
  });

  // Monitor failed authentication attempts
  if (req.path.includes('/auth') && req.method === 'POST') {
    res.on('finish', () => {
      if (res.statusCode === 401 || res.statusCode === 403) {
        const securityEvent: SecurityEvent = {
          timestamp: new Date().toISOString(),
          type: 'Failed Authentication',
          endpoint: req.originalUrl,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          severity: 'medium',
          details: {
            statusCode: res.statusCode,
            requestId: (req as any).requestId
          }
        };

        metricsStore.addSecurity(securityEvent);
        securityLogger.warn('Failed Authentication Attempt', securityEvent);
      }
    });
  }

  // Monitor for rate limiting violations
  const rateLimitRemaining = res.get('X-RateLimit-Remaining');
  if (rateLimitRemaining && parseInt(rateLimitRemaining) === 0) {
    const securityEvent: SecurityEvent = {
      timestamp: new Date().toISOString(),
      type: 'Rate Limit Exceeded',
      endpoint: req.originalUrl,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      severity: 'low',
      details: {
        limit: res.get('X-RateLimit-Limit'),
        requestId: (req as any).requestId
      }
    };

    metricsStore.addSecurity(securityEvent);
    securityLogger.info('Rate Limit Exceeded', securityEvent);
  }

  next();
};

// System metrics collection
export class SystemMetrics {
  private static instance: SystemMetrics;
  private metrics: any = {};
  private interval: NodeJS.Timeout | null = null;

  static getInstance() {
    if (!SystemMetrics.instance) {
      SystemMetrics.instance = new SystemMetrics();
    }
    return SystemMetrics.instance;
  }

  start() {
    // Collect system metrics every 30 seconds
    this.interval = setInterval(() => {
      this.collectMetrics();
    }, 30000);

    // Initial collection
    this.collectMetrics();
  }

  stop() {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
  }

  private collectMetrics() {
    const timestamp = new Date().toISOString();
    
    this.metrics = {
      timestamp,
      system: {
        uptime: os.uptime(),
        loadAverage: os.loadavg(),
        memory: {
          total: os.totalmem(),
          free: os.freemem(),
          used: os.totalmem() - os.freemem()
        },
        cpu: {
          count: os.cpus().length,
          usage: process.cpuUsage()
        }
      },
      process: {
        pid: process.pid,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        versions: process.versions
      },
      application: {
        environment: process.env.NODE_ENV,
        version: process.env.npm_package_version || '1.0.0',
        ...metricsStore.getStats()
      }
    };

    // Log system metrics
    logger.info('System Metrics', this.metrics);
  }

  getMetrics() {
    return this.metrics;
  }
}

// Monitoring dashboard endpoints
export const getMonitoringDashboard = async (req: Request, res: Response) => {
  try {
    const systemMetrics = SystemMetrics.getInstance();
    const recentErrors = metricsStore.getErrors(50);
    const recentPerformance = metricsStore.getPerformance(50);
    const recentSecurity = metricsStore.getSecurity(20);
    const stats = metricsStore.getStats();

    const dashboard = {
      timestamp: new Date().toISOString(),
      system: systemMetrics.getMetrics(),
      statistics: stats,
      recentEvents: {
        errors: recentErrors,
        performance: recentPerformance.filter(p => p.responseTime > 500), // Show only slower requests
        security: recentSecurity
      },
      alerts: generateAlerts(stats, recentErrors, recentSecurity)
    };

    res.json(dashboard);
  } catch (error: any) {
    logger.error('Monitoring dashboard error', { error: error.message });
    res.status(500).json({ error: 'Failed to generate monitoring dashboard' });
  }
};

// Generate alerts based on metrics
function generateAlerts(stats: any, errors: ErrorMetric[], security: SecurityEvent[]) {
  const alerts = [];

  // High error rate alert
  if (stats.errors.lastHour > 50) {
    alerts.push({
      type: 'error_rate',
      severity: 'critical',
      message: `High error rate: ${stats.errors.lastHour} errors in the last hour`,
      timestamp: new Date().toISOString()
    });
  }

  // Slow performance alert
  if (stats.performance.avgResponseTime > 2000) {
    alerts.push({
      type: 'slow_performance',
      severity: 'warning',
      message: `Average response time is ${Math.round(stats.performance.avgResponseTime)}ms`,
      timestamp: new Date().toISOString()
    });
  }

  // Security threat alert
  const criticalSecurityEvents = security.filter(e => e.severity === 'critical');
  if (criticalSecurityEvents.length > 0) {
    alerts.push({
      type: 'security_threat',
      severity: 'critical',
      message: `${criticalSecurityEvents.length} critical security events detected`,
      timestamp: new Date().toISOString(),
      events: criticalSecurityEvents.slice(0, 5)
    });
  }

  return alerts;
}

// Initialize system metrics
export const initializeMonitoring = () => {
  const systemMetrics = SystemMetrics.getInstance();
  systemMetrics.start();
  
  logger.info('Monitoring system initialized', {
    metricsInterval: '30s',
    maxStoredEntries: 10000
  });
};

// Cleanup monitoring
export const shutdownMonitoring = () => {
  const systemMetrics = SystemMetrics.getInstance();
  systemMetrics.stop();
  
  logger.info('Monitoring system shutdown');
};