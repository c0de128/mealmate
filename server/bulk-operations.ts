import { Request, Response } from 'express';
import { logger, performanceLogger } from './logger';
import { storage } from './storage';
import { NotFoundError, ValidationError, asyncHandler } from './error-handler';
import { parseRecipeText } from './recipe-parser';
import { parseRecipeFromURL } from './url-recipe-parser';
import { z } from 'zod';
import { insertRecipeSchema } from '@shared/schema';

// Bulk operation schemas
const bulkDeleteSchema = z.object({
  recipeIds: z.array(z.string()).min(1, 'At least one recipe ID is required').max(100, 'Maximum 100 recipes can be deleted at once')
});

const bulkUpdateSchema = z.object({
  updates: z.array(z.object({
    recipeId: z.string(),
    data: insertRecipeSchema.partial()
  })).min(1, 'At least one update is required').max(50, 'Maximum 50 recipes can be updated at once')
});

const bulkImportSchema = z.object({
  recipes: z.array(insertRecipeSchema).min(1, 'At least one recipe is required').max(50, 'Maximum 50 recipes can be imported at once')
});

const bulkTextImportSchema = z.object({
  recipeTexts: z.array(z.string()).min(1, 'At least one recipe text is required').max(20, 'Maximum 20 recipes can be parsed at once')
});

const bulkUrlImportSchema = z.object({
  urls: z.array(z.string().url()).min(1, 'At least one URL is required').max(10, 'Maximum 10 URLs can be imported at once')
});

const bulkExportSchema = z.object({
  recipeIds: z.array(z.string()).optional(),
  format: z.enum(['json', 'csv', 'text']).default('json'),
  includeImages: z.boolean().default(false)
});

// Bulk delete recipes
export const bulkDeleteRecipes = asyncHandler(async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const { recipeIds } = bulkDeleteSchema.parse(req.body);
    
    logger.info('Starting bulk recipe deletion', {
      count: recipeIds.length,
      recipeIds: recipeIds.slice(0, 5) // Log first 5 for debugging
    });

    const results = {
      successful: [] as string[],
      failed: [] as { id: string; error: string }[],
      total: recipeIds.length
    };

    // Process deletions
    for (const recipeId of recipeIds) {
      try {
        await storage.deleteRecipe(recipeId);
        results.successful.push(recipeId);
        logger.debug('Recipe deleted successfully', { recipeId });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.failed.push({ id: recipeId, error: errorMessage });
        logger.warn('Failed to delete recipe', { recipeId, error: errorMessage });
      }
    }

    const responseTime = Date.now() - startTime;
    performanceLogger.info('Bulk deletion completed', {
      operation: 'bulk_delete',
      total: results.total,
      successful: results.successful.length,
      failed: results.failed.length,
      responseTime
    });

    res.json({
      message: `Bulk deletion completed: ${results.successful.length}/${results.total} recipes deleted`,
      results,
      responseTime
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(`Invalid bulk delete data: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw error;
  }
});

// Bulk update recipes
export const bulkUpdateRecipes = asyncHandler(async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const { updates } = bulkUpdateSchema.parse(req.body);
    
    logger.info('Starting bulk recipe updates', {
      count: updates.length
    });

    const results = {
      successful: [] as any[],
      failed: [] as { id: string; error: string }[],
      total: updates.length
    };

    // Process updates
    for (const { recipeId, data } of updates) {
      try {
        const updatedRecipe = await storage.updateRecipe(recipeId, data);
        results.successful.push(updatedRecipe);
        logger.debug('Recipe updated successfully', { recipeId });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.failed.push({ id: recipeId, error: errorMessage });
        logger.warn('Failed to update recipe', { recipeId, error: errorMessage });
      }
    }

    const responseTime = Date.now() - startTime;
    performanceLogger.info('Bulk updates completed', {
      operation: 'bulk_update',
      total: results.total,
      successful: results.successful.length,
      failed: results.failed.length,
      responseTime
    });

    res.json({
      message: `Bulk updates completed: ${results.successful.length}/${results.total} recipes updated`,
      results,
      responseTime
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(`Invalid bulk update data: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw error;
  }
});

// Bulk import recipes
export const bulkImportRecipes = asyncHandler(async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const { recipes } = bulkImportSchema.parse(req.body);
    
    logger.info('Starting bulk recipe import', {
      count: recipes.length
    });

    const results = {
      successful: [] as any[],
      failed: [] as { index: number; error: string; recipe?: any }[],
      total: recipes.length
    };

    // Process imports
    for (let i = 0; i < recipes.length; i++) {
      const recipeData = recipes[i];
      try {
        const createdRecipe = await storage.createRecipe(recipeData);
        results.successful.push(createdRecipe);
        logger.debug('Recipe imported successfully', { 
          recipeId: createdRecipe.id,
          name: createdRecipe.name 
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.failed.push({ 
          index: i, 
          error: errorMessage,
          recipe: { name: recipeData.name }
        });
        logger.warn('Failed to import recipe', { 
          index: i, 
          recipeName: recipeData.name,
          error: errorMessage 
        });
      }
    }

    const responseTime = Date.now() - startTime;
    performanceLogger.info('Bulk import completed', {
      operation: 'bulk_import',
      total: results.total,
      successful: results.successful.length,
      failed: results.failed.length,
      responseTime
    });

    res.status(201).json({
      message: `Bulk import completed: ${results.successful.length}/${results.total} recipes imported`,
      results,
      responseTime
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(`Invalid bulk import data: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw error;
  }
});

// Bulk parse and import from text
export const bulkParseAndImport = asyncHandler(async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const { recipeTexts } = bulkTextImportSchema.parse(req.body);
    
    logger.info('Starting bulk recipe text parsing', {
      count: recipeTexts.length
    });

    const results = {
      successful: [] as any[],
      failed: [] as { index: number; error: string; text?: string }[],
      total: recipeTexts.length
    };

    // Process text parsing and imports
    for (let i = 0; i < recipeTexts.length; i++) {
      const recipeText = recipeTexts[i];
      try {
        logger.debug('Parsing recipe text', { index: i, textLength: recipeText.length });
        
        // Parse the recipe text
        const parsedRecipe = await parseRecipeText(recipeText);
        
        // Create the recipe
        const createdRecipe = await storage.createRecipe(parsedRecipe);
        results.successful.push(createdRecipe);
        
        logger.debug('Recipe parsed and imported successfully', { 
          recipeId: createdRecipe.id,
          name: createdRecipe.name 
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.failed.push({ 
          index: i, 
          error: errorMessage,
          text: recipeText.substring(0, 100) + '...'
        });
        logger.warn('Failed to parse and import recipe', { 
          index: i,
          error: errorMessage 
        });
      }
    }

    const responseTime = Date.now() - startTime;
    performanceLogger.info('Bulk text parsing completed', {
      operation: 'bulk_parse_text',
      total: results.total,
      successful: results.successful.length,
      failed: results.failed.length,
      responseTime
    });

    res.status(201).json({
      message: `Bulk parsing completed: ${results.successful.length}/${results.total} recipes parsed and imported`,
      results,
      responseTime
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(`Invalid bulk text import data: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw error;
  }
});

// Bulk import from URLs
export const bulkUrlImport = asyncHandler(async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const { urls } = bulkUrlImportSchema.parse(req.body);
    
    logger.info('Starting bulk URL import', {
      count: urls.length
    });

    const results = {
      successful: [] as any[],
      failed: [] as { index: number; error: string; url: string }[],
      total: urls.length
    };

    // Process URL imports
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      try {
        logger.debug('Importing recipe from URL', { index: i, url });
        
        // Parse the recipe from URL
        const urlResult = await parseRecipeFromURL(url);
        
        // Create the recipe
        const createdRecipe = await storage.createRecipe(urlResult.recipe);
        results.successful.push({
          recipe: createdRecipe,
          metadata: urlResult.metadata,
          source: { url }
        });
        
        logger.debug('Recipe imported from URL successfully', { 
          recipeId: createdRecipe.id,
          name: createdRecipe.name,
          url 
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        results.failed.push({ 
          index: i, 
          error: errorMessage,
          url
        });
        logger.warn('Failed to import recipe from URL', { 
          index: i,
          url,
          error: errorMessage 
        });
      }
    }

    const responseTime = Date.now() - startTime;
    performanceLogger.info('Bulk URL import completed', {
      operation: 'bulk_url_import',
      total: results.total,
      successful: results.successful.length,
      failed: results.failed.length,
      responseTime
    });

    res.status(201).json({
      message: `Bulk URL import completed: ${results.successful.length}/${results.total} recipes imported`,
      results,
      responseTime
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(`Invalid bulk URL import data: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw error;
  }
});

// Bulk export recipes
export const bulkExportRecipes = asyncHandler(async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const { recipeIds, format, includeImages } = bulkExportSchema.parse(req.query);
    
    logger.info('Starting bulk recipe export', {
      format,
      includeImages,
      count: recipeIds?.length || 'all'
    });

    // Get recipes to export
    let recipes;
    if (recipeIds && recipeIds.length > 0) {
      recipes = [];
      for (const id of recipeIds) {
        try {
          const recipe = await storage.getRecipe(id);
          if (recipe) {
            recipes.push(recipe);
          }
        } catch (error) {
          logger.warn('Failed to fetch recipe for export', { recipeId: id });
        }
      }
    } else {
      // Export all recipes
      const searchResult = await storage.searchRecipes('', undefined, 1000, 0);
      recipes = searchResult.recipes;
    }

    if (recipes.length === 0) {
      throw new NotFoundError('No recipes found to export');
    }

    const responseTime = Date.now() - startTime;
    performanceLogger.info('Bulk export completed', {
      operation: 'bulk_export',
      format,
      count: recipes.length,
      responseTime
    });

    // Format response based on export format
    switch (format) {
      case 'json':
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="recipes_bulk_export_${new Date().toISOString().split('T')[0]}.json"`);
        res.json({
          exportDate: new Date().toISOString(),
          totalRecipes: recipes.length,
          format: 'json',
          includeImages,
          recipes: includeImages ? recipes : recipes.map(({ imageUrl, ...recipe }) => recipe)
        });
        break;

      case 'csv':
        const csvData = generateCSV(recipes, includeImages);
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="recipes_bulk_export_${new Date().toISOString().split('T')[0]}.csv"`);
        res.send(csvData);
        break;

      case 'text':
        const textData = generateTextExport(recipes);
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Content-Disposition', `attachment; filename="recipes_bulk_export_${new Date().toISOString().split('T')[0]}.txt"`);
        res.send(textData);
        break;

      default:
        throw new ValidationError('Unsupported export format');
    }

    logger.info('Bulk export sent to client', {
      format,
      count: recipes.length,
      responseTime: Date.now() - startTime
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(`Invalid bulk export parameters: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw error;
  }
});

// Helper function to generate CSV
function generateCSV(recipes: any[], includeImages: boolean): string {
  const headers = [
    'ID', 'Name', 'Description', 'Difficulty', 'Servings', 
    'Prep Time', 'Cook Time', 'Instructions', 'Dietary Tags', 'Ingredients'
  ];
  
  if (includeImages) {
    headers.push('Image URL');
  }
  
  const rows = [headers.join(',')];
  
  recipes.forEach(recipe => {
    const row = [
      `"${recipe.id}"`,
      `"${recipe.name?.replace(/"/g, '""') || ''}"`,
      `"${recipe.description?.replace(/"/g, '""') || ''}"`,
      `"${recipe.difficulty}"`,
      recipe.servings,
      recipe.prepTime || '',
      recipe.cookTime || '',
      `"${recipe.instructions?.replace(/"/g, '""') || ''}"`,
      `"${recipe.dietaryTags?.join('; ') || ''}"`,
      `"${recipe.ingredients?.map((ing: any) => `${ing.quantity} ${ing.unit} ${ing.name}`).join('; ') || ''}"`
    ];
    
    if (includeImages) {
      row.push(`"${recipe.imageUrl || ''}"`);
    }
    
    rows.push(row.join(','));
  });
  
  return rows.join('\n');
}

// Helper function to generate text export
function generateTextExport(recipes: any[]): string {
  const lines = [];
  
  lines.push('MEALMATE RECIPES BULK EXPORT');
  lines.push('='.repeat(50));
  lines.push(`Exported on: ${new Date().toLocaleDateString()}`);
  lines.push(`Total recipes: ${recipes.length}`);
  lines.push('');
  
  recipes.forEach((recipe, index) => {
    lines.push(`${index + 1}. ${recipe.name.toUpperCase()}`);
    lines.push('-'.repeat(recipe.name.length + 3));
    
    if (recipe.description) {
      lines.push(recipe.description);
      lines.push('');
    }
    
    lines.push(`Difficulty: ${recipe.difficulty}`);
    lines.push(`Servings: ${recipe.servings}`);
    if (recipe.prepTime) lines.push(`Prep Time: ${recipe.prepTime} minutes`);
    if (recipe.cookTime) lines.push(`Cook Time: ${recipe.cookTime} minutes`);
    
    if (recipe.dietaryTags?.length > 0) {
      lines.push(`Tags: ${recipe.dietaryTags.join(', ')}`);
    }
    
    lines.push('');
    lines.push('INGREDIENTS:');
    recipe.ingredients?.forEach((ing: any) => {
      lines.push(`• ${ing.quantity} ${ing.unit || ''} ${ing.name}`.trim());
    });
    
    lines.push('');
    lines.push('INSTRUCTIONS:');
    lines.push(recipe.instructions || 'No instructions provided');
    
    lines.push('');
    lines.push('=' + '='.repeat(48));
    lines.push('');
  });
  
  return lines.join('\n');
}

// Get bulk operation statistics
export const getBulkOperationStats = asyncHandler(async (req: Request, res: Response) => {
  // This would typically come from a database or cache
  // For now, return basic stats
  res.json({
    supportedOperations: {
      delete: { maxItems: 100, description: 'Bulk delete recipes' },
      update: { maxItems: 50, description: 'Bulk update recipe data' },
      import: { maxItems: 50, description: 'Bulk import recipe data' },
      parseText: { maxItems: 20, description: 'Bulk parse from text' },
      importUrls: { maxItems: 10, description: 'Bulk import from URLs' },
      export: { formats: ['json', 'csv', 'text'], description: 'Bulk export recipes' }
    },
    rateLimit: {
      requestsPerMinute: 10,
      description: 'Maximum bulk operations per minute'
    },
    timestamp: new Date().toISOString()
  });
});