import { eq, and, gte, lte, desc } from "drizzle-orm";
import { db } from "./db";
import { recipes, mealPlans, shoppingListItems } from "@shared/schema";
import { type Recipe, type InsertRecipe, type MealPlan, type InsertMealPlan, type ShoppingListItem, type InsertShoppingListItem, type Ingredient } from "@shared/schema";

export interface IStorage {
  // Recipe operations
  getRecipes(): Promise<Recipe[]>;
  getRecipe(id: string): Promise<Recipe | undefined>;
  createRecipe(recipe: InsertRecipe): Promise<Recipe>;
  updateRecipe(id: string, recipe: Partial<InsertRecipe>): Promise<Recipe>;
  deleteRecipe(id: string): Promise<void>;
  searchRecipes(query: string, dietaryFilter?: string): Promise<Recipe[]>;
  
  // Meal plan operations
  getMealPlans(weekStartDate: string): Promise<MealPlan[]>;
  getMealPlan(date: string, mealType: string): Promise<MealPlan | undefined>;
  createMealPlan(mealPlan: InsertMealPlan): Promise<MealPlan>;
  updateMealPlan(id: string, mealPlan: Partial<InsertMealPlan>): Promise<MealPlan>;
  deleteMealPlan(id: string): Promise<void>;
  
  // Shopping list operations
  getShoppingList(weekStartDate: string): Promise<ShoppingListItem[]>;
  createShoppingListItem(item: InsertShoppingListItem): Promise<ShoppingListItem>;
  updateShoppingListItem(id: string, item: Partial<InsertShoppingListItem>): Promise<ShoppingListItem>;
  deleteShoppingListItem(id: string): Promise<void>;
  generateShoppingList(weekStartDate: string): Promise<ShoppingListItem[]>;
}

export class DatabaseStorage implements IStorage {
  constructor() {
    // Database will handle initialization
  }

  async initializeSampleData() {
    // Check if we already have sample data
    const existingRecipes = await this.getRecipes();
    if (existingRecipes.length > 0) {
      return; // Sample data already exists
    }

    const sampleRecipes: InsertRecipe[] = [
      {
        name: "Mediterranean Quinoa Bowl",
        description: "Fresh quinoa with roasted vegetables, feta, and herb dressing",
        prepTime: 15,
        cookTime: 25,
        difficulty: "easy",
        servings: 4,
        ingredients: [
          { name: "quinoa", quantity: "1", unit: "cup" },
          { name: "cherry tomatoes", quantity: "2", unit: "cups" },
          { name: "cucumber", quantity: "1", unit: "large" },
          { name: "feta cheese", quantity: "1/2", unit: "cup" },
          { name: "olive oil", quantity: "3", unit: "tbsp" },
          { name: "lemon juice", quantity: "2", unit: "tbsp" }
        ],
        instructions: "1. Cook quinoa according to package directions.\n2. Dice cucumber and halve cherry tomatoes.\n3. Combine quinoa, vegetables, and feta.\n4. Whisk olive oil and lemon juice, drizzle over bowl.\n5. Season with salt and pepper to taste.",
        dietaryTags: ["vegetarian", "healthy", "gluten-free"],
        imageUrl: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=200&fit=crop"
      },
      {
        name: "Honey Garlic Chicken Stir Fry",
        description: "Quick and flavorful stir fry with fresh vegetables",
        prepTime: 15,
        cookTime: 20,
        difficulty: "easy",
        servings: 4,
        ingredients: [
          { name: "chicken breast", quantity: "1", unit: "lb" },
          { name: "broccoli", quantity: "2", unit: "cups" },
          { name: "bell peppers", quantity: "2", unit: "medium" },
          { name: "honey", quantity: "3", unit: "tbsp" },
          { name: "soy sauce", quantity: "3", unit: "tbsp" },
          { name: "garlic", quantity: "4", unit: "cloves" }
        ],
        instructions: "1. Cut chicken into bite-sized pieces.\n2. Heat oil in wok or large pan.\n3. Cook chicken until no longer pink.\n4. Add vegetables and stir fry for 5 minutes.\n5. Mix honey, soy sauce, and minced garlic.\n6. Add sauce to pan and cook for 2 more minutes.",
        dietaryTags: ["protein", "low-carb"],
        imageUrl: "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&h=200&fit=crop"
      }
    ];

    // Insert sample data
    for (const recipe of sampleRecipes) {
      await this.createRecipe(recipe);
    }
  }

  async getRecipes(): Promise<Recipe[]> {
    return await db.select().from(recipes).orderBy(desc(recipes.createdAt));
  }

  async getRecipe(id: string): Promise<Recipe | undefined> {
    const result = await db.select().from(recipes).where(eq(recipes.id, id)).limit(1);
    return result[0];
  }

  async createRecipe(insertRecipe: InsertRecipe): Promise<Recipe> {
    const result = await db.insert(recipes).values(insertRecipe).returning();
    return result[0];
  }

  async updateRecipe(id: string, updateData: Partial<InsertRecipe>): Promise<Recipe> {
    const result = await db.update(recipes).set(updateData).where(eq(recipes.id, id)).returning();
    if (result.length === 0) {
      throw new Error("Recipe not found");
    }
    return result[0];
  }

  async deleteRecipe(id: string): Promise<void> {
    // Delete related meal plans first (foreign key constraint)
    await db.delete(mealPlans).where(eq(mealPlans.recipeId, id));
    // Delete the recipe
    await db.delete(recipes).where(eq(recipes.id, id));
  }

  async searchRecipes(query: string, dietaryFilter?: string): Promise<Recipe[]> {
    let dbQuery = db.select().from(recipes);
    
    // Apply filters
    const conditions = [];
    
    if (query) {
      // Search in name, description, and ingredients (JSON search)
      conditions.push(
        // Note: For production, consider using full-text search or specialized search indices
        // This is a simplified implementation
        // In PostgreSQL, you might use tsvector for better text search
      );
    }
    
    if (dietaryFilter && dietaryFilter !== "all") {
      // Search in dietaryTags array
      // Note: This requires proper array operations in Drizzle/PostgreSQL
    }
    
    // For now, get all recipes and filter in memory (can be optimized with proper DB queries)
    const allRecipes = await db.select().from(recipes).orderBy(desc(recipes.createdAt));
    
    return allRecipes.filter(recipe => {
      const matchesQuery = !query || 
        recipe.name.toLowerCase().includes(query.toLowerCase()) ||
        recipe.description?.toLowerCase().includes(query.toLowerCase()) ||
        recipe.ingredients.some(ing => ing.name.toLowerCase().includes(query.toLowerCase()));
      
      const matchesDietary = !dietaryFilter || 
        dietaryFilter === "all" ||
        recipe.dietaryTags.includes(dietaryFilter);
      
      return matchesQuery && matchesDietary;
    });
  }

  async getMealPlans(weekStartDate: string): Promise<MealPlan[]> {
    const weekStart = new Date(weekStartDate);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    
    return await db.select().from(mealPlans)
      .where(and(
        gte(mealPlans.date, weekStartDate),
        lte(mealPlans.date, weekEnd.toISOString().split('T')[0])
      ));
  }

  async getMealPlan(date: string, mealType: string): Promise<MealPlan | undefined> {
    const result = await db.select().from(mealPlans)
      .where(and(
        eq(mealPlans.date, date),
        eq(mealPlans.mealType, mealType)
      ))
      .limit(1);
    return result[0];
  }

  async createMealPlan(insertMealPlan: InsertMealPlan): Promise<MealPlan> {
    const result = await db.insert(mealPlans).values(insertMealPlan).returning();
    return result[0];
  }

  async updateMealPlan(id: string, updateData: Partial<InsertMealPlan>): Promise<MealPlan> {
    const result = await db.update(mealPlans).set(updateData).where(eq(mealPlans.id, id)).returning();
    if (result.length === 0) {
      throw new Error("Meal plan not found");
    }
    return result[0];
  }

  async deleteMealPlan(id: string): Promise<void> {
    await db.delete(mealPlans).where(eq(mealPlans.id, id));
  }

  async getShoppingList(weekStartDate: string): Promise<ShoppingListItem[]> {
    return await db.select().from(shoppingListItems)
      .where(eq(shoppingListItems.weekStartDate, weekStartDate));
  }

  async createShoppingListItem(insertItem: InsertShoppingListItem): Promise<ShoppingListItem> {
    const result = await db.insert(shoppingListItems).values(insertItem).returning();
    return result[0];
  }

  async updateShoppingListItem(id: string, updateData: Partial<InsertShoppingListItem>): Promise<ShoppingListItem> {
    const result = await db.update(shoppingListItems).set(updateData).where(eq(shoppingListItems.id, id)).returning();
    if (result.length === 0) {
      throw new Error("Shopping list item not found");
    }
    return result[0];
  }

  async deleteShoppingListItem(id: string): Promise<void> {
    await db.delete(shoppingListItems).where(eq(shoppingListItems.id, id));
  }

  async generateShoppingList(weekStartDate: string): Promise<ShoppingListItem[]> {
    // Clear existing shopping list for this week
    await db.delete(shoppingListItems).where(eq(shoppingListItems.weekStartDate, weekStartDate));

    // Get all meal plans for the week
    const weekMealPlans = await this.getMealPlans(weekStartDate);
    const ingredientMap = new Map<string, { quantity: number, unit: string, estimatedCost: string }>();

    // Aggregate ingredients from all planned meals
    for (const mealPlan of weekMealPlans) {
      if (!mealPlan.recipeId) continue;
      
      const recipe = await this.getRecipe(mealPlan.recipeId);
      if (!recipe) continue;

      const scale = mealPlan.servings / recipe.servings;

      for (const ingredient of recipe.ingredients) {
        const key = ingredient.name.toLowerCase();
        const scaledQuantity = parseFloat(ingredient.quantity) * scale;
        
        if (ingredientMap.has(key)) {
          const existing = ingredientMap.get(key)!;
          existing.quantity += scaledQuantity;
        } else {
          ingredientMap.set(key, {
            quantity: scaledQuantity,
            unit: ingredient.unit,
            estimatedCost: this.estimateIngredientCost(ingredient.name, scaledQuantity)
          });
        }
      }
    }

    // Create shopping list items
    const newItems: ShoppingListItem[] = [];
    for (const [name, data] of Array.from(ingredientMap.entries())) {
      const item = await this.createShoppingListItem({
        weekStartDate,
        ingredient: name,
        quantity: data.quantity.toString(),
        unit: data.unit,
        checked: 0,
        estimatedCost: data.estimatedCost
      });
      newItems.push(item);
    }

    return newItems;
  }

  private estimateIngredientCost(ingredient: string, quantity: number): string {
    // Simple cost estimation - in a real app this would come from a pricing API
    const baseCosts: Record<string, number> = {
      "quinoa": 2.50,
      "chicken breast": 6.99,
      "cherry tomatoes": 3.99,
      "cucumber": 1.49,
      "feta cheese": 4.99,
      "olive oil": 0.50,
      "lemon juice": 0.25,
      "broccoli": 2.99,
      "bell peppers": 1.99,
      "honey": 0.75,
      "soy sauce": 0.30,
      "garlic": 0.25
    };

    const unitCost = baseCosts[ingredient.toLowerCase()] || 1.99;
    return (unitCost * Math.max(quantity, 0.1)).toFixed(2);
  }
}

export const storage = new DatabaseStorage();

// Initialize sample data on startup
storage.initializeSampleData().catch(console.error);
