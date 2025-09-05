import { Request, Response, NextFunction } from "express";

// Custom error classes for better error categorization
export class ValidationError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  constructor(resource: string, identifier?: string) {
    super(identifier ? `${resource} with ID '${identifier}' not found` : `${resource} not found`);
    this.name = 'NotFoundError';
  }
}

export class DatabaseError extends Error {
  constructor(message: string, public originalError?: Error) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export class ExternalAPIError extends Error {
  constructor(service: string, message: string, public statusCode?: number) {
    super(`${service} API error: ${message}`);
    this.name = 'ExternalAPIError';
  }
}

// Type for async route handlers
export type AsyncRouteHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

// Wrapper for async route handlers to catch errors automatically
export const asyncHandler = (fn: AsyncRouteHandler) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Storage operation wrapper with enhanced error handling
export const withDatabaseErrorHandling = async <T>(
  operation: () => Promise<T>,
  operationName: string,
  resourceName: string
): Promise<T> => {
  try {
    return await operation();
  } catch (error) {
    const timestamp = new Date().toISOString();
    
    if (error instanceof Error) {
      // Log the full error for debugging
      console.error(`[${timestamp}] Database operation failed:`, {
        operation: operationName,
        resource: resourceName,
        error: error.message,
        stack: error.stack
      });
      
      // Handle specific database errors
      if (error.message.includes('UNIQUE constraint') || error.message.includes('duplicate key')) {
        throw new ValidationError(`A ${resourceName.toLowerCase()} with these details already exists`);
      }
      
      if (error.message.includes('FOREIGN KEY constraint') || error.message.includes('violates foreign key')) {
        throw new ValidationError(`Referenced ${resourceName.toLowerCase()} does not exist`);
      }
      
      if (error.message.includes('NOT NULL constraint') || error.message.includes('null value')) {
        throw new ValidationError(`Required fields are missing for ${resourceName.toLowerCase()}`);
      }
      
      // Check if it's a connection error
      if (error.message.includes('ECONNREFUSED') || 
          error.message.includes('connection terminated') ||
          error.message.includes('timeout')) {
        throw new DatabaseError(`Database connection failed during ${operationName.toLowerCase()}`);
      }
    }
    
    // Generic database error
    throw new DatabaseError(
      `Failed to ${operationName.toLowerCase()} ${resourceName.toLowerCase()}`,
      error instanceof Error ? error : new Error(String(error))
    );
  }
};

// Validation helper for required fields
export const validateRequiredFields = (data: any, requiredFields: string[], resourceName: string) => {
  const missingFields = requiredFields.filter(field => {
    const value = data[field];
    return value === undefined || value === null || value === '';
  });
  
  if (missingFields.length > 0) {
    throw new ValidationError(
      `Missing required fields for ${resourceName}: ${missingFields.join(', ')}`
    );
  }
};

// Input sanitization helper
export const sanitizeInput = (input: any): any => {
  if (typeof input === 'string') {
    // Basic XSS prevention - remove script tags and dangerous attributes
    return input
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '"')
      .trim();
  }
  
  if (Array.isArray(input)) {
    return input.map(sanitizeInput);
  }
  
  if (typeof input === 'object' && input !== null) {
    const sanitized: any = {};
    for (const [key, value] of Object.entries(input)) {
      sanitized[key] = sanitizeInput(value);
    }
    return sanitized;
  }
  
  return input;
};

// HTTP status code mapping for custom errors
export const getErrorStatus = (error: Error): number => {
  if (error instanceof ValidationError) return 400;
  if (error instanceof NotFoundError) return 404;
  if (error instanceof ExternalAPIError) return error.statusCode || 502;
  if (error instanceof DatabaseError) return 500;
  return 500;
};

// User-friendly error message mapping
export const getUserFriendlyMessage = (error: Error): string => {
  if (error instanceof ValidationError) return error.message;
  if (error instanceof NotFoundError) return error.message;
  if (error instanceof ExternalAPIError) return 'External service is temporarily unavailable. Please try again later.';
  if (error instanceof DatabaseError) return 'Database operation failed. Please try again later.';
  return 'An unexpected error occurred. Please try again later.';
};