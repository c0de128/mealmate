import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import { registerRoutes } from "./routes";
import { log } from "./vite";
import { getErrorStatus, getUserFriendlyMessage } from "./error-handler";
import { smartCache } from "./cache-middleware";

// Factory function to create Express app for testability
export async function createApp(): Promise<express.Application> {
  const app = express();

  // Enable gzip compression for all responses
  app.use(compression({
    // Only compress responses larger than this threshold (in bytes)
    threshold: 1024,
    // Compression level: 1 (fastest) to 9 (best compression)
    level: 6,
    // Only compress these MIME types
    filter: (req, res) => {
      if (req.headers['x-no-compression']) {
        return false;
      }
      return compression.filter(req, res);
    }
  }));

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  // Apply smart caching middleware
  app.use(smartCache());

  // Request logging middleware (only in non-test environments)
  if (process.env.NODE_ENV !== 'test') {
    app.use((req: Request, res: Response, next: NextFunction) => {
      const start = Date.now();
      const path = req.path;
      let capturedJsonResponse: any = {};

      const originalResJson = res.json;
      res.json = function (bodyJson, ...args) {
        capturedJsonResponse = bodyJson;
        return originalResJson.apply(res, [bodyJson, ...args]);
      };

      res.on("finish", () => {
        const duration = Date.now() - start;
        if (path.startsWith("/api")) {
          let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
          if (capturedJsonResponse) {
            logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
          }

          if (logLine.length > 80) {
            logLine = logLine.slice(0, 79) + "…";
          }

          log(logLine);
        }
      });

      next();
    });
  }

  // Register routes
  await registerRoutes(app);

  // Enhanced error handler middleware (must be after routes)
  app.use((err: any, req: Request, res: Response, next: NextFunction) => {
    const timestamp = new Date().toISOString();
    const status = getErrorStatus(err);
    const userMessage = getUserFriendlyMessage(err);
    
    // Log error details for debugging (not in test environment)
    if (process.env.NODE_ENV !== 'test') {
      console.error(`[${timestamp}] Error ${status}:`, {
        name: err.name || 'Error',
        message: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
    }
    
    // Don't expose internal error details in production
    const isDevelopment = process.env.NODE_ENV === 'development';
    const errorResponse = {
      error: userMessage,
      ...(isDevelopment && { 
        originalMessage: err.message,
        stack: err.stack, 
        timestamp,
        errorType: err.name || err.constructor.name
      })
    };
  
    res.status(status).json(errorResponse);
  });

  return app;
}