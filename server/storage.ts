import { type Recipe, type InsertRecipe, type MealPlan, type InsertMealPlan, type ShoppingListItem, type InsertShoppingListItem, type Ingredient } from "@shared/schema";
import { randomUUID } from "crypto";

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

export class MemStorage implements IStorage {
  private recipes: Map<string, Recipe> = new Map();
  private mealPlans: Map<string, MealPlan> = new Map();
  private shoppingListItems: Map<string, ShoppingListItem> = new Map();

  constructor() {
    // Initialize with some sample recipes
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
    // Also delete related meal plans
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

  async getMealPlans(weekStartDate: string): Promise<MealPlan[]> {
    return Array.from(this.mealPlans.values()).filter(plan => {
      const planDate = new Date(plan.date);
      const weekStart = new Date(weekStartDate);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      return planDate >= weekStart && planDate <= weekEnd;
    });
  }

  async getMealPlan(date: string, mealType: string): Promise<MealPlan | undefined> {
    return Array.from(this.mealPlans.values()).find(
      plan => plan.date === date && plan.mealType === mealType
    );
  }

  async createMealPlan(insertMealPlan: InsertMealPlan): Promise<MealPlan> {
    const id = randomUUID();
    const mealPlan: MealPlan = { 
      id,
      date: insertMealPlan.date,
      mealType: insertMealPlan.mealType,
      recipeId: insertMealPlan.recipeId || null,
      servings: insertMealPlan.servings || 4
    };
    this.mealPlans.set(id, mealPlan);
    return mealPlan;
  }

  async updateMealPlan(id: string, updateData: Partial<InsertMealPlan>): Promise<MealPlan> {
    const existing = this.mealPlans.get(id);
    if (!existing) {
      throw new Error("Meal plan not found");
    }
    const updated = { ...existing, ...updateData };
    this.mealPlans.set(id, updated);
    return updated;
  }

  async deleteMealPlan(id: string): Promise<void> {
    this.mealPlans.delete(id);
  }

  async getShoppingList(weekStartDate: string): Promise<ShoppingListItem[]> {
    return Array.from(this.shoppingListItems.values()).filter(
      item => item.weekStartDate === weekStartDate
    );
  }

  async createShoppingListItem(insertItem: InsertShoppingListItem): Promise<ShoppingListItem> {
    const id = randomUUID();
    const item: ShoppingListItem = {
      id,
      weekStartDate: insertItem.weekStartDate,
      ingredient: insertItem.ingredient,
      quantity: insertItem.quantity,
      unit: insertItem.unit || null,
      checked: insertItem.checked || 0,
      estimatedCost: insertItem.estimatedCost || null
    };
    this.shoppingListItems.set(id, item);
    return item;
  }

  async updateShoppingListItem(id: string, updateData: Partial<InsertShoppingListItem>): Promise<ShoppingListItem> {
    const existing = this.shoppingListItems.get(id);
    if (!existing) {
      throw new Error("Shopping list item not found");
    }
    const updated = { ...existing, ...updateData };
    this.shoppingListItems.set(id, updated);
    return updated;
  }

  async deleteShoppingListItem(id: string): Promise<void> {
    this.shoppingListItems.delete(id);
  }

  async generateShoppingList(weekStartDate: string): Promise<ShoppingListItem[]> {
    // Clear existing shopping list for this week
    for (const [id, item] of Array.from(this.shoppingListItems.entries())) {
      if (item.weekStartDate === weekStartDate) {
        this.shoppingListItems.delete(id);
      }
    }

    // Get all meal plans for the week
    const mealPlans = await this.getMealPlans(weekStartDate);
    const ingredientMap = new Map<string, { quantity: number, unit: string, estimatedCost: string }>();

    // Aggregate ingredients from all planned meals
    for (const mealPlan of mealPlans) {
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

export const storage = new MemStorage();
