import { Request, Response, NextFunction } from 'express';
import createDOMPurify from 'isomorphic-dompurify';
import validator from 'validator';
import { logger, performanceLogger } from './logger';
import * as path from 'path';

const DOMPurify = createDOMPurify();

// Configuration for different sanitization levels
interface SanitizationConfig {
  allowHTML?: boolean;
  maxLength?: number;
  allowSpecialChars?: boolean;
  sanitizeFilenames?: boolean;
  preserveNewlines?: boolean;
}

// Default configurations for different field types
const sanitizationConfigs = {
  // Strict sanitization for user inputs that shouldn't contain HTML
  strict: {
    allowHTML: false,
    maxLength: 1000,
    allowSpecialChars: false,
    sanitizeFilenames: true,
    preserveNewlines: false
  },
  // Moderate sanitization for content that might need some formatting
  moderate: {
    allowHTML: false,
    maxLength: 5000,
    allowSpecialChars: true,
    sanitizeFilenames: false,
    preserveNewlines: true
  },
  // Permissive sanitization for rich content (still removes dangerous HTML)
  permissive: {
    allowHTML: true,
    maxLength: 50000,
    allowSpecialChars: true,
    sanitizeFilenames: false,
    preserveNewlines: true
  }
};

// Fields that should be sanitized with specific configurations
const fieldSanitizationMap: Record<string, keyof typeof sanitizationConfigs> = {
  // Recipe fields
  'name': 'moderate',
  'title': 'moderate', 
  'description': 'permissive',
  'instructions': 'permissive',
  'notes': 'permissive',
  'source': 'moderate',
  'cuisine': 'strict',
  'difficulty': 'strict',
  'category': 'strict',
  
  // Ingredient fields
  'ingredient': 'moderate',
  'unit': 'strict',
  
  // Search and filter fields
  'search': 'moderate',
  'query': 'moderate',
  'dietary': 'strict',
  'tag': 'strict',
  
  // User inputs
  'email': 'strict',
  'username': 'strict',
  'firstName': 'strict',
  'lastName': 'strict',
  
  // File related
  'filename': 'strict',
  'originalname': 'strict',
  
  // URLs and external content
  'url': 'strict',
  'imageUrl': 'strict',
  'shareUrl': 'strict',
  
  // IDs and technical fields
  'id': 'strict',
  'recipeId': 'strict',
  'mealPlanId': 'strict',
  'collectionId': 'strict'
};

/**
 * Sanitizes a string based on the provided configuration
 */
function sanitizeString(value: string, config: SanitizationConfig): string {
  if (typeof value !== 'string') {
    return String(value);
  }

  let sanitized = value;

  // Apply length limits
  if (config.maxLength && sanitized.length > config.maxLength) {
    sanitized = sanitized.substring(0, config.maxLength);
    logger.warn('String truncated during sanitization', {
      originalLength: value.length,
      maxLength: config.maxLength,
      truncated: true
    });
  }

  // Handle HTML content
  if (config.allowHTML) {
    // Allow safe HTML but remove dangerous elements and attributes
    sanitized = DOMPurify.sanitize(sanitized, {
      ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'u', 'br', 'p', 'ul', 'ol', 'li', 'h3', 'h4', 'h5', 'h6'],
      ALLOWED_ATTR: ['class'],
      KEEP_CONTENT: true
    });
  } else {
    // Strip all HTML tags
    sanitized = DOMPurify.sanitize(sanitized, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: [],
      KEEP_CONTENT: true
    });
  }

  // Handle special characters
  if (!config.allowSpecialChars) {
    // Remove or escape potentially dangerous special characters
    sanitized = sanitized.replace(/[<>\"'&]/g, (match) => {
      switch (match) {
        case '<': return '&lt;';
        case '>': return '&gt;';
        case '"': return '&quot;';
        case "'": return '&#39;';
        case '&': return '&amp;';
        default: return match;
      }
    });
  }

  // Handle newlines
  if (!config.preserveNewlines) {
    sanitized = sanitized.replace(/[\r\n\t]/g, ' ').replace(/\s+/g, ' ');
  }

  // Sanitize filenames
  if (config.sanitizeFilenames) {
    sanitized = path.basename(sanitized).replace(/[^a-zA-Z0-9.\-_]/g, '_');
  }

  return sanitized.trim();
}

/**
 * Sanitizes numbers and ensures they are valid
 */
function sanitizeNumber(value: any): number | null {
  if (typeof value === 'number' && !isNaN(value)) {
    return Math.max(-1000000, Math.min(1000000, value)); // Reasonable bounds
  }
  
  if (typeof value === 'string') {
    if (validator.isInt(value)) {
      const num = parseInt(value, 10);
      return Math.max(-1000000, Math.min(1000000, num));
    }
    if (validator.isFloat(value)) {
      const num = parseFloat(value);
      return Math.max(-1000000, Math.min(1000000, num));
    }
  }
  
  return null;
}

/**
 * Sanitizes boolean values
 */
function sanitizeBoolean(value: any): boolean {
  if (typeof value === 'boolean') {
    return value;
  }
  
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    return lower === 'true' || lower === '1' || lower === 'yes';
  }
  
  return Boolean(value);
}

/**
 * Sanitizes email addresses
 */
function sanitizeEmail(value: string): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  
  const sanitized = validator.normalizeEmail(value) || '';
  
  if (validator.isEmail(sanitized)) {
    return sanitized;
  }
  
  return null;
}

/**
 * Sanitizes URLs
 */
function sanitizeUrl(value: string): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  
  const sanitized = value.trim();
  
  if (validator.isURL(sanitized, {
    protocols: ['http', 'https'],
    require_protocol: true,
    allow_query_components: true,
    allow_fragments: true
  })) {
    return sanitized;
  }
  
  return null;
}

/**
 * Recursively sanitizes an object
 */
function sanitizeObject(obj: any, parentKey = ''): any {
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map((item, index) => sanitizeObject(item, `${parentKey}[${index}]`));
  }
  
  if (typeof obj === 'object') {
    const sanitized: any = {};
    
    for (const [key, value] of Object.entries(obj)) {
      const fullKey = parentKey ? `${parentKey}.${key}` : key;
      
      // Skip certain system fields that shouldn't be sanitized
      if (['_id', '__v', 'createdAt', 'updatedAt'].includes(key)) {
        sanitized[key] = value;
        continue;
      }
      
      sanitized[key] = sanitizeObject(value, fullKey);
    }
    
    return sanitized;
  }
  
  if (typeof obj === 'string') {
    // Special handling for different field types
    if (parentKey.toLowerCase().includes('email')) {
      return sanitizeEmail(obj);
    }
    
    if (parentKey.toLowerCase().includes('url')) {
      return sanitizeUrl(obj);
    }
    
    // Use field-specific sanitization config
    const configKey = fieldSanitizationMap[parentKey] || 'moderate';
    const config = sanitizationConfigs[configKey];
    
    return sanitizeString(obj, config);
  }
  
  if (typeof obj === 'number') {
    return sanitizeNumber(obj);
  }
  
  if (typeof obj === 'boolean') {
    return sanitizeBoolean(obj);
  }
  
  return obj;
}

/**
 * Middleware for sanitizing request data
 */
export function sanitizationMiddleware(options: {
  skipPaths?: string[],
  logSanitization?: boolean
} = {}) {
  const { skipPaths = [], logSanitization = true } = options;
  
  return (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    
    // Skip sanitization for certain paths (like health checks)
    if (skipPaths.some(path => req.path.startsWith(path))) {
      return next();
    }
    
    try {
      let sanitized = false;
      const originalBody = JSON.stringify(req.body);
      const originalQuery = JSON.stringify(req.query);
      const originalParams = JSON.stringify(req.params);
      
      // Sanitize request body
      if (req.body && Object.keys(req.body).length > 0) {
        const sanitizedBody = sanitizeObject(req.body);
        if (JSON.stringify(sanitizedBody) !== originalBody) {
          sanitized = true;
        }
        req.body = sanitizedBody;
      }
      
      // Sanitize query parameters
      if (req.query && Object.keys(req.query).length > 0) {
        const sanitizedQuery = sanitizeObject(req.query);
        if (JSON.stringify(sanitizedQuery) !== originalQuery) {
          sanitized = true;
        }
        req.query = sanitizedQuery;
      }
      
      // Sanitize path parameters
      if (req.params && Object.keys(req.params).length > 0) {
        const sanitizedParams = sanitizeObject(req.params);
        if (JSON.stringify(sanitizedParams) !== originalParams) {
          sanitized = true;
        }
        req.params = sanitizedParams;
      }
      
      // Sanitize file uploads
      if (req.file) {
        if (req.file.originalname) {
          req.file.originalname = sanitizeString(req.file.originalname, sanitizationConfigs.strict);
        }
        if (req.file.filename) {
          req.file.filename = sanitizeString(req.file.filename, sanitizationConfigs.strict);
        }
      }
      
      const duration = Date.now() - startTime;
      
      // Log sanitization events
      if (logSanitization && sanitized) {
        logger.info('Request data sanitized', {
          method: req.method,
          path: req.path,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          duration,
          sanitized: true
        });
        
        performanceLogger.info('Sanitization middleware', {
          operation: 'sanitization',
          method: req.method,
          path: req.path,
          duration,
          sanitized
        });
      }
      
      next();
      
    } catch (error) {
      const duration = Date.now() - startTime;
      
      logger.error('Sanitization middleware error', {
        method: req.method,
        path: req.path,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        duration
      });
      
      // Don't block the request if sanitization fails
      next();
    }
  };
}

/**
 * Express middleware for content security
 */
export function securityHeadersMiddleware(req: Request, res: Response, next: NextFunction) {
  // Set security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  
  // Content Security Policy
  const csp = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Vite needs unsafe-eval in dev
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https:",
    "font-src 'self'",
    "connect-src 'self'",
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'"
  ].join('; ');
  
  res.setHeader('Content-Security-Policy', csp);
  
  next();
}

// Utility functions for manual sanitization
export const sanitizeUtils = {
  sanitizeString: (value: string, level: keyof typeof sanitizationConfigs = 'moderate') => 
    sanitizeString(value, sanitizationConfigs[level]),
  
  sanitizeNumber,
  sanitizeBoolean,
  sanitizeEmail,
  sanitizeUrl,
  sanitizeObject,
  
  // Sanitize filename specifically
  sanitizeFilename: (filename: string): string => {
    return path.basename(filename).replace(/[^a-zA-Z0-9.\-_]/g, '_');
  },
  
  // Sanitize SQL-like inputs (basic protection)
  sanitizeSqlInput: (input: string): string => {
    return input.replace(/['";\\]/g, '').replace(/--/g, '');
  }
};

export default sanitizationMiddleware;