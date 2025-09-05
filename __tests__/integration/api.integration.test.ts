import request from 'supertest';
import { Application } from 'express';

// Mock imports to avoid database connections during tests
jest.mock('../../server/storage', () => {
  const { DevMemStorage } = jest.requireActual('../../server/dev-storage');
  return { createStorage: () => new DevMemStorage() };
});

let app: Application;

// Import app after mocks are set
beforeAll(async () => {
  // Set environment for integration tests
  process.env.NODE_ENV = 'test';
  process.env.USE_DATABASE = 'false';
  process.env.PORT = '0'; // Use random port
  
  const { createApp } = await import('../../server/app');
  app = await createApp();
});

describe('Recipe API Integration', () => {
  describe('GET /api/recipes', () => {
    test('should return recipes with pagination metadata', async () => {
      const response = await request(app)
        .get('/api/recipes')
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.pagination).toMatchObject({
        page: expect.any(Number),
        limit: expect.any(Number),
        total: expect.any(Number),
        totalPages: expect.any(Number),
        hasNextPage: expect.any(Boolean),
        hasPreviousPage: expect.any(Boolean)
      });
    });

    test('should handle pagination parameters', async () => {
      const response = await request(app)
        .get('/api/recipes?page=1&limit=5')
        .expect(200);

      expect(response.body.pagination.page).toBe(1);
      expect(response.body.pagination.limit).toBe(5);
    });

    test('should validate pagination parameters', async () => {
      const response = await request(app)
        .get('/api/recipes?page=0&limit=150')
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Page must be >= 1');
    });

    test('should handle search parameter', async () => {
      const response = await request(app)
        .get('/api/recipes?search=quinoa')
        .expect(200);

      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('pagination');
    });

    test('should handle dietary filter', async () => {
      const response = await request(app)
        .get('/api/recipes?dietary=vegetarian')
        .expect(200);

      expect(response.body).toHaveProperty('data');
    });

    test('should return cached response with appropriate headers', async () => {
      const response = await request(app)
        .get('/api/recipes')
        .expect(200);

      expect(response.headers).toHaveProperty('cache-control');
      expect(response.headers).toHaveProperty('last-modified');
      expect(response.headers).toHaveProperty('vary');
    });
  });

  describe('POST /api/recipes', () => {
    test('should create a new recipe', async () => {
      const recipeData = {
        name: 'Integration Test Recipe',
        description: 'A recipe created during integration testing',
        difficulty: 'easy',
        prepTime: 10,
        cookTime: 20,
        servings: 4,
        ingredients: [
          { name: 'test ingredient', quantity: '1', unit: 'cup' }
        ],
        instructions: 'Test instructions for integration testing',
        dietaryTags: ['test']
      };

      const response = await request(app)
        .post('/api/recipes')
        .send(recipeData)
        .expect(201);

      expect(response.body).toMatchObject({
        name: recipeData.name,
        description: recipeData.description,
        difficulty: recipeData.difficulty,
        prepTime: recipeData.prepTime,
        cookTime: recipeData.cookTime,
        servings: recipeData.servings,
        ingredients: recipeData.ingredients,
        instructions: recipeData.instructions,
        dietaryTags: recipeData.dietaryTags
      });
      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('createdAt');
    });

    test('should validate required fields', async () => {
      const invalidRecipe = {
        name: 'Incomplete Recipe'
        // Missing required fields
      };

      const response = await request(app)
        .post('/api/recipes')
        .send(invalidRecipe)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('should sanitize input data', async () => {
      const recipeWithMaliciousContent = {
        name: 'Test Recipe<script>alert("xss")</script>',
        description: 'Safe description',
        difficulty: 'easy',
        ingredients: [
          { name: 'safe ingredient', quantity: '1', unit: 'cup' }
        ],
        instructions: 'Safe instructions'
      };

      const response = await request(app)
        .post('/api/recipes')
        .send(recipeWithMaliciousContent)
        .expect(201);

      expect(response.body.name).not.toContain('<script>');
    });

    test('should set no-store cache headers for mutations', async () => {
      const recipeData = global.testUtils.createTestRecipe();

      const response = await request(app)
        .post('/api/recipes')
        .send(recipeData)
        .expect(201);

      expect(response.headers['cache-control']).toContain('no-store');
    });
  });

  describe('GET /api/recipes/:id', () => {
    let createdRecipeId: string;

    beforeAll(async () => {
      // Create a recipe for testing individual retrieval
      const recipeData = global.testUtils.createTestRecipe({ name: 'Get Test Recipe' });
      const createResponse = await request(app)
        .post('/api/recipes')
        .send(recipeData);
      createdRecipeId = createResponse.body.id;
    });

    test('should retrieve specific recipe', async () => {
      const response = await request(app)
        .get(`/api/recipes/${createdRecipeId}`)
        .expect(200);

      expect(response.body).toHaveProperty('id', createdRecipeId);
      expect(response.body).toHaveProperty('name');
      expect(response.body).toHaveProperty('ingredients');
    });

    test('should return 404 for non-existent recipe', async () => {
      const response = await request(app)
        .get('/api/recipes/non-existent-id')
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });

    test('should use long cache strategy for individual recipes', async () => {
      const response = await request(app)
        .get(`/api/recipes/${createdRecipeId}`)
        .expect(200);

      expect(response.headers['cache-control']).toContain('max-age=3600');
    });
  });

  describe('PUT /api/recipes/:id', () => {
    let recipeId: string;

    beforeEach(async () => {
      // Create a fresh recipe for each update test
      const recipeData = global.testUtils.createTestRecipe({ name: 'Update Test Recipe' });
      const createResponse = await request(app)
        .post('/api/recipes')
        .send(recipeData);
      recipeId = createResponse.body.id;
    });

    test('should update existing recipe', async () => {
      const updateData = {
        name: 'Updated Recipe Name',
        description: 'Updated description',
        difficulty: 'hard'
      };

      const response = await request(app)
        .put(`/api/recipes/${recipeId}`)
        .send(updateData)
        .expect(200);

      expect(response.body).toMatchObject(updateData);
      expect(response.body.id).toBe(recipeId);
    });

    test('should handle partial updates', async () => {
      const updateData = {
        name: 'Only Name Updated'
      };

      const response = await request(app)
        .put(`/api/recipes/${recipeId}`)
        .send(updateData)
        .expect(200);

      expect(response.body.name).toBe(updateData.name);
      expect(response.body.id).toBe(recipeId);
    });

    test('should return 404 for non-existent recipe', async () => {
      const updateData = { name: 'Updated Name' };

      const response = await request(app)
        .put('/api/recipes/non-existent-id')
        .send(updateData)
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('DELETE /api/recipes/:id', () => {
    let recipeId: string;

    beforeEach(async () => {
      // Create a recipe to delete
      const recipeData = global.testUtils.createTestRecipe({ name: 'Delete Test Recipe' });
      const createResponse = await request(app)
        .post('/api/recipes')
        .send(recipeData);
      recipeId = createResponse.body.id;
    });

    test('should delete existing recipe', async () => {
      await request(app)
        .delete(`/api/recipes/${recipeId}`)
        .expect(204);

      // Verify deletion
      await request(app)
        .get(`/api/recipes/${recipeId}`)
        .expect(404);
    });

    test('should handle deletion of non-existent recipe gracefully', async () => {
      await request(app)
        .delete('/api/recipes/non-existent-id')
        .expect(204);
    });
  });

  describe('POST /api/recipes/parse', () => {
    test('should parse recipe text', async () => {
      const parseData = {
        recipeText: 'Simple Pasta\\n\\nIngredients:\\n- 200g pasta\\n- 1 tbsp olive oil\\n\\nInstructions:\\n1. Cook pasta\\n2. Add oil'
      };

      const response = await request(app)
        .post('/api/recipes/parse')
        .send(parseData)
        .expect(200);

      expect(response.body).toHaveProperty('name');
      expect(response.body).toHaveProperty('ingredients');
      expect(response.body).toHaveProperty('instructions');
    });

    test('should handle parsing errors gracefully', async () => {
      const parseData = {
        recipeText: ''
      };

      const response = await request(app)
        .post('/api/recipes/parse')
        .send(parseData)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('should cache parsing results', async () => {
      const parseData = {
        recipeText: 'Cached Recipe Test\\n\\nIngredients:\\n- 1 ingredient\\n\\nInstructions:\\n1. Do something'
      };

      const response = await request(app)
        .post('/api/recipes/parse')
        .send(parseData)
        .expect(200);

      expect(response.headers['cache-control']).toContain('max-age=300');
    });
  });
});

describe('Meal Plan API Integration', () => {
  let recipeId: string;

  beforeAll(async () => {
    // Create a recipe for meal planning tests
    const recipeData = global.testUtils.createTestRecipe({ name: 'Meal Plan Test Recipe' });
    const createResponse = await request(app)
      .post('/api/recipes')
      .send(recipeData);
    recipeId = createResponse.body.id;
  });

  describe('GET /api/meal-plans', () => {
    test('should return meal plans for week', async () => {
      const weekStartDate = '2025-09-01';
      
      const response = await request(app)
        .get(`/api/meal-plans?weekStartDate=${weekStartDate}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    test('should require weekStartDate parameter', async () => {
      const response = await request(app)
        .get('/api/meal-plans')
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('should use private cache for meal plans', async () => {
      const response = await request(app)
        .get('/api/meal-plans?weekStartDate=2025-09-01')
        .expect(200);

      expect(response.headers['cache-control']).toContain('private');
    });
  });

  describe('POST /api/meal-plans', () => {
    test('should create meal plan', async () => {
      const mealPlanData = {
        date: '2025-09-05',
        mealType: 'dinner',
        recipeId: recipeId,
        servings: 2
      };

      const response = await request(app)
        .post('/api/meal-plans')
        .send(mealPlanData)
        .expect(201);

      expect(response.body).toMatchObject(mealPlanData);
      expect(response.body).toHaveProperty('id');
    });

    test('should validate meal plan data', async () => {
      const invalidMealPlan = {
        date: '2025-09-05',
        // Missing required fields
      };

      const response = await request(app)
        .post('/api/meal-plans')
        .send(invalidMealPlan)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('should prevent duplicate meal plans', async () => {
      const mealPlanData = {
        date: '2025-09-05',
        mealType: 'lunch',
        recipeId: recipeId,
        servings: 1
      };

      // Create first meal plan
      await request(app)
        .post('/api/meal-plans')
        .send(mealPlanData)
        .expect(201);

      // Try to create duplicate
      const response = await request(app)
        .post('/api/meal-plans')
        .send(mealPlanData)
        .expect(409);

      expect(response.body).toHaveProperty('error');
    });
  });

  describe('DELETE /api/meal-plans/:id', () => {
    let mealPlanId: string;

    beforeEach(async () => {
      // Create a meal plan to delete
      const mealPlanData = global.testUtils.createTestMealPlan({
        recipeId: recipeId,
        date: '2025-09-06',
        mealType: 'breakfast'
      });
      
      const createResponse = await request(app)
        .post('/api/meal-plans')
        .send(mealPlanData);
      mealPlanId = createResponse.body.id;
    });

    test('should delete meal plan', async () => {
      await request(app)
        .delete(`/api/meal-plans/${mealPlanId}`)
        .expect(204);
    });

    test('should handle non-existent meal plan deletion', async () => {
      await request(app)
        .delete('/api/meal-plans/non-existent-id')
        .expect(204);
    });
  });
});

describe('Shopping List API Integration', () => {
  describe('GET /api/shopping-list', () => {
    test('should generate shopping list', async () => {
      const weekStartDate = '2025-09-01';
      
      const response = await request(app)
        .get(`/api/shopping-list?weekStartDate=${weekStartDate}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });

    test('should require weekStartDate parameter', async () => {
      const response = await request(app)
        .get('/api/shopping-list')
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    test('should use private cache for shopping lists', async () => {
      const response = await request(app)
        .get('/api/shopping-list?weekStartDate=2025-09-01')
        .expect(200);

      expect(response.headers['cache-control']).toContain('private');
    });
  });
});

describe('Recipe Nutrition API Integration', () => {
  let recipeId: string;

  beforeAll(async () => {
    // Create a recipe with known ingredients for nutrition testing
    const recipeData = global.testUtils.createTestRecipe({
      name: 'Nutrition Test Recipe',
      ingredients: [
        { name: 'chicken breast', quantity: '100', unit: 'g' },
        { name: 'quinoa', quantity: '1', unit: 'cup' }
      ]
    });
    
    const createResponse = await request(app)
      .post('/api/recipes')
      .send(recipeData);
    recipeId = createResponse.body.id;
  });

  describe('GET /api/recipes/:id/nutrition', () => {
    test('should return nutrition information', async () => {
      const response = await request(app)
        .get(`/api/recipes/${recipeId}/nutrition`)
        .expect(200);

      expect(response.body).toMatchObject({
        calories: expect.any(Number),
        protein: expect.any(Number),
        carbs: expect.any(Number),
        fat: expect.any(Number),
        fiber: expect.any(Number),
        sodium: expect.any(Number)
      });
    });

    test('should return 404 for non-existent recipe', async () => {
      const response = await request(app)
        .get('/api/recipes/non-existent-id/nutrition')
        .expect(404);

      expect(response.body).toHaveProperty('error');
    });

    test('should use long cache strategy for nutrition data', async () => {
      const response = await request(app)
        .get(`/api/recipes/${recipeId}/nutrition`)
        .expect(200);

      expect(response.headers['cache-control']).toContain('max-age=3600');
    });
  });
});

describe('Error Handling Integration', () => {
  test('should handle JSON parsing errors', async () => {
    const response = await request(app)
      .post('/api/recipes')
      .set('Content-Type', 'application/json')
      .send('invalid json')
      .expect(400);

    expect(response.body).toHaveProperty('error');
    expect(response.body.error).toContain('Invalid JSON');
  });

  test('should handle unsupported routes', async () => {
    const response = await request(app)
      .get('/api/non-existent-endpoint')
      .expect(404);

    expect(response.body).toHaveProperty('error');
  });

  test('should handle method not allowed', async () => {
    const response = await request(app)
      .patch('/api/recipes')
      .expect(405);

    expect(response.body).toHaveProperty('error');
  });

  test('should return JSON error responses', async () => {
    const response = await request(app)
      .get('/api/non-existent')
      .expect(404);

    expect(response.headers['content-type']).toContain('application/json');
  });
});

describe('Compression Integration', () => {
  test('should compress large responses', async () => {
    const response = await request(app)
      .get('/api/recipes')
      .set('Accept-Encoding', 'gzip')
      .expect(200);

    // Check if response is compressed when gzip is supported
    expect(response.headers).toHaveProperty('vary');
  });
});

describe('Security Integration', () => {
  test('should sanitize malicious input across endpoints', async () => {
    const maliciousData = {
      name: 'Recipe<script>alert("xss")</script>',
      description: 'onclick="malicious()" description',
      difficulty: 'easy',
      ingredients: [{ name: 'ingredient', quantity: '1', unit: 'cup' }],
      instructions: 'instructions'
    };

    const response = await request(app)
      .post('/api/recipes')
      .send(maliciousData)
      .expect(201);

    expect(response.body.name).not.toContain('<script>');
    expect(response.body.description).not.toContain('onclick=');
  });
});