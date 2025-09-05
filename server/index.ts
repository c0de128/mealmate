// Load environment variables FIRST before any other imports that might use them
import dotenv from "dotenv";
dotenv.config();

import express, { type Request, Response, NextFunction } from "express";
import compression from "compression";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { getErrorStatus, getUserFriendlyMessage } from "./error-handler";
import { smartCache } from "./cache-middleware";
import { backupScheduler } from "./backup-system";
import { sanitizationMiddleware, securityHeadersMiddleware } from "./sanitization-middleware";

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

// Security headers middleware (should be early in the stack)
app.use(securityHeadersMiddleware);

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Sanitization middleware (after body parsing, before validation)
app.use(sanitizationMiddleware({
  skipPaths: ['/health', '/api/health', '/favicon.ico'],
  logSanitization: true
}));

// Smart caching middleware for API endpoints
app.use('/api', smartCache());

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

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


// Graceful startup with comprehensive error handling
(async () => {
  try {
    log('🚀 Starting MealMate server...');
    
    // Register routes with error handling
    const server = await registerRoutes(app);
    log('✅ Routes registered successfully');
    
    // Enhanced error handler middleware (must be after routes)
    app.use((err: any, req: Request, res: Response, next: NextFunction) => {
      const timestamp = new Date().toISOString();
      const status = getErrorStatus(err);
      const userMessage = getUserFriendlyMessage(err);
      
      // Log error details for debugging
      console.error(`[${timestamp}] Error ${status}:`, {
        name: err.name || 'Error',
        message: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      
      // Don't expose internal error details in production
      const isDevelopment = process.env.NODE_ENV === 'development';
      const errorResponse = {
        message: userMessage,
        ...(isDevelopment && { 
          originalMessage: err.message,
          stack: err.stack, 
          timestamp,
          errorType: err.name || err.constructor.name
        })
      };
    
      res.status(status).json(errorResponse);
    });

    // Setup development or production static serving
    if (app.get("env") === "development") {
      log('🔧 Setting up Vite development server...');
      await setupVite(app, server);
      log('✅ Vite development server ready');
    } else {
      log('📦 Setting up static file serving for production...');
      serveStatic(app);
      log('✅ Static files configured');
    }

    // Start the server with error handling
    const port = parseInt(process.env.PORT || '5000', 10);
    
    server.listen({
      port,
      host: "localhost",
    }, () => {
      log(`🌟 MealMate server running on port ${port}`);
      log(`🔗 Access the application at: http://localhost:${port}`);
      
      // Start backup scheduler if enabled
      if (process.env.BACKUP_ENABLED !== 'false') {
        backupScheduler.start();
        log('📦 Backup scheduler started');
      } else {
        log('📦 Backup scheduler disabled');
      }
    });
    
    // Handle server errors
    server.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${port} is already in use. Please try a different port.`);
      } else {
        console.error('❌ Server error:', error);
      }
      process.exit(1);
    });
    
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
})().catch((error) => {
  console.error('❌ Unhandled startup error:', error);
  process.exit(1);
});

// Global error handlers for unhandled errors
process.on('uncaughtException', (error) => {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] ❌ Uncaught Exception:`, {
    message: error.message,
    stack: error.stack,
    name: error.name
  });
  
  // Give the application time to clean up before exiting
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] ❌ Unhandled Promise Rejection:`, {
    reason: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
    promise: promise
  });
  
  // In development, we might want to continue running
  // In production, it's safer to exit and restart
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

// Graceful shutdown handlers
const gracefulShutdown = (signal: string) => {
  log(`📡 Received ${signal}, starting graceful shutdown...`);
  
  // Stop backup scheduler
  backupScheduler.stop();
  log('📦 Backup scheduler stopped');
  
  // Close database connections, stop accepting new connections, etc.
  // This is where you'd call storage.close(), server.close(), etc.
  
  process.exit(0);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
