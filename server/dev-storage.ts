import { randomUUID } from "crypto";
import { type Recipe, type InsertRecipe, type MealPlan, type InsertMealPlan, type ShoppingListItem, type InsertShoppingListItem, type Ingredient, type RecipeCollection, type InsertRecipeCollection, type RecipeCollectionItem, type InsertRecipeCollectionItem } from "@shared/schema";

export interface IStorage {
  getRecipes(): Promise<Recipe[]>;
  getRecipe(id: string): Promise<Recipe | undefined>;
  createRecipe(recipe: InsertRecipe): Promise<Recipe>;
  updateRecipe(id: string, recipe: Partial<InsertRecipe>): Promise<Recipe>;
  deleteRecipe(id: string): Promise<void>;
  searchRecipes(query: string, dietaryFilter?: string): Promise<Recipe[]>;
  
  getMealPlans(weekStartDate: string): Promise<MealPlan[]>;
  getMealPlan(date: string, mealType: string): Promise<MealPlan | undefined>;
  createMealPlan(mealPlan: InsertMealPlan): Promise<MealPlan>;
  updateMealPlan(id: string, mealPlan: Partial<InsertMealPlan>): Promise<MealPlan>;
  deleteMealPlan(id: string): Promise<void>;
  
  getShoppingList(weekStartDate: string): Promise<ShoppingListItem[]>;
  createShoppingListItem(item: InsertShoppingListItem): Promise<ShoppingListItem>;
  updateShoppingListItem(id: string, item: Partial<InsertShoppingListItem>): Promise<ShoppingListItem>;
  deleteShoppingListItem(id: string): Promise<void>;
  generateShoppingList(weekStartDate: string): Promise<ShoppingListItem[]>;
  
  getRecipeCollections(): Promise<RecipeCollection[]>;
  getRecipeCollection(id: string): Promise<RecipeCollection | undefined>;
  createRecipeCollection(collection: InsertRecipeCollection): Promise<RecipeCollection>;
  updateRecipeCollection(id: string, collection: Partial<InsertRecipeCollection>): Promise<RecipeCollection>;
  deleteRecipeCollection(id: string): Promise<void>;
  
  getRecipesByCollection(collectionId: string): Promise<Recipe[]>;
  addRecipeToCollection(collectionId: string, recipeId: string): Promise<RecipeCollectionItem>;
  removeRecipeFromCollection(collectionId: string, recipeId: string): Promise<void>;
  
  toggleRecipeFavorite(id: string): Promise<Recipe>;
  getFavoriteRecipes(): Promise<Recipe[]>;
  
  setRecipeRating(id: string, rating: number): Promise<Recipe>;
}

export class DevMemStorage implements IStorage {
  private recipes: Map<string, Recipe> = new Map();
  private mealPlans: Map<string, MealPlan> = new Map();
  private shoppingListItems: Map<string, ShoppingListItem> = new Map();

  constructor() {
    this.initializeSampleData();
  }

  private initializeSampleData() {
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
        imageUrl: "https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=200&fit=crop",
        isFavorite: 1,
        rating: 5
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
        imageUrl: "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400&h=200&fit=crop",
        isFavorite: 0,
        rating: 4
      }
    ];

    sampleRecipes.forEach(recipe => {
      this.createRecipe(recipe);
    });
  }

  async getRecipes(): Promise<Recipe[]> {
    return Array.from(this.recipes.values());
  }

  async getRecipe(id: string): Promise<Recipe | undefined> {
    return this.recipes.get(id);
  }

  async createRecipe(insertRecipe: InsertRecipe): Promise<Recipe> {
    const id = randomUUID();
    const recipe: Recipe = { 
      id, 
      name: insertRecipe.name,
      description: insertRecipe.description || null,
      prepTime: insertRecipe.prepTime || null,
      cookTime: insertRecipe.cookTime || null,
      difficulty: insertRecipe.difficulty,
      servings: insertRecipe.servings || 4,
      ingredients: insertRecipe.ingredients,
      instructions: insertRecipe.instructions,
      dietaryTags: insertRecipe.dietaryTags || [],
      imageUrl: insertRecipe.imageUrl || null,
      isFavorite: insertRecipe.isFavorite || 0,
      rating: insertRecipe.rating || 0,
      createdAt: new Date()
    };
    this.recipes.set(id, recipe);
    return recipe;
  }

  async updateRecipe(id: string, updateData: Partial<InsertRecipe>): Promise<Recipe> {
    const existing = this.recipes.get(id);
    if (!existing) {
      throw new Error("Recipe not found");
    }
    const updated = { ...existing, ...updateData };
    this.recipes.set(id, updated);
    return updated;
  }

  async deleteRecipe(id: string): Promise<void> {
    this.recipes.delete(id);
    for (const [planId, plan] of Array.from(this.mealPlans.entries())) {
      if (plan.recipeId === id) {
        this.mealPlans.delete(planId);
      }
    }
  }

  async searchRecipes(query: string, dietaryFilter?: string): Promise<Recipe[]> {
    const recipes = Array.from(this.recipes.values());
    return recipes.filter(recipe => {
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

  async toggleRecipeFavorite(id: string): Promise<Recipe> {
    const recipe = this.recipes.get(id);
    if (!recipe) throw new Error("Recipe not found");
    
    recipe.isFavorite = recipe.isFavorite ? 0 : 1;
    this.recipes.set(id, recipe);
    return recipe;
  }

  async getFavoriteRecipes(): Promise<Recipe[]> {
    return Array.from(this.recipes.values()).filter(r => r.isFavorite === 1);
  }

  async setRecipeRating(id: string, rating: number): Promise<Recipe> {
    const recipe = this.recipes.get(id);
    if (!recipe) throw new Error("Recipe not found");
    
    recipe.rating = rating;
    this.recipes.set(id, recipe);
    return recipe;
  }

  // Simplified implementations for demo
  async getMealPlans(): Promise<MealPlan[]> { return []; }
  async getMealPlan(): Promise<MealPlan | undefined> { return undefined; }
  async createMealPlan(insertMealPlan: InsertMealPlan): Promise<MealPlan> { 
    const id = randomUUID();
    const mealPlan: MealPlan = { id, ...insertMealPlan, recipeId: insertMealPlan.recipeId || null };
    this.mealPlans.set(id, mealPlan);
    return mealPlan;
  }
  async updateMealPlan(): Promise<MealPlan> { throw new Error("Not implemented"); }
  async deleteMealPlan(id: string): Promise<void> { this.mealPlans.delete(id); }
  
  async getShoppingList(): Promise<ShoppingListItem[]> { return []; }
  async createShoppingListItem(): Promise<ShoppingListItem> { throw new Error("Not implemented"); }
  async updateShoppingListItem(): Promise<ShoppingListItem> { throw new Error("Not implemented"); }
  async deleteShoppingListItem(): Promise<void> {}
  async generateShoppingList(): Promise<ShoppingListItem[]> { return []; }
  
  async getRecipeCollections(): Promise<RecipeCollection[]> { return []; }
  async getRecipeCollection(): Promise<RecipeCollection | undefined> { return undefined; }
  async createRecipeCollection(): Promise<RecipeCollection> { throw new Error("Not implemented"); }
  async updateRecipeCollection(): Promise<RecipeCollection> { throw new Error("Not implemented"); }
  async deleteRecipeCollection(): Promise<void> {}
  async getRecipesByCollection(): Promise<Recipe[]> { return []; }
  async addRecipeToCollection(): Promise<RecipeCollectionItem> { throw new Error("Not implemented"); }
  async removeRecipeFromCollection(): Promise<void> {}
}