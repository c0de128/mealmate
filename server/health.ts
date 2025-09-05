import { Request, Response } from 'express';
import { logger, dbLogger, checkLoggerHealth } from './logger';
import { createStorage } from './storage';
import os from 'os';
import fs from 'fs/promises';
import path from 'path';

// Health check status types
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface ComponentHealth {
  status: HealthStatus;
  message: string;
  timestamp: string;
  responseTime?: number;
  details?: any;
}

export interface SystemHealth {
  status: HealthStatus;
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  components: {
    database: ComponentHealth;
    storage: ComponentHealth;
    logging: ComponentHealth;
    memory: ComponentHealth;
    disk: ComponentHealth;
    external: ComponentHealth;
  };
  metrics: {
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
    loadAverage: number[];
    processId: number;
    nodeVersion: string;
  };
}

// In-memory health status cache
let healthCache: SystemHealth | null = null;
let lastHealthCheck = 0;
const HEALTH_CACHE_TTL = 30000; // 30 seconds

// Database health check
async function checkDatabaseHealth(): Promise<ComponentHealth> {
  const start = Date.now();
  
  try {
    const storage = createStorage();
    
    // Try to perform a simple query
    if ('healthCheck' in storage && typeof storage.healthCheck === 'function') {
      await storage.healthCheck();
    } else {
      // Fallback: try to get recipes count
      const recipes = await storage.getRecipes();
      if (!Array.isArray(recipes)) {
        throw new Error('Invalid response from database');
      }
    }
    
    const responseTime = Date.now() - start;
    
    return {
      status: responseTime < 1000 ? 'healthy' : 'degraded',
      message: responseTime < 1000 ? 'Database responsive' : 'Database slow',
      timestamp: new Date().toISOString(),
      responseTime,
      details: {
        type: process.env.USE_DATABASE === 'true' ? 'PostgreSQL' : 'In-Memory',
        responseTimeMs: responseTime
      }
    };
  } catch (error: any) {
    return {
      status: 'unhealthy',
      message: `Database error: ${error.message}`,
      timestamp: new Date().toISOString(),
      responseTime: Date.now() - start,
      details: {
        error: error.message,
        type: process.env.USE_DATABASE === 'true' ? 'PostgreSQL' : 'In-Memory'
      }
    };
  }
}

// Storage system health check
async function checkStorageHealth(): Promise<ComponentHealth> {
  try {
    const storage = createStorage();
    
    // Check if we can create and delete a test entry
    const testRecipe = {
      name: 'Health Check Test',
      difficulty: 'easy' as const,
      ingredients: [{ name: 'test', quantity: '1', unit: 'test' }],
      instructions: 'Health check test recipe'
    };
    
    const created = await storage.createRecipe(testRecipe);
    await storage.deleteRecipe(created.id);
    
    return {
      status: 'healthy',
      message: 'Storage operations working',
      timestamp: new Date().toISOString(),
      details: {
        operations: ['create', 'delete'],
        testPassed: true
      }
    };
  } catch (error: any) {
    return {
      status: 'unhealthy',
      message: `Storage error: ${error.message}`,
      timestamp: new Date().toISOString(),
      details: {
        error: error.message,
        operations: ['create', 'delete'],
        testPassed: false
      }
    };
  }
}

// Logging system health check
async function checkLoggingHealth(): Promise<ComponentHealth> {
  try {
    const isHealthy = checkLoggerHealth();
    
    return {
      status: isHealthy ? 'healthy' : 'degraded',
      message: isHealthy ? 'Logging system operational' : 'Logging system issues',
      timestamp: new Date().toISOString(),
      details: {
        winston: isHealthy,
        logLevel: process.env.LOG_LEVEL || 'info',
        environment: process.env.NODE_ENV || 'development'
      }
    };
  } catch (error: any) {
    return {
      status: 'unhealthy',
      message: `Logging error: ${error.message}`,
      timestamp: new Date().toISOString(),
      details: {
        error: error.message
      }
    };
  }
}

// Memory health check
async function checkMemoryHealth(): Promise<ComponentHealth> {
  const memoryUsage = process.memoryUsage();
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const memoryUsagePercent = (usedMemory / totalMemory) * 100;
  
  // Memory thresholds
  const memoryWarningThreshold = 80; // 80%
  const memoryCriticalThreshold = 95; // 95%
  
  let status: HealthStatus = 'healthy';
  let message = 'Memory usage normal';
  
  if (memoryUsagePercent > memoryCriticalThreshold) {
    status = 'unhealthy';
    message = 'Critical memory usage';
  } else if (memoryUsagePercent > memoryWarningThreshold) {
    status = 'degraded';
    message = 'High memory usage';
  }
  
  return {
    status,
    message,
    timestamp: new Date().toISOString(),
    details: {
      processMemory: memoryUsage,
      systemMemory: {
        total: totalMemory,
        free: freeMemory,
        used: usedMemory,
        usagePercent: Math.round(memoryUsagePercent * 100) / 100
      }
    }
  };
}

// Disk health check
async function checkDiskHealth(): Promise<ComponentHealth> {
  try {
    const logsDir = path.join(process.cwd(), 'logs');
    
    // Check if we can write to the filesystem
    const testFile = path.join(logsDir, 'health-check.tmp');
    await fs.mkdir(logsDir, { recursive: true });
    await fs.writeFile(testFile, 'health check');
    await fs.unlink(testFile);
    
    // Get disk usage statistics (basic check)
    const stats = await fs.stat(process.cwd());
    
    return {
      status: 'healthy',
      message: 'Disk operations working',
      timestamp: new Date().toISOString(),
      details: {
        writeable: true,
        logsDirectory: logsDir,
        lastModified: stats.mtime
      }
    };
  } catch (error: any) {
    return {
      status: 'unhealthy',
      message: `Disk error: ${error.message}`,
      timestamp: new Date().toISOString(),
      details: {
        error: error.message,
        writeable: false
      }
    };
  }
}

// External services health check
async function checkExternalHealth(): Promise<ComponentHealth> {
  const services = [];
  
  // Check Mistral API if configured
  if (process.env.MISTRAL_API_KEY) {
    try {
      // Simple connectivity test - just check if we have the key
      services.push({
        name: 'Mistral API',
        status: 'healthy',
        message: 'API key configured'
      });
    } catch (error: any) {
      services.push({
        name: 'Mistral API',
        status: 'unhealthy',
        message: error.message
      });
    }
  }
  
  // Determine overall external status
  const unhealthyServices = services.filter(s => s.status === 'unhealthy');
  const degradedServices = services.filter(s => s.status === 'degraded');
  
  let status: HealthStatus = 'healthy';
  let message = 'All external services operational';
  
  if (unhealthyServices.length > 0) {
    status = 'unhealthy';
    message = `${unhealthyServices.length} external service(s) down`;
  } else if (degradedServices.length > 0) {
    status = 'degraded';
    message = `${degradedServices.length} external service(s) degraded`;
  }
  
  return {
    status,
    message,
    timestamp: new Date().toISOString(),
    details: {
      services,
      totalServices: services.length,
      healthyServices: services.filter(s => s.status === 'healthy').length
    }
  };
}

// Comprehensive system health check
export async function performHealthCheck(): Promise<SystemHealth> {
  // Return cached result if recent
  const now = Date.now();
  if (healthCache && (now - lastHealthCheck) < HEALTH_CACHE_TTL) {
    return healthCache;
  }
  
  const startTime = Date.now();
  const cpuUsageStart = process.cpuUsage();
  
  logger.debug('Starting comprehensive health check');
  
  // Run all health checks in parallel for better performance
  const [
    databaseHealth,
    storageHealth,
    loggingHealth,
    memoryHealth,
    diskHealth,
    externalHealth
  ] = await Promise.all([
    checkDatabaseHealth(),
    checkStorageHealth(),
    checkLoggingHealth(),
    checkMemoryHealth(),
    checkDiskHealth(),
    checkExternalHealth()
  ]);
  
  // Determine overall system status
  const components = {
    database: databaseHealth,
    storage: storageHealth,
    logging: loggingHealth,
    memory: memoryHealth,
    disk: diskHealth,
    external: externalHealth
  };
  
  const componentStatuses = Object.values(components).map(c => c.status);
  const hasUnhealthy = componentStatuses.includes('unhealthy');
  const hasDegraded = componentStatuses.includes('degraded');
  
  let overallStatus: HealthStatus = 'healthy';
  if (hasUnhealthy) {
    overallStatus = 'unhealthy';
  } else if (hasDegraded) {
    overallStatus = 'degraded';
  }
  
  const health: SystemHealth = {
    status: overallStatus,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    components,
    metrics: {
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(cpuUsageStart),
      loadAverage: os.loadavg(),
      processId: process.pid,
      nodeVersion: process.version
    }
  };
  
  // Cache the result
  healthCache = health;
  lastHealthCheck = now;
  
  const checkDuration = Date.now() - startTime;
  logger.info('Health check completed', {
    status: overallStatus,
    duration: checkDuration,
    components: componentStatuses
  });
  
  return health;
}

// Express route handlers
export const healthHandler = async (req: Request, res: Response) => {
  try {
    const health = await performHealthCheck();
    const statusCode = health.status === 'healthy' ? 200 :
                      health.status === 'degraded' ? 200 : 503;
    
    res.status(statusCode).json(health);
  } catch (error: any) {
    logger.error('Health check failed', { error: error.message, stack: error.stack });
    
    res.status(503).json({
      status: 'unhealthy',
      message: 'Health check failed',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
};

// Simple ping endpoint for load balancer health checks
export const pingHandler = (req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
};

// Readiness check - more strict than health check
export const readinessHandler = async (req: Request, res: Response) => {
  try {
    const health = await performHealthCheck();
    
    // System must be fully healthy to be ready
    if (health.status === 'healthy') {
      res.status(200).json({
        status: 'ready',
        timestamp: health.timestamp,
        version: health.version
      });
    } else {
      res.status(503).json({
        status: 'not_ready',
        message: 'System not fully operational',
        timestamp: health.timestamp,
        issues: Object.entries(health.components)
          .filter(([, component]) => component.status !== 'healthy')
          .map(([name, component]) => ({ component: name, status: component.status, message: component.message }))
      });
    }
  } catch (error: any) {
    res.status(503).json({
      status: 'not_ready',
      message: 'Readiness check failed',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
};

// Liveness check - basic check that application is running
export const livenessHandler = (req: Request, res: Response) => {
  res.status(200).json({
    status: 'alive',
    timestamp: new Date().toISOString(),
    pid: process.pid,
    uptime: process.uptime()
  });
};