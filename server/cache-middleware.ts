import { Request, Response, NextFunction } from 'express';

export interface CacheOptions {
  maxAge?: number; // Cache duration in seconds
  sMaxAge?: number; // Shared cache (CDN) duration in seconds
  staleWhileRevalidate?: number; // Allow stale responses while revalidating
  mustRevalidate?: boolean; // Force revalidation when stale
  noCache?: boolean; // Prevent caching
  noStore?: boolean; // Prevent storing in any cache
  private?: boolean; // Only allow private caches (browser)
  public?: boolean; // Allow public caches (CDN)
  immutable?: boolean; // Content will never change
  etag?: boolean; // Generate ETag headers
}

// Predefined cache strategies for different content types
export const CacheStrategies = {
  // Static content that rarely changes
  STATIC: {
    maxAge: 86400, // 24 hours
    public: true,
    immutable: false,
    etag: true
  } as CacheOptions,

  // API data that can be cached for short periods
  API_SHORT: {
    maxAge: 300, // 5 minutes
    sMaxAge: 600, // 10 minutes for CDN
    staleWhileRevalidate: 300,
    public: true,
    etag: true
  } as CacheOptions,

  // API data that can be cached for longer periods
  API_LONG: {
    maxAge: 3600, // 1 hour
    sMaxAge: 7200, // 2 hours for CDN
    staleWhileRevalidate: 1800,
    public: true,
    etag: true
  } as CacheOptions,

  // User-specific data that should only be cached privately
  PRIVATE: {
    maxAge: 300, // 5 minutes
    private: true,
    mustRevalidate: true,
    etag: true
  } as CacheOptions,

  // Data that changes frequently and should not be cached
  NO_CACHE: {
    noCache: true,
    noStore: true,
    mustRevalidate: true
  } as CacheOptions,

  // Real-time data that should never be cached
  NO_STORE: {
    noStore: true,
    noCache: true,
    maxAge: 0
  } as CacheOptions
};

// Generate ETag from content
function generateETag(content: string): string {
  // Simple hash function for ETag generation
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return `"${Math.abs(hash).toString(16)}"`;
}

// Build Cache-Control header value
function buildCacheControlHeader(options: CacheOptions): string {
  const directives: string[] = [];

  if (options.noStore) {
    directives.push('no-store');
  }
  
  if (options.noCache) {
    directives.push('no-cache');
  }

  if (options.private) {
    directives.push('private');
  } else if (options.public) {
    directives.push('public');
  }

  if (options.maxAge !== undefined) {
    directives.push(`max-age=${options.maxAge}`);
  }

  if (options.sMaxAge !== undefined) {
    directives.push(`s-maxage=${options.sMaxAge}`);
  }

  if (options.staleWhileRevalidate !== undefined) {
    directives.push(`stale-while-revalidate=${options.staleWhileRevalidate}`);
  }

  if (options.mustRevalidate) {
    directives.push('must-revalidate');
  }

  if (options.immutable) {
    directives.push('immutable');
  }

  return directives.join(', ');
}

// Cache middleware factory
export function cache(options: CacheOptions = {}) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Store original json function to intercept response
    const originalJson = res.json;
    
    res.json = function(body: any) {
      // Set cache headers before sending response
      const cacheControl = buildCacheControlHeader(options);
      if (cacheControl) {
        res.setHeader('Cache-Control', cacheControl);
      }

      // Generate ETag if enabled
      if (options.etag && body) {
        const content = typeof body === 'string' ? body : JSON.stringify(body);
        const etag = generateETag(content);
        res.setHeader('ETag', etag);

        // Check if client has a matching ETag
        const clientETag = req.headers['if-none-match'];
        if (clientETag === etag) {
          return res.status(304).end();
        }
      }

      // Set additional headers for better caching behavior
      if (!options.noStore && !options.noCache) {
        // Add Last-Modified header for better cache validation
        res.setHeader('Last-Modified', new Date().toUTCString());
        
        // Add Vary header to ensure proper caching with different request headers
        res.setHeader('Vary', 'Accept, Accept-Encoding, Authorization');
      }

      // Call original json function
      return originalJson.call(this, body);
    };

    next();
  };
}

// Conditional cache middleware based on HTTP method
export function conditionalCache(getOptions: CacheOptions, postOptions?: CacheOptions) {
  return (req: Request, res: Response, next: NextFunction) => {
    let options: CacheOptions;
    
    switch (req.method.toUpperCase()) {
      case 'GET':
      case 'HEAD':
        options = getOptions;
        break;
      case 'POST':
        options = postOptions || CacheStrategies.NO_CACHE;
        break;
      case 'PUT':
      case 'DELETE':
      case 'PATCH':
        options = CacheStrategies.NO_STORE;
        break;
      default:
        options = CacheStrategies.NO_CACHE;
    }

    return cache(options)(req, res, next);
  };
}

// Smart cache middleware that analyzes response patterns
export function smartCache() {
  return (req: Request, res: Response, next: NextFunction) => {
    let options: CacheOptions;
    const path = req.path;
    const method = req.method.toUpperCase();

    // Determine caching strategy based on path and method patterns
    if (method === 'GET' || method === 'HEAD') {
      if (path.includes('/recipes/') && !path.includes('/recipes/parse')) {
        // Individual recipe - cache longer as they don't change often
        options = CacheStrategies.API_LONG;
      } else if (path.includes('/recipes') && req.query.search) {
        // Recipe search results - cache shorter as they may change
        options = CacheStrategies.API_SHORT;
      } else if (path.includes('/recipes')) {
        // Recipe listings - cache medium term
        options = CacheStrategies.API_SHORT;
      } else if (path.includes('/collections')) {
        // Collections - cache longer
        options = CacheStrategies.API_LONG;
      } else if (path.includes('/meal-plans') || path.includes('/shopping-list')) {
        // User-specific data - private cache only
        options = CacheStrategies.PRIVATE;
      } else if (path.includes('/nutrition')) {
        // Nutrition data - can be cached longer
        options = CacheStrategies.API_LONG;
      } else {
        // Default for unknown GET endpoints
        options = CacheStrategies.API_SHORT;
      }
    } else if (method === 'POST' && path.includes('/parse')) {
      // Recipe parsing results can be cached briefly
      options = CacheStrategies.API_SHORT;
    } else {
      // All other methods should not be cached
      options = CacheStrategies.NO_STORE;
    }

    return cache(options)(req, res, next);
  };
}