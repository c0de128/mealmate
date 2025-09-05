import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

// Define log levels and colors
const logLevels = {
  error: 0,
  warn: 1, 
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6
};

const logColors = {
  error: 'red',
  warn: 'yellow',
  info: 'green', 
  http: 'magenta',
  verbose: 'grey',
  debug: 'white',
  silly: 'cyan'
};

winston.addColors(logColors);

// Create logs directory
const logsDir = path.join(process.cwd(), 'logs');

// Custom format for structured logging
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.prettyPrint()
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize({ all: true }),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
    let msg = `${timestamp} [${service || 'MealMate'}] ${level}: ${message}`;
    
    // Add metadata if present
    const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    if (metaStr) {
      msg += `\n${metaStr}`;
    }
    
    return msg;
  })
);

// Create transports based on environment
const createTransports = () => {
  const transports: winston.transport[] = [];
  
  // Console transport (always enabled in development)
  if (process.env.NODE_ENV !== 'production') {
    transports.push(
      new winston.transports.Console({
        level: process.env.LOG_LEVEL || 'debug',
        format: consoleFormat,
        handleExceptions: true,
        handleRejections: true
      })
    );
  }
  
  // File transports for production and persistent logging
  if (process.env.NODE_ENV === 'production' || process.env.ENABLE_FILE_LOGGING === 'true') {
    // Error log - daily rotation
    transports.push(
      new DailyRotateFile({
        filename: path.join(logsDir, 'error-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        level: 'error',
        format: logFormat,
        maxSize: '20m',
        maxFiles: '14d',
        handleExceptions: true,
        handleRejections: true
      })
    );
    
    // Combined log - daily rotation  
    transports.push(
      new DailyRotateFile({
        filename: path.join(logsDir, 'combined-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        format: logFormat,
        maxSize: '20m',
        maxFiles: '14d',
        level: process.env.LOG_LEVEL || 'info'
      })
    );
    
    // HTTP access log - daily rotation
    transports.push(
      new DailyRotateFile({
        filename: path.join(logsDir, 'access-%DATE%.log'),
        datePattern: 'YYYY-MM-DD',
        format: logFormat,
        maxSize: '50m',
        maxFiles: '30d',
        level: 'http'
      })
    );
  }
  
  return transports;
};

// Create the main logger
export const logger = winston.createLogger({
  levels: logLevels,
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  format: logFormat,
  defaultMeta: { 
    service: 'MealMate',
    version: process.env.npm_package_version || '1.0.0',
    environment: process.env.NODE_ENV || 'development'
  },
  transports: createTransports(),
  exitOnError: false
});

// Create specialized loggers for different components
export const createComponentLogger = (component: string) => {
  return logger.child({ component });
};

// HTTP logger for request/response logging
export const httpLogger = createComponentLogger('HTTP');

// Database logger
export const dbLogger = createComponentLogger('Database');

// Authentication logger
export const authLogger = createComponentLogger('Auth');

// API logger
export const apiLogger = createComponentLogger('API');

// Error logger with stack traces
export const errorLogger = createComponentLogger('Error');

// Performance logger for timing operations
export const performanceLogger = createComponentLogger('Performance');

// Security logger for security-related events
export const securityLogger = createComponentLogger('Security');

// Utility functions for structured logging
export const loggers = {
  // Log HTTP requests
  logRequest: (req: any, res: any, responseTime: number) => {
    httpLogger.http('HTTP Request', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      responseTime,
      userAgent: req.get('User-Agent'),
      ip: req.ip,
      contentLength: res.get('content-length')
    });
  },

  // Log database operations
  logDbOperation: (operation: string, table: string, duration: number, rowCount?: number) => {
    dbLogger.info('Database Operation', {
      operation,
      table,
      duration,
      rowCount
    });
  },

  // Log errors with context
  logError: (error: Error, context: any = {}) => {
    errorLogger.error('Application Error', {
      name: error.name,
      message: error.message,
      stack: error.stack,
      ...context
    });
  },

  // Log performance metrics
  logPerformance: (operation: string, duration: number, metadata: any = {}) => {
    performanceLogger.info('Performance Metric', {
      operation,
      duration,
      ...metadata
    });
  },

  // Log security events
  logSecurity: (event: string, details: any = {}) => {
    securityLogger.warn('Security Event', {
      event,
      timestamp: new Date().toISOString(),
      ...details
    });
  },

  // Log API usage statistics
  logApiUsage: (endpoint: string, method: string, statusCode: number, responseTime: number) => {
    apiLogger.info('API Usage', {
      endpoint,
      method,
      statusCode,
      responseTime,
      timestamp: new Date().toISOString()
    });
  }
};

// Health check for logging system
export const checkLoggerHealth = () => {
  try {
    logger.info('Logger health check - OK');
    return true;
  } catch (error) {
    console.error('Logger health check failed:', error);
    return false;
  }
};

// Graceful shutdown for logging system
export const shutdownLogger = () => {
  return new Promise<void>((resolve) => {
    logger.info('Shutting down logging system...');
    
    // Close all transports
    logger.close();
    
    setTimeout(() => {
      console.log('Logger shutdown complete');
      resolve();
    }, 1000);
  });
};

// Export the main logger as default
export default logger;