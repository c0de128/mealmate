import type { InsertRecipe, InsertMealPlan, InsertShoppingListItem } from '../shared/schema';

declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidRecipe(): R;
      toBeValidMealPlan(): R;
    }
  }

  var testUtils: {
    createTestRecipe: (overrides?: Partial<InsertRecipe>) => InsertRecipe;
    createTestMealPlan: (overrides?: Partial<InsertMealPlan>) => InsertMealPlan;
    createTestShoppingListItem: (overrides?: Partial<InsertShoppingListItem>) => InsertShoppingListItem;
    wait: (ms?: number) => Promise<void>;
    suppressConsoleError: () => () => void;
  };
}

export {};