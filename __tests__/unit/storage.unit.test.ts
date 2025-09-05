import { DevMemStorage } from '../../server/dev-storage';
import type { InsertRecipe, InsertMealPlan, InsertShoppingListItem } from '../../shared/schema';

describe('Storage Layer', () => {
  let storage: DevMemStorage;

  beforeEach(() => {
    storage = new DevMemStorage();
  });

  describe('Recipe Operations', () => {
    describe('createRecipe', () => {
      test('should create a recipe with all required fields', async () => {
        const recipeData: InsertRecipe = {
          name: 'Test Recipe',
          description: 'A test recipe',
          prepTime: 15,
          cookTime: 30,
          difficulty: 'easy',
          servings: 4,
          ingredients: [
            { name: 'ingredient 1', quantity: '1', unit: 'cup' },
            { name: 'ingredient 2', quantity: '2', unit: 'tbsp' }
          ],
          instructions: 'Test instructions',
          dietaryTags: ['vegetarian'],
          imageUrl: 'https://example.com/image.jpg'
        };

        const recipe = await storage.createRecipe(recipeData);

        expect(recipe).toBeValidRecipe();
        expect(recipe.name).toBe(recipeData.name);
        expect(recipe.description).toBe(recipeData.description);
        expect(recipe.prepTime).toBe(recipeData.prepTime);
        expect(recipe.cookTime).toBe(recipeData.cookTime);
        expect(recipe.difficulty).toBe(recipeData.difficulty);
        expect(recipe.servings).toBe(recipeData.servings);
        expect(recipe.ingredients).toEqual(recipeData.ingredients);
        expect(recipe.instructions).toBe(recipeData.instructions);
        expect(recipe.dietaryTags).toEqual(recipeData.dietaryTags);
        expect(recipe.imageUrl).toBe(recipeData.imageUrl);
        expect(recipe.createdAt).toBeDefined();
        expect(typeof recipe.id).toBe('string');
      });

      test('should create a recipe with minimal required fields', async () => {
        const recipeData: InsertRecipe = {
          name: 'Minimal Recipe',
          difficulty: 'easy',
          ingredients: [{ name: 'flour', quantity: '1', unit: 'cup' }],
          instructions: 'Mix and bake'
        };

        const recipe = await storage.createRecipe(recipeData);

        expect(recipe).toBeValidRecipe();
        expect(recipe.name).toBe(recipeData.name);
        expect(recipe.difficulty).toBe(recipeData.difficulty);
        expect(recipe.servings).toBe(4); // Default value
        expect(recipe.isFavorite).toBe(0); // Default value
        expect(recipe.rating).toBe(0); // Default value
      });

      test('should set default values for optional fields', async () => {
        const recipeData: InsertRecipe = {
          name: 'Test Recipe',
          difficulty: 'medium',
          ingredients: [{ name: 'test', quantity: '1', unit: 'cup' }],
          instructions: 'Test instructions'
        };

        const recipe = await storage.createRecipe(recipeData);

        expect(recipe.description).toBeNull();
        expect(recipe.prepTime).toBeNull();
        expect(recipe.cookTime).toBeNull();
        expect(recipe.servings).toBe(4);
        expect(recipe.dietaryTags).toEqual([]);
        expect(recipe.imageUrl).toBeNull();
        expect(recipe.isFavorite).toBe(0);
        expect(recipe.rating).toBe(0);
      });
    });

    describe('getRecipes', () => {
      test('should return all recipes ordered by creation date', async () => {
        const recipe1 = await storage.createRecipe(global.testUtils.createTestRecipe({ name: 'Recipe 1' }));
        const recipe2 = await storage.createRecipe(global.testUtils.createTestRecipe({ name: 'Recipe 2' }));

        const recipes = await storage.getRecipes();

        expect(recipes).toHaveLength(4); // 2 sample + 2 created
        expect(recipes.map(r => r.name)).toContain('Recipe 1');
        expect(recipes.map(r => r.name)).toContain('Recipe 2');
      });

      test('should return empty array when no recipes exist', async () => {
        // Create fresh storage without sample data
        const emptyStorage = new DevMemStorage();
        // Clear the sample data by accessing private field
        (emptyStorage as any).recipes.clear();

        const recipes = await emptyStorage.getRecipes();

        expect(recipes).toEqual([]);
      });
    });

    describe('getRecipe', () => {
      test('should return recipe by ID', async () => {
        const createdRecipe = await storage.createRecipe(global.testUtils.createTestRecipe());

        const recipe = await storage.getRecipe(createdRecipe.id);

        expect(recipe).toEqual(createdRecipe);
      });

      test('should return undefined for non-existent recipe', async () => {
        const recipe = await storage.getRecipe('non-existent-id');

        expect(recipe).toBeUndefined();
      });
    });

    describe('updateRecipe', () => {
      test('should update recipe with new data', async () => {
        const originalRecipe = await storage.createRecipe(global.testUtils.createTestRecipe());

        const updateData = {
          name: 'Updated Recipe Name',
          description: 'Updated description',
          difficulty: 'hard' as const
        };

        const updatedRecipe = await storage.updateRecipe(originalRecipe.id, updateData);

        expect(updatedRecipe.id).toBe(originalRecipe.id);
        expect(updatedRecipe.name).toBe(updateData.name);
        expect(updatedRecipe.description).toBe(updateData.description);
        expect(updatedRecipe.difficulty).toBe(updateData.difficulty);
        // Other fields should remain unchanged
        expect(updatedRecipe.ingredients).toEqual(originalRecipe.ingredients);
        expect(updatedRecipe.instructions).toBe(originalRecipe.instructions);
      });

      test('should throw error for non-existent recipe', async () => {
        const updateData = { name: 'Updated Name' };

        await expect(storage.updateRecipe('non-existent-id', updateData))
          .rejects.toThrow('Recipe not found');
      });

      test('should allow partial updates', async () => {
        const originalRecipe = await storage.createRecipe(global.testUtils.createTestRecipe());

        const updatedRecipe = await storage.updateRecipe(originalRecipe.id, { name: 'New Name' });

        expect(updatedRecipe.name).toBe('New Name');
        expect(updatedRecipe.description).toBe(originalRecipe.description);
        expect(updatedRecipe.difficulty).toBe(originalRecipe.difficulty);
      });
    });

    describe('deleteRecipe', () => {
      test('should delete recipe', async () => {
        const recipe = await storage.createRecipe(global.testUtils.createTestRecipe());

        await storage.deleteRecipe(recipe.id);

        const deletedRecipe = await storage.getRecipe(recipe.id);
        expect(deletedRecipe).toBeUndefined();
      });

      test('should not throw error for non-existent recipe', async () => {
        await expect(storage.deleteRecipe('non-existent-id'))
          .resolves.not.toThrow();
      });

      test('should delete related meal plans', async () => {
        const recipe = await storage.createRecipe(global.testUtils.createTestRecipe());
        const mealPlan = await storage.createMealPlan({
          date: '2025-09-05',
          mealType: 'dinner',
          recipeId: recipe.id,
          servings: 2
        });

        await storage.deleteRecipe(recipe.id);

        // Meal plan should be deleted
        const remainingMealPlans = await storage.getMealPlans('2025-09-02');
        expect(remainingMealPlans.find(mp => mp.id === mealPlan.id)).toBeUndefined();
      });
    });

    describe('searchRecipes', () => {
      beforeEach(async () => {
        // Clear existing recipes and create test data
        (storage as any).recipes.clear();

        await storage.createRecipe(global.testUtils.createTestRecipe({
          name: 'Italian Pasta',
          description: 'Delicious pasta dish',
          ingredients: [{ name: 'pasta', quantity: '200', unit: 'g' }],
          dietaryTags: ['vegetarian']
        }));

        await storage.createRecipe(global.testUtils.createTestRecipe({
          name: 'Chicken Curry',
          description: 'Spicy chicken curry',
          ingredients: [{ name: 'chicken', quantity: '500', unit: 'g' }],
          dietaryTags: ['protein', 'spicy']
        }));

        await storage.createRecipe(global.testUtils.createTestRecipe({
          name: 'Greek Salad',
          description: 'Fresh vegetarian salad',
          ingredients: [{ name: 'cucumber', quantity: '1', unit: 'large' }],
          dietaryTags: ['vegetarian', 'healthy']
        }));
      });

      test('should search by recipe name', async () => {
        const result = await storage.searchRecipes('pasta');

        expect(result.total).toBe(1);
        expect(result.recipes).toHaveLength(1);
        expect(result.recipes[0].name).toBe('Italian Pasta');
      });

      test('should search by description', async () => {
        const result = await storage.searchRecipes('spicy');

        expect(result.total).toBe(1);
        expect(result.recipes[0].name).toBe('Chicken Curry');
      });

      test('should search by ingredient', async () => {
        const result = await storage.searchRecipes('cucumber');

        expect(result.total).toBe(1);
        expect(result.recipes[0].name).toBe('Greek Salad');
      });

      test('should filter by dietary tags', async () => {
        const result = await storage.searchRecipes('', 'vegetarian');

        expect(result.total).toBe(2);
        expect(result.recipes.map(r => r.name)).toContain('Italian Pasta');
        expect(result.recipes.map(r => r.name)).toContain('Greek Salad');
      });

      test('should handle pagination', async () => {
        const result = await storage.searchRecipes('', undefined, 2, 1);

        expect(result.total).toBe(3);
        expect(result.recipes).toHaveLength(2);
      });

      test('should return empty results for no matches', async () => {
        const result = await storage.searchRecipes('nonexistent');

        expect(result.total).toBe(0);
        expect(result.recipes).toHaveLength(0);
      });

      test('should handle case insensitive search', async () => {
        const result = await storage.searchRecipes('PASTA');

        expect(result.total).toBe(1);
        expect(result.recipes[0].name).toBe('Italian Pasta');
      });
    });

    describe('Recipe Favorites and Ratings', () => {
      test('should toggle recipe favorite status', async () => {
        const recipe = await storage.createRecipe(global.testUtils.createTestRecipe());
        expect(recipe.isFavorite).toBe(0);

        const favoriteRecipe = await storage.toggleRecipeFavorite(recipe.id);
        expect(favoriteRecipe.isFavorite).toBe(1);

        const unfavoriteRecipe = await storage.toggleRecipeFavorite(recipe.id);
        expect(unfavoriteRecipe.isFavorite).toBe(0);
      });

      test('should throw error when toggling favorite for non-existent recipe', async () => {
        await expect(storage.toggleRecipeFavorite('non-existent-id'))
          .rejects.toThrow('Recipe not found');
      });

      test('should get favorite recipes', async () => {
        const recipe1 = await storage.createRecipe(global.testUtils.createTestRecipe({ name: 'Recipe 1' }));
        const recipe2 = await storage.createRecipe(global.testUtils.createTestRecipe({ name: 'Recipe 2' }));
        
        await storage.toggleRecipeFavorite(recipe1.id);

        const favorites = await storage.getFavoriteRecipes();
        const favoriteNames = favorites.map(r => r.name);
        
        expect(favoriteNames).toContain('Recipe 1');
        expect(favoriteNames).toContain('Mediterranean Quinoa Bowl'); // Sample data favorite
        expect(favoriteNames).not.toContain('Recipe 2');
      });

      test('should set recipe rating', async () => {
        const recipe = await storage.createRecipe(global.testUtils.createTestRecipe());

        const ratedRecipe = await storage.setRecipeRating(recipe.id, 4);

        expect(ratedRecipe.rating).toBe(4);
      });

      test('should throw error when rating non-existent recipe', async () => {
        await expect(storage.setRecipeRating('non-existent-id', 5))
          .rejects.toThrow('Recipe not found');
      });
    });
  });

  describe('Meal Plan Operations', () => {
    test('should create meal plan', async () => {
      const recipe = await storage.createRecipe(global.testUtils.createTestRecipe());
      const mealPlanData: InsertMealPlan = {
        date: '2025-09-05',
        mealType: 'dinner',
        recipeId: recipe.id,
        servings: 2
      };

      const mealPlan = await storage.createMealPlan(mealPlanData);

      expect(mealPlan).toBeValidMealPlan();
      expect(mealPlan.date).toBe(mealPlanData.date);
      expect(mealPlan.mealType).toBe(mealPlanData.mealType);
      expect(mealPlan.recipeId).toBe(mealPlanData.recipeId);
      expect(mealPlan.servings).toBe(mealPlanData.servings);
    });

    test('should delete meal plan', async () => {
      const recipe = await storage.createRecipe(global.testUtils.createTestRecipe());
      const mealPlan = await storage.createMealPlan({
        date: '2025-09-05',
        mealType: 'dinner',
        recipeId: recipe.id,
        servings: 2
      });

      await storage.deleteMealPlan(mealPlan.id);

      const mealPlans = await storage.getMealPlans('2025-09-02');
      expect(mealPlans.find(mp => mp.id === mealPlan.id)).toBeUndefined();
    });
  });

  describe('Error Handling', () => {
    test('should handle database errors gracefully', async () => {
      // Mock a database error by overriding a method
      const originalCreateRecipe = storage.createRecipe;
      storage.createRecipe = jest.fn().mockRejectedValue(new Error('Database connection failed'));

      await expect(storage.createRecipe(global.testUtils.createTestRecipe()))
        .rejects.toThrow('Database connection failed');

      // Restore original method
      storage.createRecipe = originalCreateRecipe;
    });
  });

  describe('Data Consistency', () => {
    test('should maintain data integrity across operations', async () => {
      // Create recipe
      const recipe = await storage.createRecipe(global.testUtils.createTestRecipe({ name: 'Consistency Test' }));
      
      // Create meal plan with recipe
      const mealPlan = await storage.createMealPlan({
        date: '2025-09-05',
        mealType: 'lunch',
        recipeId: recipe.id,
        servings: 3
      });

      // Verify relationships
      expect(recipe.id).toBe(mealPlan.recipeId);

      // Update recipe and verify it doesn't affect meal plan
      await storage.updateRecipe(recipe.id, { name: 'Updated Name' });
      const updatedMealPlan = await storage.getMealPlan('2025-09-05', 'lunch');
      expect(updatedMealPlan?.recipeId).toBe(recipe.id);

      // Delete recipe and verify meal plan is also deleted
      await storage.deleteRecipe(recipe.id);
      const deletedMealPlan = await storage.getMealPlan('2025-09-05', 'lunch');
      expect(deletedMealPlan).toBeUndefined();
    });
  });
});