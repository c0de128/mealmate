import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { insertRecipeSchema, insertMealPlanSchema, insertShoppingListItemSchema } from "@shared/schema";
import { parseRecipeText } from "./recipe-parser";
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

  const httpServer = createServer(app);
  return httpServer;
}
