import { Request, Response } from 'express';
import { logger, performanceLogger } from './logger';
import { storage } from './storage';
import { NotFoundError, ValidationError, asyncHandler } from './error-handler';
import { z } from 'zod';
import * as path from 'path';
import * as fs from 'fs/promises';
import { createWriteStream } from 'fs';
import archiver from 'archiver';
import AdmZip from 'adm-zip';

// Export schemas
const exportDataSchema = z.object({
  includeRecipes: z.boolean().default(true),
  includeMealPlans: z.boolean().default(true),
  includeShoppingLists: z.boolean().default(true),
  format: z.enum(['json', 'csv', 'zip']).default('json'),
  dateRange: z.object({
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional()
  }).optional()
});

const importDataSchema = z.object({
  format: z.enum(['json', 'csv', 'zip']).default('json'),
  mergeStrategy: z.enum(['replace', 'merge', 'skip']).default('merge'),
  validateData: z.boolean().default(true)
});

// Export all data
export const exportAllData = asyncHandler(async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    const body = exportDataSchema.parse(req.body);
    
    logger.info('Data export initiated', {
      format: body.format,
      includeRecipes: body.includeRecipes,
      includeMealPlans: body.includeMealPlans,
      includeShoppingLists: body.includeShoppingLists,
      dateRange: body.dateRange
    });

    let exportData: any = {
      exportDate: new Date().toISOString(),
      version: '1.0',
      metadata: {
        totalRecipes: 0,
        totalMealPlans: 0,
        totalShoppingLists: 0
      }
    };

    // Export recipes
    if (body.includeRecipes) {
      const recipes = await storage.getAllRecipes();
      exportData.recipes = recipes;
      exportData.metadata.totalRecipes = recipes.length;
    }

    // Export meal plans
    if (body.includeMealPlans) {
      const mealPlans = await storage.getAllMealPlans();
      let filteredMealPlans = mealPlans;
      
      // Apply date filter if provided
      if (body.dateRange) {
        const startDate = body.dateRange.startDate ? new Date(body.dateRange.startDate) : null;
        const endDate = body.dateRange.endDate ? new Date(body.dateRange.endDate) : null;
        
        filteredMealPlans = mealPlans.filter(plan => {
          const planDate = new Date(plan.startDate);
          if (startDate && planDate < startDate) return false;
          if (endDate && planDate > endDate) return false;
          return true;
        });
      }
      
      exportData.mealPlans = filteredMealPlans;
      exportData.metadata.totalMealPlans = filteredMealPlans.length;
    }

    // Export shopping lists
    if (body.includeShoppingLists) {
      const shoppingLists = await storage.getAllShoppingLists();
      let filteredShoppingLists = shoppingLists;
      
      // Apply date filter if provided
      if (body.dateRange) {
        const startDate = body.dateRange.startDate ? new Date(body.dateRange.startDate) : null;
        const endDate = body.dateRange.endDate ? new Date(body.dateRange.endDate) : null;
        
        filteredShoppingLists = shoppingLists.filter(list => {
          const listDate = new Date(list.createdAt);
          if (startDate && listDate < startDate) return false;
          if (endDate && listDate > endDate) return false;
          return true;
        });
      }
      
      exportData.shoppingLists = filteredShoppingLists;
      exportData.metadata.totalShoppingLists = filteredShoppingLists.length;
    }

    const responseTime = Date.now() - startTime;

    if (body.format === 'json') {
      performanceLogger.info('Data export completed (JSON)', {
        operation: 'data_export',
        format: 'json',
        responseTime,
        totalItems: exportData.metadata.totalRecipes + exportData.metadata.totalMealPlans + exportData.metadata.totalShoppingLists
      });

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="mealmate-export-${new Date().toISOString().split('T')[0]}.json"`);
      res.json(exportData);

    } else if (body.format === 'csv') {
      // Generate CSV files for each data type
      const csvData = await generateCSVExport(exportData);
      
      performanceLogger.info('Data export completed (CSV)', {
        operation: 'data_export',
        format: 'csv',
        responseTime,
        files: Object.keys(csvData).length
      });

      // Create ZIP with CSV files
      const zipBuffer = await createZipFromCSV(csvData);
      
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="mealmate-export-${new Date().toISOString().split('T')[0]}.zip"`);
      res.send(zipBuffer);

    } else if (body.format === 'zip') {
      // Create comprehensive ZIP export
      const zipBuffer = await createComprehensiveZip(exportData);
      
      performanceLogger.info('Data export completed (ZIP)', {
        operation: 'data_export',
        format: 'zip',
        responseTime,
        totalItems: exportData.metadata.totalRecipes + exportData.metadata.totalMealPlans + exportData.metadata.totalShoppingLists
      });

      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="mealmate-export-${new Date().toISOString().split('T')[0]}.zip"`);
      res.send(zipBuffer);
    }

  } catch (error) {
    const responseTime = Date.now() - startTime;
    performanceLogger.info('Data export failed', {
      operation: 'data_export',
      responseTime,
      error: error instanceof Error ? error.message : String(error)
    });

    if (error instanceof z.ZodError) {
      throw new ValidationError(`Invalid export request: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw error;
  }
});

// Import data
export const importData = asyncHandler(async (req: Request, res: Response) => {
  const startTime = Date.now();
  
  try {
    if (!req.file) {
      throw new ValidationError('No file uploaded');
    }

    const body = importDataSchema.parse(req.body);
    
    logger.info('Data import initiated', {
      filename: req.file.originalname,
      format: body.format,
      mergeStrategy: body.mergeStrategy,
      validateData: body.validateData,
      fileSize: req.file.size
    });

    let importData: any;

    // Parse imported data based on format
    if (body.format === 'json') {
      const fileContent = await fs.readFile(req.file.path, 'utf-8');
      importData = JSON.parse(fileContent);
    } else if (body.format === 'zip') {
      importData = await parseZipImport(req.file.path);
    } else {
      throw new ValidationError('CSV import not yet supported');
    }

    // Validate import data structure
    if (body.validateData) {
      validateImportData(importData);
    }

    const importResults = {
      recipes: { imported: 0, skipped: 0, errors: 0 },
      mealPlans: { imported: 0, skipped: 0, errors: 0 },
      shoppingLists: { imported: 0, skipped: 0, errors: 0 },
      errors: [] as string[]
    };

    // Import recipes
    if (importData.recipes && Array.isArray(importData.recipes)) {
      for (const recipe of importData.recipes) {
        try {
          if (body.mergeStrategy === 'replace' || !(await storage.recipeExists(recipe.id))) {
            await storage.createRecipe(recipe);
            importResults.recipes.imported++;
          } else if (body.mergeStrategy === 'merge') {
            await storage.updateRecipe(recipe.id, recipe);
            importResults.recipes.imported++;
          } else {
            importResults.recipes.skipped++;
          }
        } catch (error) {
          importResults.recipes.errors++;
          importResults.errors.push(`Recipe ${recipe.title || recipe.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    // Import meal plans
    if (importData.mealPlans && Array.isArray(importData.mealPlans)) {
      for (const mealPlan of importData.mealPlans) {
        try {
          if (body.mergeStrategy === 'replace' || !(await storage.mealPlanExists(mealPlan.id))) {
            await storage.createMealPlan(mealPlan);
            importResults.mealPlans.imported++;
          } else if (body.mergeStrategy === 'merge') {
            await storage.updateMealPlan(mealPlan.id, mealPlan);
            importResults.mealPlans.imported++;
          } else {
            importResults.mealPlans.skipped++;
          }
        } catch (error) {
          importResults.mealPlans.errors++;
          importResults.errors.push(`Meal plan ${mealPlan.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    // Import shopping lists
    if (importData.shoppingLists && Array.isArray(importData.shoppingLists)) {
      for (const shoppingList of importData.shoppingLists) {
        try {
          if (body.mergeStrategy === 'replace' || !(await storage.shoppingListExists(shoppingList.id))) {
            await storage.createShoppingList(shoppingList);
            importResults.shoppingLists.imported++;
          } else if (body.mergeStrategy === 'merge') {
            await storage.updateShoppingList(shoppingList.id, shoppingList);
            importResults.shoppingLists.imported++;
          } else {
            importResults.shoppingLists.skipped++;
          }
        } catch (error) {
          importResults.shoppingLists.errors++;
          importResults.errors.push(`Shopping list ${shoppingList.id}: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
    }

    // Clean up uploaded file
    await fs.unlink(req.file.path);

    const responseTime = Date.now() - startTime;
    const totalImported = importResults.recipes.imported + importResults.mealPlans.imported + importResults.shoppingLists.imported;
    const totalErrors = importResults.recipes.errors + importResults.mealPlans.errors + importResults.shoppingLists.errors;

    performanceLogger.info('Data import completed', {
      operation: 'data_import',
      format: body.format,
      mergeStrategy: body.mergeStrategy,
      responseTime,
      totalImported,
      totalErrors
    });

    res.json({
      message: 'Data import completed',
      results: importResults,
      summary: {
        totalImported,
        totalErrors,
        duration: responseTime
      }
    });

  } catch (error) {
    const responseTime = Date.now() - startTime;
    performanceLogger.info('Data import failed', {
      operation: 'data_import',
      responseTime,
      error: error instanceof Error ? error.message : String(error)
    });

    // Clean up uploaded file on error
    if (req.file) {
      try {
        await fs.unlink(req.file.path);
      } catch (cleanupError) {
        logger.error('Failed to clean up uploaded file', {
          filename: req.file.path,
          error: cleanupError
        });
      }
    }

    if (error instanceof z.ZodError) {
      throw new ValidationError(`Invalid import request: ${error.errors.map(e => e.message).join(', ')}`);
    }
    throw error;
  }
});

// Helper functions
async function generateCSVExport(data: any): Promise<Record<string, string>> {
  const csvData: Record<string, string> = {};

  // Convert recipes to CSV
  if (data.recipes && data.recipes.length > 0) {
    const recipesCSV = convertArrayToCSV(data.recipes, [
      'id', 'title', 'description', 'prepTime', 'cookTime', 'servings', 
      'difficulty', 'cuisine', 'dietary', 'createdAt', 'updatedAt'
    ]);
    csvData['recipes.csv'] = recipesCSV;
  }

  // Convert meal plans to CSV
  if (data.mealPlans && data.mealPlans.length > 0) {
    const mealPlansCSV = convertArrayToCSV(data.mealPlans, [
      'id', 'startDate', 'endDate', 'title', 'createdAt', 'updatedAt'
    ]);
    csvData['meal-plans.csv'] = mealPlansCSV;
  }

  // Convert shopping lists to CSV
  if (data.shoppingLists && data.shoppingLists.length > 0) {
    const shoppingListsCSV = convertArrayToCSV(data.shoppingLists, [
      'id', 'title', 'createdAt', 'updatedAt'
    ]);
    csvData['shopping-lists.csv'] = shoppingListsCSV;
  }

  return csvData;
}

function convertArrayToCSV(array: any[], headers: string[]): string {
  const csvRows = [];
  
  // Add headers
  csvRows.push(headers.join(','));
  
  // Add data rows
  for (const item of array) {
    const values = headers.map(header => {
      const value = item[header];
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') return JSON.stringify(value).replace(/"/g, '""');
      return String(value).replace(/"/g, '""');
    });
    csvRows.push(`"${values.join('","')}"`);
  }
  
  return csvRows.join('\n');
}

async function createZipFromCSV(csvData: Record<string, string>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const buffers: Buffer[] = [];
    
    archive.on('data', (chunk) => buffers.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(buffers)));
    archive.on('error', reject);
    
    // Add CSV files to archive
    for (const [filename, content] of Object.entries(csvData)) {
      archive.append(content, { name: filename });
    }
    
    archive.finalize();
  });
}

async function createComprehensiveZip(data: any): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const buffers: Buffer[] = [];
    
    archive.on('data', (chunk) => buffers.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(buffers)));
    archive.on('error', reject);
    
    // Add JSON data
    archive.append(JSON.stringify(data, null, 2), { name: 'data.json' });
    
    // Add individual JSON files for each data type
    if (data.recipes) {
      archive.append(JSON.stringify(data.recipes, null, 2), { name: 'recipes.json' });
    }
    if (data.mealPlans) {
      archive.append(JSON.stringify(data.mealPlans, null, 2), { name: 'meal-plans.json' });
    }
    if (data.shoppingLists) {
      archive.append(JSON.stringify(data.shoppingLists, null, 2), { name: 'shopping-lists.json' });
    }
    
    // Add metadata
    archive.append(JSON.stringify(data.metadata, null, 2), { name: 'metadata.json' });
    
    archive.finalize();
  });
}

async function parseZipImport(filePath: string): Promise<any> {
  const zip = new AdmZip(filePath);
  const entries = zip.getEntries();
  
  let importData: any = {
    recipes: [],
    mealPlans: [],
    shoppingLists: []
  };
  
  for (const entry of entries) {
    if (entry.entryName === 'data.json') {
      // Full data export
      const content = entry.getData().toString('utf8');
      importData = JSON.parse(content);
      break;
    } else if (entry.entryName === 'recipes.json') {
      const content = entry.getData().toString('utf8');
      importData.recipes = JSON.parse(content);
    } else if (entry.entryName === 'meal-plans.json') {
      const content = entry.getData().toString('utf8');
      importData.mealPlans = JSON.parse(content);
    } else if (entry.entryName === 'shopping-lists.json') {
      const content = entry.getData().toString('utf8');
      importData.shoppingLists = JSON.parse(content);
    }
  }
  
  return importData;
}

function validateImportData(data: any): void {
  if (!data || typeof data !== 'object') {
    throw new ValidationError('Invalid import data format');
  }
  
  if (data.recipes && !Array.isArray(data.recipes)) {
    throw new ValidationError('Recipes data must be an array');
  }
  
  if (data.mealPlans && !Array.isArray(data.mealPlans)) {
    throw new ValidationError('Meal plans data must be an array');
  }
  
  if (data.shoppingLists && !Array.isArray(data.shoppingLists)) {
    throw new ValidationError('Shopping lists data must be an array');
  }
}

// Get export statistics
export const getExportStats = asyncHandler(async (req: Request, res: Response) => {
  try {
    const [recipes, mealPlans, shoppingLists] = await Promise.all([
      storage.getAllRecipes(),
      storage.getAllMealPlans(),
      storage.getAllShoppingLists()
    ]);

    res.json({
      statistics: {
        totalRecipes: recipes.length,
        totalMealPlans: mealPlans.length,
        totalShoppingLists: shoppingLists.length,
        lastUpdated: new Date().toISOString()
      },
      availableFormats: ['json', 'csv', 'zip'],
      supportedImports: ['json', 'zip']
    });

  } catch (error) {
    logger.error('Failed to get export statistics', {
      error: error instanceof Error ? error.message : String(error)
    });
    throw error;
  }
});