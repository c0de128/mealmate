// Jest setup file - runs before each test suite

// Increase timeout for integration tests
jest.setTimeout(30000);

// Mock console methods to reduce noise in tests (but allow explicit logging)
global.console = {
  ...console,
  // Uncomment lines below to suppress console output during tests
  // log: jest.fn(),
  // debug: jest.fn(),
  // info: jest.fn(),
  // warn: jest.fn(),
  // error: jest.fn(),
};

// Mock environment variables for consistent testing
process.env.NODE_ENV = 'test';
process.env.PORT = '0'; // Use random port for tests
process.env.USE_DATABASE = 'false'; // Use in-memory storage for tests
process.env.MISTRAL_API_KEY = 'test-api-key'; // Mock API key

// Global test utilities
global.testUtils = {
  // Helper to create test data
  createTestRecipe: (overrides = {}) => ({
    name: 'Test Recipe',
    description: 'A test recipe for unit testing',
    prepTime: 15,
    cookTime: 30,
    difficulty: 'easy',
    servings: 4,
    ingredients: [
      { name: 'test ingredient', quantity: '1', unit: 'cup' }
    ],
    instructions: 'Test instructions for cooking',
    dietaryTags: ['test'],
    ...overrides
  }),
  
  createTestMealPlan: (overrides = {}) => ({
    date: '2025-09-05',
    mealType: 'dinner',
    recipeId: 'test-recipe-id',
    servings: 2,
    ...overrides
  }),
  
  createTestShoppingListItem: (overrides = {}) => ({
    weekStartDate: '2025-09-02',
    ingredientName: 'test ingredient',
    quantity: '2',
    unit: 'cups',
    isChecked: false,
    ...overrides
  }),
  
  // Helper to wait for async operations
  wait: (ms = 0) => new Promise(resolve => setTimeout(resolve, ms)),
  
  // Helper to suppress console errors in specific tests
  suppressConsoleError: () => {
    const originalError = console.error;
    console.error = jest.fn();
    return () => {
      console.error = originalError;
    };
  }
};

// Custom matchers for better test assertions
expect.extend({
  toBeValidRecipe(received) {
    const required = ['id', 'name', 'difficulty', 'ingredients', 'instructions'];
    const missing = required.filter(field => !(field in received));
    
    if (missing.length > 0) {
      return {
        message: () => `Expected recipe to have required fields: ${missing.join(', ')}`,
        pass: false
      };
    }
    
    if (!Array.isArray(received.ingredients) || received.ingredients.length === 0) {
      return {
        message: () => `Expected recipe to have at least one ingredient`,
        pass: false
      };
    }
    
    return {
      message: () => `Expected recipe to be invalid`,
      pass: true
    };
  },
  
  toBeValidMealPlan(received) {
    const required = ['id', 'date', 'mealType'];
    const missing = required.filter(field => !(field in received));
    
    if (missing.length > 0) {
      return {
        message: () => `Expected meal plan to have required fields: ${missing.join(', ')}`,
        pass: false
      };
    }
    
    return {
      message: () => `Expected meal plan to be invalid`,
      pass: true
    };
  }
});

// Cleanup function to run after each test
afterEach(() => {
  // Clear any timers
  jest.clearAllTimers();
  
  // Reset modules between tests
  jest.resetModules();
});

// Global error handler for unhandled promise rejections in tests
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process in tests, just log
});