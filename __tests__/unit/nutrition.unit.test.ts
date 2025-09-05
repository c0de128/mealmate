import { calculateRecipeNutrition, calculateMealPlanNutrition } from '../../server/nutrition';
import type { Ingredient } from '../../shared/schema';

describe('Nutrition Calculator', () => {
  describe('calculateRecipeNutrition', () => {
    test('should calculate nutrition for known ingredients', () => {
      const ingredients: Ingredient[] = [
        { name: 'chicken breast', quantity: '100', unit: 'g' },
        { name: 'quinoa', quantity: '1', unit: 'cup' },
        { name: 'olive oil', quantity: '1', unit: 'tbsp' }
      ];

      const nutrition = calculateRecipeNutrition(ingredients);

      expect(nutrition.calories).toBeGreaterThan(0);
      expect(nutrition.protein).toBeGreaterThan(0);
      expect(nutrition.carbs).toBeGreaterThan(0);
      expect(nutrition.fat).toBeGreaterThan(0);
    });

    test('should handle unknown ingredients gracefully', () => {
      const ingredients: Ingredient[] = [
        { name: 'unknown ingredient', quantity: '1', unit: 'cup' }
      ];

      const nutrition = calculateRecipeNutrition(ingredients);

      // Should return zero values for unknown ingredients
      expect(nutrition.calories).toBe(0);
      expect(nutrition.protein).toBe(0);
      expect(nutrition.carbs).toBe(0);
      expect(nutrition.fat).toBe(0);
    });

    test('should handle fractional quantities', () => {
      const ingredients: Ingredient[] = [
        { name: 'chicken breast', quantity: '1/2', unit: 'cup' }
      ];

      const nutrition = calculateRecipeNutrition(ingredients);

      expect(nutrition.calories).toBeGreaterThan(0);
      expect(typeof nutrition.calories).toBe('number');
    });

    test('should handle empty ingredients array', () => {
      const ingredients: Ingredient[] = [];

      const nutrition = calculateRecipeNutrition(ingredients);

      expect(nutrition.calories).toBe(0);
      expect(nutrition.protein).toBe(0);
      expect(nutrition.carbs).toBe(0);
      expect(nutrition.fat).toBe(0);
      expect(nutrition.fiber).toBe(0);
      expect(nutrition.sodium).toBe(0);
    });

    test('should handle different units correctly', () => {
      const ingredients: Ingredient[] = [
        { name: 'chicken breast', quantity: '1', unit: 'lb' }, // Should be heavier than 100g
        { name: 'chicken breast', quantity: '100', unit: 'g' }
      ];

      const nutrition1 = calculateRecipeNutrition([ingredients[0]]);
      const nutrition2 = calculateRecipeNutrition([ingredients[1]]);

      // 1 lb should have more calories than 100g
      expect(nutrition1.calories).toBeGreaterThan(nutrition2.calories);
    });

    test('should return properly rounded values', () => {
      const ingredients: Ingredient[] = [
        { name: 'chicken breast', quantity: '50', unit: 'g' }
      ];

      const nutrition = calculateRecipeNutrition(ingredients);

      // Check that values are properly rounded
      expect(Number.isInteger(nutrition.calories)).toBe(true);
      expect(Number.isInteger(nutrition.sodium)).toBe(true);
      
      // Protein, carbs, fat, fiber should be rounded to 1 decimal place
      expect(nutrition.protein * 10 % 1).toBe(0);
      expect(nutrition.carbs * 10 % 1).toBe(0);
      expect(nutrition.fat * 10 % 1).toBe(0);
      expect(nutrition.fiber * 10 % 1).toBe(0);
    });
  });

  describe('calculateMealPlanNutrition', () => {
    test('should calculate total nutrition for multiple recipes', () => {
      const mockRecipe = {
        id: 'test-recipe',
        name: 'Test Recipe',
        servings: 4,
        ingredients: [
          { name: 'chicken breast', quantity: '200', unit: 'g' }
        ]
      };

      const recipes = [
        { recipe: mockRecipe, servings: 2 },
        { recipe: mockRecipe, servings: 4 }
      ];

      const nutrition = calculateMealPlanNutrition(recipes);

      expect(nutrition.calories).toBeGreaterThan(0);
      expect(nutrition.protein).toBeGreaterThan(0);
    });

    test('should handle serving size scaling', () => {
      const mockRecipe = {
        id: 'test-recipe',
        name: 'Test Recipe',
        servings: 4,
        ingredients: [
          { name: 'chicken breast', quantity: '100', unit: 'g' }
        ]
      };

      const singleServing = calculateMealPlanNutrition([
        { recipe: mockRecipe, servings: 1 }
      ]);

      const doubleServing = calculateMealPlanNutrition([
        { recipe: mockRecipe, servings: 2 }
      ]);

      // Double servings should have roughly double the nutrition
      expect(doubleServing.calories).toBeCloseTo(singleServing.calories * 2, -1);
      expect(doubleServing.protein).toBeCloseTo(singleServing.protein * 2, 0);
    });

    test('should handle empty recipes array', () => {
      const nutrition = calculateMealPlanNutrition([]);

      expect(nutrition.calories).toBe(0);
      expect(nutrition.protein).toBe(0);
      expect(nutrition.carbs).toBe(0);
      expect(nutrition.fat).toBe(0);
      expect(nutrition.fiber).toBe(0);
      expect(nutrition.sodium).toBe(0);
    });

    test('should handle recipes without ingredients', () => {
      const mockRecipe = {
        id: 'test-recipe',
        name: 'Test Recipe',
        servings: 4,
        ingredients: []
      };

      const nutrition = calculateMealPlanNutrition([
        { recipe: mockRecipe, servings: 2 }
      ]);

      expect(nutrition.calories).toBe(0);
    });

    test('should handle null/undefined recipes gracefully', () => {
      const recipes = [
        { recipe: null, servings: 2 },
        { recipe: undefined, servings: 1 }
      ];

      const nutrition = calculateMealPlanNutrition(recipes as any);

      expect(nutrition.calories).toBe(0);
      expect(nutrition.protein).toBe(0);
    });
  });
});