import { Request, Response, NextFunction } from 'express';
import { loggers, httpLogger, securityLogger, performanceLogger } from './logger';
import crypto from 'crypto';

// Extended request interface to include logging metadata
interface LoggingRequest extends Request {
  startTime?: number;
  requestId?: string;
  logContext?: any;
}

// Generate unique request ID
const generateRequestId = (): string => {
  return crypto.randomBytes(8).toString('hex');
};

// Request logging middleware
export const requestLoggingMiddleware = (req: LoggingRequest, res: Response, next: NextFunction) => {
  req.startTime = Date.now();
  req.requestId = generateRequestId();
  
  // Add request ID to response headers
  res.setHeader('X-Request-ID', req.requestId);
  
  // Log incoming request
  const requestInfo = {
    requestId: req.requestId,
    method: req.method,
    url: req.originalUrl,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    contentType: req.get('Content-Type'),
    contentLength: req.get('Content-Length'),
    referer: req.get('Referer'),
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
    timestamp: new Date().toISOString()
  };
  
  httpLogger.info('Incoming Request', requestInfo);
  
  // Log request body for POST/PUT/PATCH requests (excluding sensitive data)
  if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
    const sanitizedBody = sanitizeRequestBody(req.body, req.path);
    if (sanitizedBody) {
      httpLogger.debug('Request Body', {
        requestId: req.requestId,
        body: sanitizedBody
      });
    }
  }
  
  next();
};

// Response logging middleware
export const responseLoggingMiddleware = (req: LoggingRequest, res: Response, next: NextFunction) => {
  const originalJson = res.json;
  const originalSend = res.send;
  let responseBody: any;
  let responseSize = 0;
  
  // Intercept json responses
  res.json = function(body: any) {
    responseBody = body;
    responseSize = JSON.stringify(body).length;
    return originalJson.call(this, body);
  };
  
  // Intercept send responses  
  res.send = function(body: any) {
    if (!responseBody) {
      responseBody = body;
      responseSize = typeof body === 'string' ? body.length : JSON.stringify(body).length;
    }
    return originalSend.call(this, body);
  };
  
  // Log response when finished
  res.on('finish', () => {
    const responseTime = Date.now() - (req.startTime || Date.now());
    
    const responseInfo = {
      requestId: req.requestId,
      method: req.method,
      url: req.originalUrl,
      statusCode: res.statusCode,
      responseTime,
      responseSize,
      contentType: res.get('Content-Type'),
      cacheControl: res.get('Cache-Control'),
      timestamp: new Date().toISOString()
    };
    
    // Different log levels based on status code
    if (res.statusCode >= 500) {
      httpLogger.error('HTTP Response - Server Error', responseInfo);
    } else if (res.statusCode >= 400) {
      httpLogger.warn('HTTP Response - Client Error', responseInfo);
    } else {
      httpLogger.http('HTTP Response', responseInfo);
    }
    
    // Log response body for errors or debug mode
    if ((res.statusCode >= 400 || process.env.LOG_LEVEL === 'debug') && responseBody) {
      const sanitizedResponse = sanitizeResponseBody(responseBody, req.path);
      if (sanitizedResponse) {
        httpLogger.debug('Response Body', {
          requestId: req.requestId,
          statusCode: res.statusCode,
          body: sanitizedResponse
        });
      }
    }
    
    // Log performance metrics for slow requests
    if (responseTime > 1000) {
      performanceLogger.warn('Slow Request', {
        requestId: req.requestId,
        method: req.method,
        url: req.originalUrl,
        responseTime,
        statusCode: res.statusCode
      });
    }
    
    // Log API usage statistics
    if (req.originalUrl.startsWith('/api/')) {
      loggers.logApiUsage(req.originalUrl, req.method, res.statusCode, responseTime);
    }
  });
  
  next();
};

// Error logging middleware (should be used after error handling)
export const errorLoggingMiddleware = (err: any, req: LoggingRequest, res: Response, next: NextFunction) => {
  const errorInfo = {
    requestId: req.requestId,
    name: err.name,
    message: err.message,
    stack: err.stack,
    method: req.method,
    url: req.originalUrl,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    statusCode: err.statusCode || 500,
    timestamp: new Date().toISOString()
  };
  
  loggers.logError(err, errorInfo);
  next(err);
};

// Security event logging middleware
export const securityLoggingMiddleware = (req: LoggingRequest, res: Response, next: NextFunction) => {
  // Log suspicious activities
  const suspicious = detectSuspiciousActivity(req);
  if (suspicious.length > 0) {
    securityLogger.warn('Suspicious Activity Detected', {
      requestId: req.requestId,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      url: req.originalUrl,
      suspiciousActivities: suspicious,
      timestamp: new Date().toISOString()
    });
  }
  
  // Log authentication events
  if (req.path.includes('/auth') || req.path.includes('/login')) {
    securityLogger.info('Authentication Attempt', {
      requestId: req.requestId,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
      path: req.path,
      method: req.method
    });
  }
  
  next();
};

// Sanitize request body to remove sensitive information
const sanitizeRequestBody = (body: any, path: string): any => {
  if (!body || typeof body !== 'object') return body;
  
  const sensitiveFields = [
    'password', 'token', 'secret', 'key', 'auth', 'credential',
    'apiKey', 'accessToken', 'refreshToken', 'sessionId'
  ];
  
  // Don't log sensitive endpoints at all
  const sensitivePaths = ['/auth', '/login', '/password', '/token'];
  if (sensitivePaths.some(sensPath => path.includes(sensPath))) {
    return '[REDACTED - Sensitive Endpoint]';
  }
  
  const sanitized = { ...body };
  
  // Recursively remove sensitive fields
  const removeSensitiveFields = (obj: any): any => {
    if (Array.isArray(obj)) {
      return obj.map(removeSensitiveFields);
    }
    
    if (obj && typeof obj === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        if (sensitiveFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
          result[key] = '[REDACTED]';
        } else {
          result[key] = removeSensitiveFields(value);
        }
      }
      return result;
    }
    
    return obj;
  };
  
  return removeSensitiveFields(sanitized);
};

// Sanitize response body
const sanitizeResponseBody = (body: any, path: string): any => {
  if (!body || typeof body !== 'object') return body;
  
  // Don't log responses from sensitive endpoints
  const sensitivePaths = ['/auth', '/login', '/password', '/token'];
  if (sensitivePaths.some(sensPath => path.includes(sensPath))) {
    return '[REDACTED - Sensitive Response]';
  }
  
  // Limit response body size in logs
  const bodyStr = JSON.stringify(body);
  if (bodyStr.length > 2000) {
    return '[TRUNCATED - Response too large]';
  }
  
  return body;
};

// Detect suspicious activities
const detectSuspiciousActivity = (req: Request): string[] => {
  const suspicious: string[] = [];
  
  // Check for SQL injection patterns
  const sqlPatterns = ['union select', 'drop table', 'delete from', '--', ';--'];
  const queryString = req.originalUrl.toLowerCase();
  if (sqlPatterns.some(pattern => queryString.includes(pattern))) {
    suspicious.push('Potential SQL injection');
  }
  
  // Check for XSS patterns
  const xssPatterns = ['<script', 'javascript:', 'onerror=', 'onload='];
  if (xssPatterns.some(pattern => queryString.includes(pattern))) {
    suspicious.push('Potential XSS attempt');
  }
  
  // Check for directory traversal
  if (queryString.includes('../') || queryString.includes('..\\')) {
    suspicious.push('Directory traversal attempt');
  }
  
  // Check for excessive request size
  const contentLength = parseInt(req.get('Content-Length') || '0');
  if (contentLength > 10 * 1024 * 1024) { // 10MB
    suspicious.push('Unusually large request');
  }
  
  // Check for missing User-Agent (common in bot attacks)
  if (!req.get('User-Agent')) {
    suspicious.push('Missing User-Agent header');
  }
  
  return suspicious;
};

// Request rate limiting logging
export const rateLimitLoggingMiddleware = (req: LoggingRequest, res: Response, next: NextFunction) => {
  const rateLimitHeaders = {
    limit: res.get('X-RateLimit-Limit'),
    remaining: res.get('X-RateLimit-Remaining'),
    reset: res.get('X-RateLimit-Reset')
  };
  
  // Log when rate limit is approaching
  const remaining = parseInt(rateLimitHeaders.remaining || '0');
  const limit = parseInt(rateLimitHeaders.limit || '0');
  
  if (limit > 0 && remaining < limit * 0.1) { // Less than 10% remaining
    httpLogger.warn('Rate limit approaching', {
      requestId: req.requestId,
      ip: req.ip,
      remaining,
      limit,
      path: req.path
    });
  }
  
  next();
};

// Health check logging middleware
export const healthCheckLoggingMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (req.path === '/health' || req.path === '/ping') {
    // Don't log health check requests to reduce noise
    return next();
  }
  next();
};