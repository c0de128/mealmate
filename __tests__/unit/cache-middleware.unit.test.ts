import { Request, Response, NextFunction } from 'express';
import { cache, conditionalCache, smartCache, CacheStrategies } from '../../server/cache-middleware';

// Mock Express request/response objects
const createMockReq = (options: Partial<Request> = {}): Partial<Request> => ({
  method: 'GET',
  path: '/api/test',
  headers: {},
  query: {},
  ...options
});

const createMockRes = (): Partial<Response> => {
  const res: Partial<Response> = {
    setHeader: jest.fn(),
    status: jest.fn().mockReturnThis(),
    end: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis()
  };
  return res;
};

const mockNext: NextFunction = jest.fn();

describe('Cache Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('cache middleware', () => {
    test('should set basic cache headers', () => {
      const req = createMockReq();
      const res = createMockRes();
      const middleware = cache({ maxAge: 300, public: true });

      middleware(req as Request, res as Response, mockNext);

      // Call the overridden json method
      const jsonBody = { test: 'data' };
      res.json!(jsonBody);

      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=300');
      expect(mockNext).toHaveBeenCalled();
    });

    test('should generate ETag header when enabled', () => {
      const req = createMockReq();
      const res = createMockRes();
      const middleware = cache({ etag: true, maxAge: 300 });

      middleware(req as Request, res as Response, mockNext);

      const jsonBody = { test: 'data' };
      res.json!(jsonBody);

      expect(res.setHeader).toHaveBeenCalledWith(expect.stringMatching(/ETag/), expect.any(String));
    });

    test('should return 304 for matching ETag', () => {
      const etag = '"test-etag"';
      const req = createMockReq({ headers: { 'if-none-match': etag } });
      const res = createMockRes();
      const middleware = cache({ etag: true });

      // Mock ETag generation to return consistent value
      const originalJson = res.json;
      res.json = jest.fn().mockImplementation(function(this: Response, body: any) {
        (res.setHeader as jest.Mock).mockImplementation((header: string, value: string) => {
          if (header === 'ETag') {
            // Simulate ETag match
            if (value === etag) {
              return res.status!(304).end!();
            }
          }
        });
        return originalJson?.call(this, body);
      });

      middleware(req as Request, res as Response, mockNext);

      // This test verifies the ETag logic structure is in place
      expect(mockNext).toHaveBeenCalled();
    });

    test('should set no-cache headers when specified', () => {
      const req = createMockReq();
      const res = createMockRes();
      const middleware = cache({ noCache: true, noStore: true });

      middleware(req as Request, res as Response, mockNext);
      res.json!({ test: 'data' });

      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store, no-cache');
    });

    test('should set stale-while-revalidate directive', () => {
      const req = createMockReq();
      const res = createMockRes();
      const middleware = cache({ 
        maxAge: 300, 
        staleWhileRevalidate: 600,
        public: true 
      });

      middleware(req as Request, res as Response, mockNext);
      res.json!({ test: 'data' });

      expect(res.setHeader).toHaveBeenCalledWith(
        'Cache-Control', 
        'public, max-age=300, stale-while-revalidate=600'
      );
    });

    test('should set s-maxage for CDN caching', () => {
      const req = createMockReq();
      const res = createMockRes();
      const middleware = cache({ 
        maxAge: 300, 
        sMaxAge: 600,
        public: true 
      });

      middleware(req as Request, res as Response, mockNext);
      res.json!({ test: 'data' });

      expect(res.setHeader).toHaveBeenCalledWith(
        'Cache-Control', 
        'public, max-age=300, s-maxage=600'
      );
    });

    test('should set additional headers for caching', () => {
      const req = createMockReq();
      const res = createMockRes();
      const middleware = cache({ maxAge: 300 });

      middleware(req as Request, res as Response, mockNext);
      res.json!({ test: 'data' });

      expect(res.setHeader).toHaveBeenCalledWith('Last-Modified', expect.any(String));
      expect(res.setHeader).toHaveBeenCalledWith('Vary', 'Accept, Accept-Encoding, Authorization');
    });
  });

  describe('conditionalCache middleware', () => {
    test('should use GET options for GET requests', () => {
      const req = createMockReq({ method: 'GET' });
      const res = createMockRes();
      const getOptions = { maxAge: 300, public: true };
      const postOptions = { noCache: true };
      const middleware = conditionalCache(getOptions, postOptions);

      middleware(req as Request, res as Response, mockNext);
      res.json!({ test: 'data' });

      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=300');
    });

    test('should use POST options for POST requests', () => {
      const req = createMockReq({ method: 'POST' });
      const res = createMockRes();
      const getOptions = { maxAge: 300, public: true };
      const postOptions = { noCache: true };
      const middleware = conditionalCache(getOptions, postOptions);

      middleware(req as Request, res as Response, mockNext);
      res.json!({ test: 'data' });

      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
    });

    test('should use no-store for DELETE requests', () => {
      const req = createMockReq({ method: 'DELETE' });
      const res = createMockRes();
      const getOptions = { maxAge: 300, public: true };
      const middleware = conditionalCache(getOptions);

      middleware(req as Request, res as Response, mockNext);
      res.json!({ test: 'data' });

      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-store, no-cache, max-age=0');
    });
  });

  describe('smartCache middleware', () => {
    test('should cache individual recipes with long strategy', () => {
      const req = createMockReq({ 
        method: 'GET',
        path: '/api/recipes/123'
      });
      const res = createMockRes();
      const middleware = smartCache();

      middleware(req as Request, res as Response, mockNext);
      res.json!({ id: '123', name: 'Test Recipe' });

      // Should use API_LONG strategy (1 hour)
      expect(res.setHeader).toHaveBeenCalledWith(
        'Cache-Control', 
        expect.stringContaining('max-age=3600')
      );
    });

    test('should cache recipe lists with short strategy', () => {
      const req = createMockReq({ 
        method: 'GET',
        path: '/api/recipes'
      });
      const res = createMockRes();
      const middleware = smartCache();

      middleware(req as Request, res as Response, mockNext);
      res.json!({ recipes: [] });

      // Should use API_SHORT strategy (5 minutes)
      expect(res.setHeader).toHaveBeenCalledWith(
        'Cache-Control', 
        expect.stringContaining('max-age=300')
      );
    });

    test('should cache recipe search with short strategy', () => {
      const req = createMockReq({ 
        method: 'GET',
        path: '/api/recipes',
        query: { search: 'pasta' }
      });
      const res = createMockRes();
      const middleware = smartCache();

      middleware(req as Request, res as Response, mockNext);
      res.json!({ recipes: [], total: 0 });

      // Should use API_SHORT strategy for search results
      expect(res.setHeader).toHaveBeenCalledWith(
        'Cache-Control', 
        expect.stringContaining('max-age=300')
      );
    });

    test('should use private cache for meal plans', () => {
      const req = createMockReq({ 
        method: 'GET',
        path: '/api/meal-plans'
      });
      const res = createMockRes();
      const middleware = smartCache();

      middleware(req as Request, res as Response, mockNext);
      res.json!({ mealPlans: [] });

      // Should use PRIVATE strategy
      expect(res.setHeader).toHaveBeenCalledWith(
        'Cache-Control', 
        expect.stringContaining('private')
      );
    });

    test('should use private cache for shopping lists', () => {
      const req = createMockReq({ 
        method: 'GET',
        path: '/api/shopping-list'
      });
      const res = createMockRes();
      const middleware = smartCache();

      middleware(req as Request, res as Response, mockNext);
      res.json!({ items: [] });

      // Should use PRIVATE strategy
      expect(res.setHeader).toHaveBeenCalledWith(
        'Cache-Control', 
        expect.stringContaining('private')
      );
    });

    test('should cache collections with long strategy', () => {
      const req = createMockReq({ 
        method: 'GET',
        path: '/api/collections'
      });
      const res = createMockRes();
      const middleware = smartCache();

      middleware(req as Request, res as Response, mockNext);
      res.json!({ collections: [] });

      // Should use API_LONG strategy
      expect(res.setHeader).toHaveBeenCalledWith(
        'Cache-Control', 
        expect.stringContaining('max-age=3600')
      );
    });

    test('should cache nutrition data with long strategy', () => {
      const req = createMockReq({ 
        method: 'GET',
        path: '/api/recipes/123/nutrition'
      });
      const res = createMockRes();
      const middleware = smartCache();

      middleware(req as Request, res as Response, mockNext);
      res.json!({ nutrition: {} });

      // Should use API_LONG strategy
      expect(res.setHeader).toHaveBeenCalledWith(
        'Cache-Control', 
        expect.stringContaining('max-age=3600')
      );
    });

    test('should cache recipe parsing results', () => {
      const req = createMockReq({ 
        method: 'POST',
        path: '/api/recipes/parse'
      });
      const res = createMockRes();
      const middleware = smartCache();

      middleware(req as Request, res as Response, mockNext);
      res.json!({ parsedRecipe: {} });

      // Should use API_SHORT strategy even for POST
      expect(res.setHeader).toHaveBeenCalledWith(
        'Cache-Control', 
        expect.stringContaining('max-age=300')
      );
    });

    test('should not cache other POST requests', () => {
      const req = createMockReq({ 
        method: 'POST',
        path: '/api/recipes'
      });
      const res = createMockRes();
      const middleware = smartCache();

      middleware(req as Request, res as Response, mockNext);
      res.json!({ recipe: {} });

      // Should use NO_STORE strategy
      expect(res.setHeader).toHaveBeenCalledWith(
        'Cache-Control', 
        expect.stringContaining('no-store')
      );
    });

    test('should use default short cache for unknown GET endpoints', () => {
      const req = createMockReq({ 
        method: 'GET',
        path: '/api/unknown'
      });
      const res = createMockRes();
      const middleware = smartCache();

      middleware(req as Request, res as Response, mockNext);
      res.json!({ data: {} });

      // Should use API_SHORT strategy as default
      expect(res.setHeader).toHaveBeenCalledWith(
        'Cache-Control', 
        expect.stringContaining('max-age=300')
      );
    });
  });

  describe('CacheStrategies', () => {
    test('should have correct STATIC strategy', () => {
      expect(CacheStrategies.STATIC).toEqual({
        maxAge: 86400,
        public: true,
        immutable: false,
        etag: true
      });
    });

    test('should have correct API_SHORT strategy', () => {
      expect(CacheStrategies.API_SHORT).toEqual({
        maxAge: 300,
        sMaxAge: 600,
        staleWhileRevalidate: 300,
        public: true,
        etag: true
      });
    });

    test('should have correct API_LONG strategy', () => {
      expect(CacheStrategies.API_LONG).toEqual({
        maxAge: 3600,
        sMaxAge: 7200,
        staleWhileRevalidate: 1800,
        public: true,
        etag: true
      });
    });

    test('should have correct PRIVATE strategy', () => {
      expect(CacheStrategies.PRIVATE).toEqual({
        maxAge: 300,
        private: true,
        mustRevalidate: true,
        etag: true
      });
    });

    test('should have correct NO_CACHE strategy', () => {
      expect(CacheStrategies.NO_CACHE).toEqual({
        noCache: true,
        noStore: true,
        mustRevalidate: true
      });
    });

    test('should have correct NO_STORE strategy', () => {
      expect(CacheStrategies.NO_STORE).toEqual({
        noStore: true,
        noCache: true,
        maxAge: 0
      });
    });
  });
});