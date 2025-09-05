import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL environment variable is required");
}

// Enhanced connection pool configuration for production
const poolConfig = {
  connectionString: process.env.DATABASE_URL,
  
  // Connection pool settings
  max: parseInt(process.env.DB_POOL_MAX || '20', 10), // Maximum number of connections
  min: parseInt(process.env.DB_POOL_MIN || '5', 10),  // Minimum number of connections
  
  // Timeout settings
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10), // Close idle connections after 30s
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT || '5000', 10), // Connection timeout 5s
  acquireTimeoutMillis: parseInt(process.env.DB_ACQUIRE_TIMEOUT || '10000', 10), // Acquire connection timeout 10s
  
  // Health check settings
  allowExitOnIdle: false, // Keep pool alive
  maxUses: parseInt(process.env.DB_MAX_USES || '7500', 10), // Max uses per connection before replacement
  
  // Statement timeout
  statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT || '30000', 10), // 30 second query timeout
  
  // Application name for connection tracking
  application_name: process.env.DB_APP_NAME || 'mealmate-api',
};

const pool = new Pool(poolConfig);

// Enhanced error handling and monitoring
pool.on('error', (err, client) => {
  console.error('Unexpected error on idle PostgreSQL client:', {
    message: err.message,
    stack: err.stack,
    timestamp: new Date().toISOString(),
    hasClient: !!client
  });
  
  // In production, you might want to send this to a monitoring service
  // monitoringService.logError('database_pool_error', err);
});

pool.on('connect', (client) => {
  console.log('New PostgreSQL client connected:', {
    timestamp: new Date().toISOString(),
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount
  });
});

pool.on('acquire', (client) => {
  console.log('PostgreSQL client acquired from pool:', {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount
  });
});

pool.on('remove', (client) => {
  console.log('PostgreSQL client removed from pool:', {
    timestamp: new Date().toISOString(),
    totalCount: pool.totalCount,
    idleCount: pool.idleCount
  });
});

export const db = drizzle(pool, { schema });

// Pool monitoring and health utilities
export const poolStats = () => ({
  totalCount: pool.totalCount,
  idleCount: pool.idleCount,
  waitingCount: pool.waitingCount,
  maxConnections: poolConfig.max,
  minConnections: poolConfig.min,
  timestamp: new Date().toISOString()
});

// Health check function for monitoring endpoints
export const checkDatabaseHealth = async (): Promise<{healthy: boolean, stats: any, latency?: number, error?: string}> => {
  const startTime = Date.now();
  try {
    // Simple connectivity test
    await pool.query('SELECT 1 as health_check');
    const latency = Date.now() - startTime;
    
    return {
      healthy: true,
      stats: poolStats(),
      latency
    };
  } catch (error) {
    return {
      healthy: false,
      stats: poolStats(),
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
};

// Graceful shutdown handler
export const closePool = async (): Promise<void> => {
  console.log('Closing PostgreSQL connection pool...');
  try {
    await pool.end();
    console.log('PostgreSQL connection pool closed gracefully');
  } catch (error) {
    console.error('Error closing PostgreSQL pool:', error);
  }
};

// Retry logic for failed connections
export const connectWithRetry = async (maxRetries = 5, delay = 1000): Promise<void> => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const health = await checkDatabaseHealth();
      if (health.healthy) {
        console.log(`PostgreSQL connected successfully on attempt ${i + 1}`);
        return;
      }
      throw new Error('Health check failed');
    } catch (error) {
      console.warn(`PostgreSQL connection attempt ${i + 1} failed:`, error);
      if (i === maxRetries - 1) {
        throw new Error(`Failed to connect to PostgreSQL after ${maxRetries} attempts`);
      }
      await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, i))); // Exponential backoff
    }
  }
};

// Graceful shutdown on process termination
process.on('SIGTERM', closePool);
process.on('SIGINT', closePool);
process.on('beforeExit', closePool);

export type Database = typeof db;