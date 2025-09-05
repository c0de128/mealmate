import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertRecipeSchema, insertMealPlanSchema, insertShoppingListItemSchema, insertRecipeCollectionSchema } from "@shared/schema";
import { parseRecipeText } from "./recipe-parser";
import { parseRecipeFromURL } from "./url-recipe-parser";
import { calculateRecipeNutrition, calculateMealPlanNutrition } from "./nutrition";
import { createRecipeShareLink, getSharedRecipe, getRecipeShareLinks, revokeShareLink, exportRecipe, getShareStatistics } from "./recipe-sharing";
import { bulkDeleteRecipes, bulkUpdateRecipes, bulkImportRecipes, bulkParseAndImport, bulkUrlImport, bulkExportRecipes, getBulkOperationStats } from "./bulk-operations";
import { createManualBackup, getBackupHistory, getBackupStats, downloadBackup, deleteBackup, restoreFromBackup, updateBackupConfig, getBackupConfig } from "./backup-api";
import { exportAllData, importData, getExportStats } from "./data-export-import";
import { z } from "zod";
import { asyncHandler, ValidationError, NotFoundError, getErrorStatus, getUserFriendlyMessage, sanitizeInput } from "./error-handler";
import { createValidationMiddleware, rateLimitValidation } from "./validation-middleware";
import multer from "multer";

export async function registerRoutes(app: Express): Promise<Server> {
  // Configure multer for file uploads
  const upload = multer({
    dest: '/tmp/',
    limits: {
      fileSize: 50 * 1024 * 1024, // 50MB limit
      files: 1
    },
    fileFilter: (req, file, cb) => {
      const allowedMimeTypes = ['application/json', 'application/zip', 'text/csv', 'application/octet-stream'];
      if (allowedMimeTypes.includes(file.mimetype) || file.originalname.endsWith('.json') || file.originalname.endsWith('.zip')) {
        cb(null, true);
      } else {
        cb(new ValidationError('Invalid file type. Only JSON and ZIP files are allowed.'));
      }
    }
  });
  // Recipe routes
  app.get("/api/recipes", createValidationMiddleware.recipeSearch(), asyncHandler(async (req, res) => {
    const { search, dietary, page, limit } = req.query;
    
    // Parse and validate pagination parameters
    const pageNum = parseInt(page as string) || 1;
    const limitNum = parseInt(limit as string) || 10;
    
    // Validate pagination bounds
    if (pageNum < 1 || limitNum < 1 || limitNum > 100) {
      throw new ValidationError("Page must be >= 1, limit must be 1-100");
    }
    
    const offset = (pageNum - 1) * limitNum;
    
    // Sanitize search input
    const sanitizedSearch = search ? sanitizeInput(search as string) : "";
    const sanitizedDietary = dietary ? sanitizeInput(dietary as string) : undefined;
    
    const result = await storage.searchRecipes(
      sanitizedSearch,
      sanitizedDietary,
      limitNum,
      offset
    );
    
    res.json({
      data: result.recipes,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: result.total,
        totalPages: Math.ceil(result.total / limitNum),
        hasNextPage: pageNum < Math.ceil(result.total / limitNum),
        hasPreviousPage: pageNum > 1
      }
    });
  }));

  app.get("/api/recipes/:id", createValidationMiddleware.recipeGet(), asyncHandler(async (req, res) => {
    const recipe = await storage.getRecipe(req.params.id);
    if (!recipe) {
      throw new NotFoundError('Recipe', req.params.id);
    }
    res.json(recipe);
  }));

  app.post("/api/recipes", createValidationMiddleware.recipeCreate(), asyncHandler(async (req, res) => {
    // Sanitize input data
    const sanitizedBody = sanitizeInput(req.body);
    
    let validatedData;
    try {
      validatedData = insertRecipeSchema.parse(sanitizedBody);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors = error.errors.map(err => `${err.path.join('.')}: ${err.message}`).join(', ');
        throw new ValidationError(`Invalid recipe data: ${fieldErrors}`);
      }
      throw error;
    }
    
    const recipe = await storage.createRecipe(validatedData);
    res.status(201).json(recipe);
  }));

  app.put("/api/recipes/:id", createValidationMiddleware.recipeUpdate(), asyncHandler(async (req, res) => {
    // Sanitize input data
    const sanitizedBody = sanitizeInput(req.body);
    
    let validatedData;
    try {
      validatedData = insertRecipeSchema.partial().parse(sanitizedBody);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const fieldErrors = error.errors.map(err => `${err.path.join('.')}: ${err.message}`).join(', ');
        throw new ValidationError(`Invalid recipe data: ${fieldErrors}`);
      }
      throw error;
    }
    
    const recipe = await storage.updateRecipe(req.params.id, validatedData);
    res.json(recipe);
  }));

  app.delete("/api/recipes/:id", asyncHandler(async (req, res) => {
    await storage.deleteRecipe(req.params.id);
    res.status(204).send();
  }));

  // Recipe parser route
  app.post("/api/recipes/parse", createValidationMiddleware.textParse(), rateLimitValidation(10, 60000), asyncHandler(async (req, res) => {
    const { recipeText } = req.body;
    
    if (!recipeText || typeof recipeText !== 'string') {
      throw new ValidationError("Recipe text is required and must be a string");
    }
    
    if (recipeText.trim().length < 20) {
      throw new ValidationError("Recipe text must be at least 20 characters long");
    }
    
    // Sanitize the input text
    const sanitizedText = sanitizeInput(recipeText);
    
    console.log('Parsing recipe text:', sanitizedText.substring(0, 100) + '...');
    const parsedRecipe = await parseRecipeText(sanitizedText);
    console.log('Recipe parsed successfully:', parsedRecipe.name);
    
    res.json(parsedRecipe);
  }));

  // Recipe URL import route
  app.post("/api/recipes/import-url", createValidationMiddleware.urlParse(), rateLimitValidation(5, 60000), asyncHandler(async (req, res) => {
    const { url } = req.body;
    
    if (!url || typeof url !== 'string') {
      throw new ValidationError("URL is required and must be a string");
    }
    
    // Basic URL validation
    try {
      new URL(url);
    } catch {
      throw new ValidationError("Invalid URL format");
    }
    
    // Sanitize the URL (basic cleaning)
    const sanitizedUrl = url.trim();
    
    console.log('Importing recipe from URL:', sanitizedUrl);
    const result = await parseRecipeFromURL(sanitizedUrl);
    console.log('Recipe imported successfully:', result.recipe.name);
    
    res.json({
      recipe: result.recipe,
      metadata: result.metadata,
      source: {
        url: sanitizedUrl,
        extractedTextPreview: result.extractedText.substring(0, 200) + '...'
      }
    });
  }));

  // Recipe sharing routes
  app.post("/api/recipes/:id/share", createRecipeShareLink);
  app.get("/api/share/recipe/:shareId", getSharedRecipe);
  app.get("/api/recipes/:id/share-links", getRecipeShareLinks);
  app.delete("/api/share/:shareId", revokeShareLink);
  app.get("/api/recipes/:id/export", exportRecipe);
  app.get("/api/share/statistics", getShareStatistics);

  // Bulk operations routes
  app.delete("/api/recipes/bulk", createValidationMiddleware.bulkDelete(), bulkDeleteRecipes);
  app.put("/api/recipes/bulk", createValidationMiddleware.bulkUpdate(), bulkUpdateRecipes);
  app.post("/api/recipes/bulk", bulkImportRecipes);
  app.post("/api/recipes/bulk/parse-text", bulkParseAndImport);
  app.post("/api/recipes/bulk/import-urls", bulkUrlImport);
  app.get("/api/recipes/bulk/export", bulkExportRecipes);
  app.get("/api/bulk/stats", getBulkOperationStats);

  // Backup and restore routes
  app.post("/api/backup/create", createManualBackup);
  app.get("/api/backup/history", getBackupHistory);
  app.get("/api/backup/stats", getBackupStats);
  app.get("/api/backup/:backupId/download", downloadBackup);
  app.delete("/api/backup/:backupId", deleteBackup);
  app.post("/api/backup/restore", restoreFromBackup);
  app.get("/api/backup/config", getBackupConfig);
  app.put("/api/backup/config", updateBackupConfig);

  // Data export/import routes
  app.post("/api/data/export", createValidationMiddleware.dataExport(), rateLimitValidation(5, 300000), exportAllData);
  app.post("/api/data/import", upload.single('file'), createValidationMiddleware.dataImport(), rateLimitValidation(3, 600000), importData);
  app.get("/api/data/export/stats", getExportStats);

  // Meal plan routes
  app.get("/api/meal-plans", createValidationMiddleware.mealPlanList(), async (req, res) => {
    try {
      const { weekStartDate } = req.query;
      if (!weekStartDate) {
        return res.status(400).json({ message: "weekStartDate is required" });
      }
      const mealPlans = await storage.getMealPlans(weekStartDate as string);
      res.json(mealPlans);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch meal plans" });
    }
  });

  app.post("/api/meal-plans", createValidationMiddleware.mealPlanCreate(), async (req, res) => {
    try {
      const validatedData = insertMealPlanSchema.parse(req.body);
      
      // Check if meal plan already exists for this date/mealType
      const existing = await storage.getMealPlan(validatedData.date, validatedData.mealType);
      if (existing) {
        // Update existing meal plan
        const updated = await storage.updateMealPlan(existing.id, validatedData);
        return res.json(updated);
      }
      
      const mealPlan = await storage.createMealPlan(validatedData);
      res.status(201).json(mealPlan);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid meal plan data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create meal plan" });
    }
  });

  app.delete("/api/meal-plans/:id", async (req, res) => {
    try {
      await storage.deleteMealPlan(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete meal plan" });
    }
  });

  // Shopping list routes
  app.get("/api/shopping-list", async (req, res) => {
    try {
      const { weekStartDate } = req.query;
      if (!weekStartDate) {
        return res.status(400).json({ message: "weekStartDate is required" });
      }
      const items = await storage.getShoppingList(weekStartDate as string);
      res.json(items);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch shopping list" });
    }
  });

  app.post("/api/shopping-list/generate", async (req, res) => {
    try {
      const { weekStartDate } = req.body;
      if (!weekStartDate) {
        return res.status(400).json({ message: "weekStartDate is required" });
      }
      const items = await storage.generateShoppingList(weekStartDate);
      res.json(items);
    } catch (error) {
      res.status(500).json({ message: "Failed to generate shopping list" });
    }
  });

  app.put("/api/shopping-list/:id", async (req, res) => {
    try {
      const validatedData = insertShoppingListItemSchema.partial().parse(req.body);
      const item = await storage.updateShoppingListItem(req.params.id, validatedData);
      res.json(item);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid shopping list item data", errors: error.errors });
      }
      if (error instanceof Error && error.message === "Shopping list item not found") {
        return res.status(404).json({ message: "Shopping list item not found" });
      }
      res.status(500).json({ message: "Failed to update shopping list item" });
    }
  });

  app.delete("/api/shopping-list/:id", async (req, res) => {
    try {
      await storage.deleteShoppingListItem(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete shopping list item" });
    }
  });

  // Recipe collection routes
  app.get("/api/collections", async (req, res) => {
    try {
      const collections = await storage.getRecipeCollections();
      res.json(collections);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch collections" });
    }
  });

  app.post("/api/collections", async (req, res) => {
    try {
      const validatedData = insertRecipeCollectionSchema.parse(req.body);
      const collection = await storage.createRecipeCollection(validatedData);
      res.status(201).json(collection);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid collection data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create collection" });
    }
  });

  app.get("/api/collections/:id", async (req, res) => {
    try {
      const collection = await storage.getRecipeCollection(req.params.id);
      if (!collection) {
        return res.status(404).json({ message: "Collection not found" });
      }
      res.json(collection);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch collection" });
    }
  });

  app.get("/api/collections/:id/recipes", async (req, res) => {
    try {
      const recipes = await storage.getRecipesByCollection(req.params.id);
      res.json(recipes);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch collection recipes" });
    }
  });

  app.post("/api/collections/:id/recipes", async (req, res) => {
    try {
      const { recipeId } = req.body;
      if (!recipeId) {
        return res.status(400).json({ message: "Recipe ID is required" });
      }
      const item = await storage.addRecipeToCollection(req.params.id, recipeId);
      res.status(201).json(item);
    } catch (error) {
      res.status(500).json({ message: "Failed to add recipe to collection" });
    }
  });

  app.delete("/api/collections/:id/recipes/:recipeId", async (req, res) => {
    try {
      await storage.removeRecipeFromCollection(req.params.id, req.params.recipeId);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to remove recipe from collection" });
    }
  });

  app.delete("/api/collections/:id", async (req, res) => {
    try {
      await storage.deleteRecipeCollection(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete collection" });
    }
  });

  // Recipe favorites and ratings routes
  app.post("/api/recipes/:id/favorite", async (req, res) => {
    try {
      const recipe = await storage.toggleRecipeFavorite(req.params.id);
      res.json(recipe);
    } catch (error) {
      if (error instanceof Error && error.message === "Recipe not found") {
        return res.status(404).json({ message: "Recipe not found" });
      }
      res.status(500).json({ message: "Failed to toggle favorite" });
    }
  });

  app.get("/api/recipes/favorites", async (req, res) => {
    try {
      const favorites = await storage.getFavoriteRecipes();
      res.json(favorites);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch favorite recipes" });
    }
  });

  app.post("/api/recipes/:id/rating", createValidationMiddleware.rating(), async (req, res) => {
    try {
      const { rating } = req.body;
      if (!rating || rating < 1 || rating > 5) {
        return res.status(400).json({ message: "Rating must be between 1 and 5" });
      }
      const recipe = await storage.setRecipeRating(req.params.id, rating);
      res.json(recipe);
    } catch (error) {
      if (error instanceof Error && error.message === "Recipe not found") {
        return res.status(404).json({ message: "Recipe not found" });
      }
      res.status(500).json({ message: "Failed to set rating" });
    }
  });

  // Nutrition analysis routes
  app.post("/api/recipes/:id/nutrition", async (req, res) => {
    try {
      const recipe = await storage.getRecipe(req.params.id);
      if (!recipe) {
        return res.status(404).json({ message: "Recipe not found" });
      }
      
      const nutrition = calculateRecipeNutrition(recipe.ingredients);
      res.json({
        recipeId: recipe.id,
        recipeName: recipe.name,
        servings: recipe.servings,
        nutritionPerServing: {
          calories: Math.round(nutrition.calories / recipe.servings),
          protein: Math.round((nutrition.protein / recipe.servings) * 10) / 10,
          carbs: Math.round((nutrition.carbs / recipe.servings) * 10) / 10,
          fat: Math.round((nutrition.fat / recipe.servings) * 10) / 10,
          fiber: Math.round((nutrition.fiber / recipe.servings) * 10) / 10,
          sodium: Math.round(nutrition.sodium / recipe.servings),
        },
        nutritionTotal: nutrition
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to calculate nutrition" });
    }
  });

  app.post("/api/meal-plans/nutrition", async (req, res) => {
    try {
      const { weekStartDate } = req.body;
      if (!weekStartDate) {
        return res.status(400).json({ message: "weekStartDate is required" });
      }
      
      const mealPlans = await storage.getMealPlans(weekStartDate);
      const recipesWithServings = [];
      
      for (const mealPlan of mealPlans) {
        if (mealPlan.recipeId) {
          const recipe = await storage.getRecipe(mealPlan.recipeId);
          if (recipe) {
            recipesWithServings.push({
              recipe,
              servings: mealPlan.servings
            });
          }
        }
      }
      
      const totalNutrition = calculateMealPlanNutrition(recipesWithServings);
      const dailyNutrition = {
        calories: Math.round(totalNutrition.calories / 7),
        protein: Math.round((totalNutrition.protein / 7) * 10) / 10,
        carbs: Math.round((totalNutrition.carbs / 7) * 10) / 10,
        fat: Math.round((totalNutrition.fat / 7) * 10) / 10,
        fiber: Math.round((totalNutrition.fiber / 7) * 10) / 10,
        sodium: Math.round(totalNutrition.sodium / 7),
      };
      
      res.json({
        weekStartDate,
        totalMeals: mealPlans.length,
        weeklyNutrition: totalNutrition,
        dailyAverageNutrition: dailyNutrition
      });
    } catch (error) {
      res.status(500).json({ message: "Failed to calculate meal plan nutrition" });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
