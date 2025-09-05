import { Request, Response, NextFunction } from 'express';
import { z, ZodSchema, ZodError } from 'zod';
import { logger, performanceLogger } from './logger';
import { ValidationError } from './error-handler';

// Enhanced validation schemas for all endpoints
export const validationSchemas = {
  // Recipe schemas
  recipeId: z.string()
    .min(1, 'Recipe ID is required')
    .max(100, 'Recipe ID too long')
    .regex(/^[a-zA-Z0-9\-_]+$/, 'Invalid recipe ID format'),

  recipeCreate: z.object({
    name: z.string()
      .min(1, 'Recipe name is required')
      .max(200, 'Recipe name too long')
      .trim(),
    description: z.string()
      .max(2000, 'Description too long')
      .optional(),
    instructions: z.string()
      .min(1, 'Instructions are required')
      .max(50000, 'Instructions too long'),
    prepTime: z.number()
      .int('Prep time must be an integer')
      .min(0, 'Prep time cannot be negative')
      .max(1440, 'Prep time cannot exceed 24 hours')
      .optional(),
    cookTime: z.number()
      .int('Cook time must be an integer')
      .min(0, 'Cook time cannot be negative')
      .max(1440, 'Cook time cannot exceed 24 hours')
      .optional(),
    servings: z.number()
      .int('Servings must be an integer')
      .min(1, 'Servings must be at least 1')
      .max(100, 'Servings cannot exceed 100')
      .optional(),
    difficulty: z.enum(['easy', 'medium', 'hard'], {
      errorMap: () => ({ message: 'Difficulty must be easy, medium, or hard' })
    }).optional(),
    cuisine: z.string()
      .max(100, 'Cuisine name too long')
      .regex(/^[a-zA-Z\s\-]+$/, 'Invalid cuisine format')
      .optional(),
    dietaryTags: z.array(z.enum([
      'vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'nut-free', 
      'low-carb', 'keto', 'paleo', 'healthy', 'low-fat', 'high-protein'
    ])).optional(),
    ingredients: z.array(z.object({
      name: z.string()
        .min(1, 'Ingredient name is required')
        .max(100, 'Ingredient name too long'),
      quantity: z.string()
        .min(1, 'Quantity is required')
        .max(20, 'Quantity too long')
        .regex(/^[\d\s\/\.\-\+a-zA-Z]+$/, 'Invalid quantity format'),
      unit: z.string()
        .max(20, 'Unit too long')
        .regex(/^[a-zA-Z\s\.]+$/, 'Invalid unit format')
        .optional()
    })).optional(),
    imageUrl: z.string()
      .url('Invalid image URL')
      .max(500, 'Image URL too long')
      .optional(),
    source: z.string()
      .max(200, 'Source too long')
      .optional(),
    notes: z.string()
      .max(1000, 'Notes too long')
      .optional()
  }),

  recipeUpdate: z.object({
    name: z.string()
      .min(1, 'Recipe name is required')
      .max(200, 'Recipe name too long')
      .trim()
      .optional(),
    description: z.string()
      .max(2000, 'Description too long')
      .optional(),
    instructions: z.string()
      .max(50000, 'Instructions too long')
      .optional(),
    prepTime: z.number()
      .int('Prep time must be an integer')
      .min(0, 'Prep time cannot be negative')
      .max(1440, 'Prep time cannot exceed 24 hours')
      .optional(),
    cookTime: z.number()
      .int('Cook time must be an integer')
      .min(0, 'Cook time cannot be negative')
      .max(1440, 'Cook time cannot exceed 24 hours')
      .optional(),
    servings: z.number()
      .int('Servings must be an integer')
      .min(1, 'Servings must be at least 1')
      .max(100, 'Servings cannot exceed 100')
      .optional(),
    difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
    cuisine: z.string()
      .max(100, 'Cuisine name too long')
      .regex(/^[a-zA-Z\s\-]+$/, 'Invalid cuisine format')
      .optional(),
    dietaryTags: z.array(z.enum([
      'vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'nut-free', 
      'low-carb', 'keto', 'paleo', 'healthy', 'low-fat', 'high-protein'
    ])).optional(),
    ingredients: z.array(z.object({
      name: z.string()
        .min(1, 'Ingredient name is required')
        .max(100, 'Ingredient name too long'),
      quantity: z.string()
        .min(1, 'Quantity is required')
        .max(20, 'Quantity too long')
        .regex(/^[\d\s\/\.\-\+a-zA-Z]+$/, 'Invalid quantity format'),
      unit: z.string()
        .max(20, 'Unit too long')
        .regex(/^[a-zA-Z\s\.]+$/, 'Invalid unit format')
        .optional()
    })).optional(),
    imageUrl: z.string()
      .url('Invalid image URL')
      .max(500, 'Image URL too long')
      .optional(),
    source: z.string()
      .max(200, 'Source too long')
      .optional(),
    notes: z.string()
      .max(1000, 'Notes too long')
      .optional(),
    isFavorite: z.boolean().optional(),
    rating: z.number()
      .min(1, 'Rating must be between 1 and 5')
      .max(5, 'Rating must be between 1 and 5')
      .optional()
  }),

  // Search and query parameters
  searchQuery: z.object({
    search: z.string()
      .max(200, 'Search query too long')
      .optional(),
    dietary: z.enum([
      'all', 'vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'nut-free', 
      'low-carb', 'keto', 'paleo', 'healthy', 'low-fat', 'high-protein'
    ]).optional(),
    cuisine: z.string()
      .max(100, 'Cuisine filter too long')
      .regex(/^[a-zA-Z\s\-]+$/, 'Invalid cuisine format')
      .optional(),
    difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
    page: z.string()
      .regex(/^\d+$/, 'Page must be a number')
      .transform(val => parseInt(val, 10))
      .refine(val => val >= 1, 'Page must be at least 1')
      .refine(val => val <= 1000, 'Page cannot exceed 1000')
      .optional(),
    limit: z.string()
      .regex(/^\d+$/, 'Limit must be a number')
      .transform(val => parseInt(val, 10))
      .refine(val => val >= 1, 'Limit must be at least 1')
      .refine(val => val <= 100, 'Limit cannot exceed 100')
      .optional()
  }),

  // Meal plan schemas
  mealPlanCreate: z.object({
    date: z.string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format')
      .refine(val => {
        const date = new Date(val);
        return !isNaN(date.getTime()) && date.getTime() > Date.now() - 365 * 24 * 60 * 60 * 1000;
      }, 'Invalid date or date too far in the past'),
    mealType: z.enum(['breakfast', 'lunch', 'dinner', 'snack'], {
      errorMap: () => ({ message: 'Meal type must be breakfast, lunch, dinner, or snack' })
    }),
    recipeId: z.string()
      .min(1, 'Recipe ID is required')
      .max(100, 'Recipe ID too long'),
    servings: z.number()
      .int('Servings must be an integer')
      .min(1, 'Servings must be at least 1')
      .max(20, 'Servings cannot exceed 20')
      .optional(),
    notes: z.string()
      .max(500, 'Notes too long')
      .optional()
  }),

  weekStartDate: z.object({
    weekStartDate: z.string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Week start date must be in YYYY-MM-DD format')
      .refine(val => {
        const date = new Date(val);
        return !isNaN(date.getTime());
      }, 'Invalid week start date')
  }),

  // Shopping list schemas
  shoppingListItem: z.object({
    name: z.string()
      .min(1, 'Item name is required')
      .max(100, 'Item name too long'),
    quantity: z.string()
      .min(1, 'Quantity is required')
      .max(20, 'Quantity too long')
      .regex(/^[\d\s\/\.\-\+a-zA-Z]+$/, 'Invalid quantity format'),
    unit: z.string()
      .max(20, 'Unit too long')
      .regex(/^[a-zA-Z\s\.]+$/, 'Invalid unit format')
      .optional(),
    category: z.string()
      .max(50, 'Category too long')
      .regex(/^[a-zA-Z\s\-]+$/, 'Invalid category format')
      .optional(),
    purchased: z.boolean().optional(),
    notes: z.string()
      .max(200, 'Notes too long')
      .optional()
  }),

  // Bulk operation schemas
  bulkIds: z.object({
    ids: z.array(z.string()
      .min(1, 'ID cannot be empty')
      .max(100, 'ID too long')
    ).min(1, 'At least one ID is required')
      .max(100, 'Cannot process more than 100 items at once')
  }),

  bulkRecipeUpdate: z.object({
    recipeIds: z.array(z.string()
      .min(1, 'Recipe ID cannot be empty')
      .max(100, 'Recipe ID too long')
    ).min(1, 'At least one recipe ID is required')
      .max(50, 'Cannot update more than 50 recipes at once'),
    updates: z.object({
      difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
      cuisine: z.string()
        .max(100, 'Cuisine name too long')
        .regex(/^[a-zA-Z\s\-]+$/, 'Invalid cuisine format')
        .optional(),
      dietaryTags: z.array(z.enum([
        'vegetarian', 'vegan', 'gluten-free', 'dairy-free', 'nut-free', 
        'low-carb', 'keto', 'paleo', 'healthy', 'low-fat', 'high-protein'
      ])).optional(),
      isFavorite: z.boolean().optional()
    }).refine(data => Object.keys(data).length > 0, 'At least one update field is required')
  }),

  // URL and text parsing schemas
  urlParse: z.object({
    url: z.string()
      .url('Invalid URL')
      .max(1000, 'URL too long')
      .refine(url => {
        const domain = new URL(url).hostname;
        // Allow common recipe domains
        const allowedDomains = [
          'allrecipes.com', 'foodnetwork.com', 'food.com', 'epicurious.com',
          'seriouseats.com', 'bonappetit.com', 'tasteofhome.com', 'delish.com',
          'recipe.com', 'yummly.com', 'cooking.nytimes.com'
        ];
        return allowedDomains.some(allowed => domain.includes(allowed)) || 
               process.env.NODE_ENV === 'development';
      }, 'URL domain not allowed')
  }),

  textParse: z.object({
    text: z.string()
      .min(10, 'Text must be at least 10 characters')
      .max(50000, 'Text too long')
  }),

  // File upload validation
  fileUpload: z.object({
    originalname: z.string()
      .min(1, 'Filename is required')
      .max(255, 'Filename too long')
      .regex(/^[a-zA-Z0-9\.\-_\s]+\.(json|zip)$/, 'Invalid filename or file type'),
    mimetype: z.enum([
      'application/json', 'application/zip', 
      'application/x-zip-compressed', 'application/octet-stream'
    ]),
    size: z.number()
      .min(1, 'File cannot be empty')
      .max(50 * 1024 * 1024, 'File size cannot exceed 50MB')
  }),

  // Data export/import schemas
  dataExport: z.object({
    includeRecipes: z.boolean().default(true),
    includeMealPlans: z.boolean().default(true),
    includeShoppingLists: z.boolean().default(true),
    format: z.enum(['json', 'csv', 'zip']).default('json'),
    dateRange: z.object({
      startDate: z.string()
        .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/, 'Invalid date format'),
      endDate: z.string()
        .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/, 'Invalid date format')
    }).refine(data => new Date(data.endDate) > new Date(data.startDate), 
      'End date must be after start date').optional()
  }),

  dataImport: z.object({
    format: z.enum(['json', 'zip']).default('json'),
    mergeStrategy: z.enum(['replace', 'merge', 'skip']).default('merge'),
    validateData: z.boolean().default(true)
  }),

  // Collection schemas
  collectionCreate: z.object({
    name: z.string()
      .min(1, 'Collection name is required')
      .max(100, 'Collection name too long'),
    description: z.string()
      .max(500, 'Description too long')
      .optional(),
    isPublic: z.boolean().default(false)
  }),

  // Share schemas
  shareCreate: z.object({
    recipeId: z.string()
      .min(1, 'Recipe ID is required')
      .max(100, 'Recipe ID too long'),
    expiresIn: z.number()
      .int('Expiration time must be an integer')
      .min(1, 'Expiration time must be at least 1 minute')
      .max(43200, 'Expiration time cannot exceed 30 days')
      .default(1440) // 24 hours
  }),

  // Rating schema
  rating: z.object({
    rating: z.number()
      .int('Rating must be an integer')
      .min(1, 'Rating must be between 1 and 5')
      .max(5, 'Rating must be between 1 and 5')
  })
};

/**
 * Creates validation middleware for request validation
 */
export function validateRequest(schemas: {
  body?: ZodSchema,
  query?: ZodSchema,
  params?: ZodSchema,
  file?: ZodSchema
}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    
    try {
      const validationErrors: string[] = [];

      // Validate request body
      if (schemas.body) {
        try {
          req.body = await schemas.body.parseAsync(req.body);
        } catch (error) {
          if (error instanceof ZodError) {
            validationErrors.push(...error.errors.map(e => `Body: ${e.path.join('.')} - ${e.message}`));
          }
        }
      }

      // Validate query parameters
      if (schemas.query) {
        try {
          req.query = await schemas.query.parseAsync(req.query);
        } catch (error) {
          if (error instanceof ZodError) {
            validationErrors.push(...error.errors.map(e => `Query: ${e.path.join('.')} - ${e.message}`));
          }
        }
      }

      // Validate path parameters
      if (schemas.params) {
        try {
          req.params = await schemas.params.parseAsync(req.params);
        } catch (error) {
          if (error instanceof ZodError) {
            validationErrors.push(...error.errors.map(e => `Params: ${e.path.join('.')} - ${e.message}`));
          }
        }
      }

      // Validate file upload
      if (schemas.file && req.file) {
        try {
          await schemas.file.parseAsync(req.file);
        } catch (error) {
          if (error instanceof ZodError) {
            validationErrors.push(...error.errors.map(e => `File: ${e.path.join('.')} - ${e.message}`));
          }
        }
      }

      const duration = Date.now() - startTime;

      // Log validation performance
      performanceLogger.info('Request validation', {
        operation: 'validation',
        method: req.method,
        path: req.path,
        duration,
        hasErrors: validationErrors.length > 0,
        errorCount: validationErrors.length
      });

      // If there are validation errors, return them
      if (validationErrors.length > 0) {
        logger.warn('Request validation failed', {
          method: req.method,
          path: req.path,
          ip: req.ip,
          userAgent: req.get('User-Agent'),
          errors: validationErrors,
          duration
        });
        
        throw new ValidationError(`Validation failed: ${validationErrors.join('; ')}`);
      }

      next();

    } catch (error) {
      const duration = Date.now() - startTime;
      
      if (error instanceof ValidationError) {
        // Log validation errors
        logger.warn('Validation error', {
          method: req.method,
          path: req.path,
          ip: req.ip,
          error: error.message,
          duration
        });
        next(error);
      } else {
        // Log unexpected validation errors
        logger.error('Unexpected validation error', {
          method: req.method,
          path: req.path,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          duration
        });
        next(error);
      }
    }
  };
}

/**
 * Rate limiting validation for sensitive endpoints
 */
export function rateLimitValidation(maxRequests: number, windowMs: number) {
  const requests = new Map<string, { count: number, resetTime: number }>();
  
  return (req: Request, res: Response, next: NextFunction) => {
    const clientId = req.ip || 'unknown';
    const now = Date.now();
    
    // Clean up expired entries
    for (const [key, value] of requests.entries()) {
      if (now > value.resetTime) {
        requests.delete(key);
      }
    }
    
    const clientData = requests.get(clientId);
    
    if (!clientData) {
      // First request from this client
      requests.set(clientId, { count: 1, resetTime: now + windowMs });
      next();
    } else if (clientData.count < maxRequests) {
      // Within rate limit
      clientData.count++;
      next();
    } else {
      // Rate limit exceeded
      logger.warn('Rate limit exceeded', {
        method: req.method,
        path: req.path,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        maxRequests,
        windowMs
      });
      
      res.status(429).json({
        message: 'Too many requests',
        retryAfter: Math.ceil((clientData.resetTime - now) / 1000)
      });
    }
  };
}

// Utility function to create common validation middleware combinations
export const createValidationMiddleware = {
  // Recipe endpoints
  recipeCreate: () => validateRequest({ body: validationSchemas.recipeCreate }),
  recipeUpdate: () => validateRequest({ 
    body: validationSchemas.recipeUpdate,
    params: z.object({ id: validationSchemas.recipeId })
  }),
  recipeGet: () => validateRequest({
    params: z.object({ id: validationSchemas.recipeId })
  }),
  recipeSearch: () => validateRequest({ query: validationSchemas.searchQuery }),

  // Meal plan endpoints
  mealPlanCreate: () => validateRequest({ body: validationSchemas.mealPlanCreate }),
  mealPlanList: () => validateRequest({ query: validationSchemas.weekStartDate }),

  // Shopping list endpoints
  shoppingListItem: () => validateRequest({ body: validationSchemas.shoppingListItem }),
  
  // Bulk operations
  bulkDelete: () => validateRequest({ body: validationSchemas.bulkIds }),
  bulkUpdate: () => validateRequest({ body: validationSchemas.bulkRecipeUpdate }),
  
  // Data operations
  dataExport: () => validateRequest({ body: validationSchemas.dataExport }),
  dataImport: () => validateRequest({ 
    body: validationSchemas.dataImport,
    file: validationSchemas.fileUpload
  }),
  
  // URL/Text parsing
  urlParse: () => validateRequest({ body: validationSchemas.urlParse }),
  textParse: () => validateRequest({ body: validationSchemas.textParse }),
  
  // Share endpoints
  shareCreate: () => validateRequest({ body: validationSchemas.shareCreate }),
  
  // Rating
  rating: () => validateRequest({ body: validationSchemas.rating })
};

export default validateRequest;