import { eq, and, gte, lte, desc, ilike, arrayContains, sql } from "drizzle-orm";
import { recipes, mealPlans, shoppingListItems, recipeCollections, recipeCollectionItems } from "@shared/schema";
import { type Recipe, type InsertRecipe, type MealPlan, type InsertMealPlan, type ShoppingListItem, type InsertShoppingListItem, type Ingredient, type RecipeCollection, type InsertRecipeCollection, type RecipeCollectionItem, type InsertRecipeCollectionItem } from "@shared/schema";

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
  
  // Recipe collection operations
  getRecipeCollections(): Promise<RecipeCollection[]>;
  getRecipeCollection(id: string): Promise<RecipeCollection | undefined>;
  createRecipeCollection(collection: InsertRecipeCollection): Promise<RecipeCollection>;
  updateRecipeCollection(id: string, collection: Partial<InsertRecipeCollection>): Promise<RecipeCollection>;
  deleteRecipeCollection(id: string): Promise<void>;
  
  // Collection item operations
  getRecipesByCollection(collectionId: string): Promise<Recipe[]>;
  addRecipeToCollection(collectionId: string, recipeId: string): Promise<RecipeCollectionItem>;
  removeRecipeFromCollection(collectionId: string, recipeId: string): Promise<void>;
  
  // Favorites operations
  toggleRecipeFavorite(id: string): Promise<Recipe>;
  getFavoriteRecipes(): Promise<Recipe[]>;
  
  // Rating operations
  setRecipeRating(id: string, rating: number): Promise<Recipe>;
}

export class DatabaseStorage implements IStorage {
  private db: any;
  
  constructor() {
    // Lazy load database connection only when DatabaseStorage is used
    const { db } = require("./db");
    this.db = db;
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
    return await this.this.db.select().from(recipes).orderBy(desc(recipes.createdAt));
  }

  async getRecipe(id: string): Promise<Recipe | undefined> {
    const result = await this.db.select().from(recipes).where(eq(recipes.id, id)).limit(1);
    return result[0];
  }

  async createRecipe(insertRecipe: InsertRecipe): Promise<Recipe> {
    const result = await this.db.insert(recipes).values(insertRecipe).returning();
    return result[0];
  }

  async updateRecipe(id: string, updateData: Partial<InsertRecipe>): Promise<Recipe> {
    const result = await this.db.update(recipes).set(updateData).where(eq(recipes.id, id)).returning();
    if (result.length === 0) {
      throw new Error("Recipe not found");
    }
    return result[0];
  }

  async deleteRecipe(id: string): Promise<void> {
    // Delete related meal plans first (foreign key constraint)
    await this.db.delete(mealPlans).where(eq(mealPlans.recipeId, id));
    // Delete the recipe
    await this.db.delete(recipes).where(eq(recipes.id, id));
  }

  async searchRecipes(query: string, dietaryFilter?: string): Promise<Recipe[]> {
    const conditions = [];
    
    // Text search in name and description
    if (query) {
      const searchTerm = `%${query.toLowerCase()}%`;
      conditions.push(
        sql`(
          lower(${recipes.name}) LIKE ${searchTerm} OR 
          lower(${recipes.description}) LIKE ${searchTerm} OR
          EXISTS (
            SELECT 1 FROM jsonb_array_elements(${recipes.ingredients}) AS ingredient
            WHERE lower(ingredient->>'name') LIKE ${searchTerm}
          )
        )`
      );
    }
    
    // Dietary filter using array contains
    if (dietaryFilter && dietaryFilter !== "all") {
      conditions.push(arrayContains(recipes.dietaryTags, [dietaryFilter]));
    }
    
    let dbQuery = this.db.select().from(recipes);
    
    if (conditions.length > 0) {
      dbQuery = dbQuery.where(and(...conditions));
    }
    
    return await dbQuery.orderBy(desc(recipes.createdAt));
  }

  async getMealPlans(weekStartDate: string): Promise<MealPlan[]> {
    const weekStart = new Date(weekStartDate);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekEndStr = weekEnd.toISOString().split('T')[0];
    
    return await this.db.select().from(mealPlans)
      .where(and(
        gte(mealPlans.date, weekStartDate),
        lte(mealPlans.date, weekEndStr)
      ))
      .orderBy(mealPlans.date, mealPlans.mealType);
  }

  async getMealPlan(date: string, mealType: string): Promise<MealPlan | undefined> {
    const result = await this.db.select().from(mealPlans)
      .where(and(
        eq(mealPlans.date, date),
        eq(mealPlans.mealType, mealType)
      ))
      .limit(1);
    return result[0];
  }

  async createMealPlan(insertMealPlan: InsertMealPlan): Promise<MealPlan> {
    const result = await this.db.insert(mealPlans).values(insertMealPlan).returning();
    return result[0];
  }

  async updateMealPlan(id: string, updateData: Partial<InsertMealPlan>): Promise<MealPlan> {
    const result = await this.db.update(mealPlans).set(updateData).where(eq(mealPlans.id, id)).returning();
    if (result.length === 0) {
      throw new Error("Meal plan not found");
    }
    return result[0];
  }

  async deleteMealPlan(id: string): Promise<void> {
    await this.db.delete(mealPlans).where(eq(mealPlans.id, id));
  }

  async getShoppingList(weekStartDate: string): Promise<ShoppingListItem[]> {
    return await this.db.select().from(shoppingListItems)
      .where(eq(shoppingListItems.weekStartDate, weekStartDate));
  }

  async createShoppingListItem(insertItem: InsertShoppingListItem): Promise<ShoppingListItem> {
    const result = await this.db.insert(shoppingListItems).values(insertItem).returning();
    return result[0];
  }

  async updateShoppingListItem(id: string, updateData: Partial<InsertShoppingListItem>): Promise<ShoppingListItem> {
    const result = await this.db.update(shoppingListItems).set(updateData).where(eq(shoppingListItems.id, id)).returning();
    if (result.length === 0) {
      throw new Error("Shopping list item not found");
    }
    return result[0];
  }

  async deleteShoppingListItem(id: string): Promise<void> {
    await this.db.delete(shoppingListItems).where(eq(shoppingListItems.id, id));
  }

  async generateShoppingList(weekStartDate: string): Promise<ShoppingListItem[]> {
    // Clear existing shopping list for this week
    await this.db.delete(shoppingListItems).where(eq(shoppingListItems.weekStartDate, weekStartDate));

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

  // Recipe collection operations
  async getRecipeCollections(): Promise<RecipeCollection[]> {
    return await this.db.select().from(recipeCollections).orderBy(desc(recipeCollections.createdAt));
  }

  async getRecipeCollection(id: string): Promise<RecipeCollection | undefined> {
    const result = await this.db.select().from(recipeCollections).where(eq(recipeCollections.id, id)).limit(1);
    return result[0];
  }

  async createRecipeCollection(insertCollection: InsertRecipeCollection): Promise<RecipeCollection> {
    const result = await this.db.insert(recipeCollections).values(insertCollection).returning();
    return result[0];
  }

  async updateRecipeCollection(id: string, updateData: Partial<InsertRecipeCollection>): Promise<RecipeCollection> {
    const result = await this.db.update(recipeCollections).set(updateData).where(eq(recipeCollections.id, id)).returning();
    if (result.length === 0) {
      throw new Error("Recipe collection not found");
    }
    return result[0];
  }

  async deleteRecipeCollection(id: string): Promise<void> {
    // Collection items will be deleted automatically due to cascade
    await this.db.delete(recipeCollections).where(eq(recipeCollections.id, id));
  }

  // Collection item operations
  async getRecipesByCollection(collectionId: string): Promise<Recipe[]> {
    const result = await db
      .select({ recipe: recipes })
      .from(recipeCollectionItems)
      .innerJoin(recipes, eq(recipeCollectionItems.recipeId, recipes.id))
      .where(eq(recipeCollectionItems.collectionId, collectionId))
      .orderBy(desc(recipeCollectionItems.addedAt));

    return result.map(row => row.recipe);
  }

  async addRecipeToCollection(collectionId: string, recipeId: string): Promise<RecipeCollectionItem> {
    // Check if already exists
    const existing = await db
      .select()
      .from(recipeCollectionItems)
      .where(and(
        eq(recipeCollectionItems.collectionId, collectionId),
        eq(recipeCollectionItems.recipeId, recipeId)
      ))
      .limit(1);

    if (existing.length > 0) {
      return existing[0];
    }

    const result = await this.db.insert(recipeCollectionItems).values({
      collectionId,
      recipeId
    }).returning();
    return result[0];
  }

  async removeRecipeFromCollection(collectionId: string, recipeId: string): Promise<void> {
    await this.db.delete(recipeCollectionItems).where(and(
      eq(recipeCollectionItems.collectionId, collectionId),
      eq(recipeCollectionItems.recipeId, recipeId)
    ));
  }

  // Favorites operations
  async toggleRecipeFavorite(id: string): Promise<Recipe> {
    const recipe = await this.getRecipe(id);
    if (!recipe) {
      throw new Error("Recipe not found");
    }

    const newFavoriteStatus = recipe.isFavorite ? 0 : 1;
    const result = await this.db.update(recipes)
      .set({ isFavorite: newFavoriteStatus })
      .where(eq(recipes.id, id))
      .returning();
    
    return result[0];
  }

  async getFavoriteRecipes(): Promise<Recipe[]> {
    return await this.db.select().from(recipes)
      .where(eq(recipes.isFavorite, 1))
      .orderBy(desc(recipes.createdAt));
  }

  // Rating operations
  async setRecipeRating(id: string, rating: number): Promise<Recipe> {
    if (rating < 1 || rating > 5) {
      throw new Error("Rating must be between 1 and 5");
    }

    const result = await this.db.update(recipes)
      .set({ rating })
      .where(eq(recipes.id, id))
      .returning();

    if (result.length === 0) {
      throw new Error("Recipe not found");
    }
    
    return result[0];
  }
}

// Import development storage for demo
import { DevMemStorage } from './dev-storage';

// For development demonstration, use in-memory storage
export const storage = new DevMemStorage();

console.log('🚀 Using in-memory storage for development demo');
