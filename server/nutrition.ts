import { type Ingredient } from "@shared/schema";

export interface NutritionInfo {
  calories: number;
  protein: number; // grams
  carbs: number; // grams
  fat: number; // grams
  fiber: number; // grams
  sodium: number; // mg
}

// Basic nutrition database - in production, this would integrate with USDA or Nutritionix API
const nutritionDatabase: Record<string, NutritionInfo> = {
  // Proteins (per 100g)
  "chicken breast": { calories: 165, protein: 31, carbs: 0, fat: 3.6, fiber: 0, sodium: 74 },
  "salmon": { calories: 208, protein: 22, carbs: 0, fat: 13, fiber: 0, sodium: 52 },
  "eggs": { calories: 155, protein: 13, carbs: 1, fat: 11, fiber: 0, sodium: 124 },
  
  // Grains (per 100g cooked)
  "quinoa": { calories: 120, protein: 4.4, carbs: 22, fat: 1.9, fiber: 2.8, sodium: 7 },
  "rice": { calories: 130, protein: 2.7, carbs: 28, fat: 0.3, fiber: 0.4, sodium: 1 },
  "pasta": { calories: 131, protein: 5, carbs: 25, fat: 1.1, fiber: 1.8, sodium: 1 },
  
  // Vegetables (per 100g)
  "broccoli": { calories: 34, protein: 2.8, carbs: 7, fat: 0.4, fiber: 2.6, sodium: 33 },
  "bell pepper": { calories: 31, protein: 1, carbs: 7, fat: 0.3, fiber: 2.5, sodium: 4 },
  "bell peppers": { calories: 31, protein: 1, carbs: 7, fat: 0.3, fiber: 2.5, sodium: 4 },
  "cherry tomatoes": { calories: 18, protein: 0.9, carbs: 3.9, fat: 0.2, fiber: 1.2, sodium: 5 },
  "cucumber": { calories: 16, protein: 0.7, carbs: 4, fat: 0.1, fiber: 0.5, sodium: 2 },
  
  // Dairy (per 100g)
  "feta cheese": { calories: 264, protein: 14, carbs: 4, fat: 21, fiber: 0, sodium: 1116 },
  "milk": { calories: 61, protein: 3.2, carbs: 4.8, fat: 3.2, fiber: 0, sodium: 44 },
  
  // Oils & Condiments (per 100g)
  "olive oil": { calories: 884, protein: 0, carbs: 0, fat: 100, fiber: 0, sodium: 2 },
  "honey": { calories: 304, protein: 0.3, carbs: 82, fat: 0, fiber: 0.2, sodium: 4 },
  "soy sauce": { calories: 60, protein: 8.1, carbs: 5.6, fat: 0.6, fiber: 0.8, sodium: 5493 },
  
  // Herbs & Spices (per 100g - but used in small quantities)
  "garlic": { calories: 149, protein: 6.4, carbs: 33, fat: 0.5, fiber: 2.1, sodium: 17 },
  "lemon juice": { calories: 22, protein: 0.4, carbs: 6.9, fat: 0.2, fiber: 0.3, sodium: 1 },
};

// Common unit conversions to grams
const unitConversions: Record<string, number> = {
  // Volume to weight conversions (approximate)
  "cup": 240, // 240g for liquids, varies for solids
  "tbsp": 15,
  "tsp": 5,
  "ml": 1,
  "l": 1000,
  
  // Weight units
  "g": 1,
  "kg": 1000,
  "oz": 28.35,
  "lb": 453.6,
  
  // Pieces (rough estimates)
  "large": 200, // large vegetable/fruit
  "medium": 150,
  "small": 100,
  "clove": 3, // garlic clove
  "cloves": 3,
};

// Ingredient-specific cup weights (grams per cup)
const ingredientCupWeights: Record<string, number> = {
  "quinoa": 185, // cooked
  "rice": 195, // cooked
  "pasta": 140, // cooked
  "flour": 120,
  "sugar": 200,
  "cherry tomatoes": 150,
  "broccoli": 90, // florets
};

function parseQuantity(quantityStr: string): number {
  // Handle fractions like "1/2", "1/4", etc.
  if (quantityStr.includes('/')) {
    const [numerator, denominator] = quantityStr.split('/').map(Number);
    return numerator / denominator;
  }
  return parseFloat(quantityStr) || 0;
}

function convertToGrams(quantity: number, unit: string, ingredientName: string): number {
  const normalizedUnit = unit.toLowerCase().trim();
  const normalizedIngredient = ingredientName.toLowerCase().trim();
  
  // Direct weight units
  if (unitConversions[normalizedUnit]) {
    return quantity * unitConversions[normalizedUnit];
  }
  
  // Special case for cups - use ingredient-specific weights
  if (normalizedUnit === "cup" || normalizedUnit === "cups") {
    const cupWeight = ingredientCupWeights[normalizedIngredient] || 120; // default 120g per cup
    return quantity * cupWeight;
  }
  
  // If no unit specified or unknown unit, assume grams
  return quantity * 100; // default to 100g portion
}

export function calculateRecipeNutrition(ingredients: Ingredient[]): NutritionInfo {
  let totalNutrition: NutritionInfo = {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: 0,
    sodium: 0,
  };

  for (const ingredient of ingredients) {
    const normalizedName = ingredient.name.toLowerCase().trim();
    const quantity = parseQuantity(ingredient.quantity);
    const gramsAmount = convertToGrams(quantity, ingredient.unit, normalizedName);
    
    // Find nutrition info (try exact match first, then partial matches)
    let nutritionInfo = nutritionDatabase[normalizedName];
    
    if (!nutritionInfo) {
      // Try partial matches
      const matchingKey = Object.keys(nutritionDatabase).find(key => 
        normalizedName.includes(key) || key.includes(normalizedName)
      );
      nutritionInfo = matchingKey ? nutritionDatabase[matchingKey] : null;
    }
    
    if (nutritionInfo) {
      // Scale nutrition info based on actual amount (nutrition data is per 100g)
      const scale = gramsAmount / 100;
      
      totalNutrition.calories += nutritionInfo.calories * scale;
      totalNutrition.protein += nutritionInfo.protein * scale;
      totalNutrition.carbs += nutritionInfo.carbs * scale;
      totalNutrition.fat += nutritionInfo.fat * scale;
      totalNutrition.fiber += nutritionInfo.fiber * scale;
      totalNutrition.sodium += nutritionInfo.sodium * scale;
    }
  }
  
  // Round to reasonable precision
  return {
    calories: Math.round(totalNutrition.calories),
    protein: Math.round(totalNutrition.protein * 10) / 10,
    carbs: Math.round(totalNutrition.carbs * 10) / 10,
    fat: Math.round(totalNutrition.fat * 10) / 10,
    fiber: Math.round(totalNutrition.fiber * 10) / 10,
    sodium: Math.round(totalNutrition.sodium),
  };
}

export function calculateMealPlanNutrition(recipes: Array<{ recipe: any; servings: number }>): NutritionInfo {
  let totalNutrition: NutritionInfo = {
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
    fiber: 0,
    sodium: 0,
  };

  for (const { recipe, servings } of recipes) {
    if (recipe && recipe.ingredients) {
      const recipeNutrition = calculateRecipeNutrition(recipe.ingredients);
      const scale = servings / recipe.servings; // scale based on serving size difference
      
      totalNutrition.calories += recipeNutrition.calories * scale;
      totalNutrition.protein += recipeNutrition.protein * scale;
      totalNutrition.carbs += recipeNutrition.carbs * scale;
      totalNutrition.fat += recipeNutrition.fat * scale;
      totalNutrition.fiber += recipeNutrition.fiber * scale;
      totalNutrition.sodium += recipeNutrition.sodium * scale;
    }
  }

  return {
    calories: Math.round(totalNutrition.calories),
    protein: Math.round(totalNutrition.protein * 10) / 10,
    carbs: Math.round(totalNutrition.carbs * 10) / 10,
    fat: Math.round(totalNutrition.fat * 10) / 10,
    fiber: Math.round(totalNutrition.fiber * 10) / 10,
    sodium: Math.round(totalNutrition.sodium),
  };
}