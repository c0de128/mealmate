import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertRecipeSchema, insertMealPlanSchema, insertShoppingListItemSchema, insertRecipeCollectionSchema } from "@shared/schema";
import { parseRecipeText } from "./recipe-parser";
import { calculateRecipeNutrition, calculateMealPlanNutrition } from "./nutrition";
import { z } from "zod";

export async function registerRoutes(app: Express): Promise<Server> {
  // Recipe routes
  app.get("/api/recipes", async (req, res) => {
    try {
      const { search, dietary } = req.query;
      const recipes = await storage.searchRecipes(
        search as string || "",
        dietary as string
      );
      res.json(recipes);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch recipes" });
    }
  });

  app.get("/api/recipes/:id", async (req, res) => {
    try {
      const recipe = await storage.getRecipe(req.params.id);
      if (!recipe) {
        return res.status(404).json({ message: "Recipe not found" });
      }
      res.json(recipe);
    } catch (error) {
      res.status(500).json({ message: "Failed to fetch recipe" });
    }
  });

  app.post("/api/recipes", async (req, res) => {
    try {
      const validatedData = insertRecipeSchema.parse(req.body);
      const recipe = await storage.createRecipe(validatedData);
      res.status(201).json(recipe);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid recipe data", errors: error.errors });
      }
      res.status(500).json({ message: "Failed to create recipe" });
    }
  });

  app.put("/api/recipes/:id", async (req, res) => {
    try {
      const validatedData = insertRecipeSchema.partial().parse(req.body);
      const recipe = await storage.updateRecipe(req.params.id, validatedData);
      res.json(recipe);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: "Invalid recipe data", errors: error.errors });
      }
      if (error instanceof Error && error.message === "Recipe not found") {
        return res.status(404).json({ message: "Recipe not found" });
      }
      res.status(500).json({ message: "Failed to update recipe" });
    }
  });

  app.delete("/api/recipes/:id", async (req, res) => {
    try {
      await storage.deleteRecipe(req.params.id);
      res.status(204).send();
    } catch (error) {
      res.status(500).json({ message: "Failed to delete recipe" });
    }
  });

  // Recipe parser route
  app.post("/api/recipes/parse", async (req, res) => {
    try {
      console.log('Parse route called with body:', req.body);
      const { recipeText } = req.body;
      if (!recipeText || typeof recipeText !== 'string') {
        console.log('Invalid recipe text provided:', recipeText);
        return res.status(400).json({ message: "Recipe text is required" });
      }
      
      console.log('Calling parseRecipeText with:', recipeText.substring(0, 100) + '...');
      const parsedRecipe = await parseRecipeText(recipeText);
      console.log('parseRecipeText returned:', parsedRecipe);
      res.json(parsedRecipe);
    } catch (error) {
      console.error("Recipe parsing failed:", error);
      res.status(500).json({ 
        message: error instanceof Error ? error.message : "Failed to parse recipe" 
      });
    }
  });

  // Meal plan routes
  app.get("/api/meal-plans", async (req, res) => {
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

  app.post("/api/meal-plans", async (req, res) => {
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

  app.post("/api/recipes/:id/rating", async (req, res) => {
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
