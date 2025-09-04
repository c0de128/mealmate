import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, jsonb, timestamp, index } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const recipes = pgTable("recipes", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  prepTime: integer("prep_time"), // in minutes
  cookTime: integer("cook_time"), // in minutes
  difficulty: varchar("difficulty", { enum: ["easy", "medium", "hard"] }).notNull(),
  servings: integer("servings").notNull().default(4),
  ingredients: jsonb("ingredients").$type<Ingredient[]>().notNull(),
  instructions: text("instructions").notNull(),
  dietaryTags: text("dietary_tags").array().notNull().default([]),
  imageUrl: text("image_url"),
  isFavorite: integer("is_favorite").notNull().default(0),
  rating: integer("rating").default(0), // 1-5 star rating
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  nameIdx: index("recipe_name_idx").on(table.name),
  difficultyIdx: index("recipe_difficulty_idx").on(table.difficulty),
  dietaryTagsIdx: index("recipe_dietary_tags_idx").using('gin', table.dietaryTags),
  favoriteIdx: index("recipe_favorite_idx").on(table.isFavorite),
  ratingIdx: index("recipe_rating_idx").on(table.rating),
  createdAtIdx: index("recipe_created_at_idx").on(table.createdAt),
}));

export const recipeCollections = pgTable("recipe_collections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  description: text("description"),
  color: varchar("color").default("#3b82f6"), // hex color code
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => ({
  nameIdx: index("collection_name_idx").on(table.name),
  createdAtIdx: index("collection_created_at_idx").on(table.createdAt),
}));

export const recipeCollectionItems = pgTable("recipe_collection_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  collectionId: varchar("collection_id").references(() => recipeCollections.id, { onDelete: "cascade" }).notNull(),
  recipeId: varchar("recipe_id").references(() => recipes.id, { onDelete: "cascade" }).notNull(),
  addedAt: timestamp("added_at").defaultNow(),
}, (table) => ({
  collectionIdx: index("collection_items_collection_idx").on(table.collectionId),
  recipeIdx: index("collection_items_recipe_idx").on(table.recipeId),
  uniqueCollectionRecipe: index("collection_items_unique_idx").on(table.collectionId, table.recipeId),
}));

export const mealPlans = pgTable("meal_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  date: text("date").notNull(), // YYYY-MM-DD format
  mealType: varchar("meal_type", { enum: ["breakfast", "lunch", "dinner"] }).notNull(),
  recipeId: varchar("recipe_id").references(() => recipes.id, { onDelete: "cascade" }),
  servings: integer("servings").notNull().default(4),
}, (table) => ({
  dateIdx: index("meal_plan_date_idx").on(table.date),
  mealTypeIdx: index("meal_plan_meal_type_idx").on(table.mealType),
  recipeIdIdx: index("meal_plan_recipe_id_idx").on(table.recipeId),
  dateRangeIdx: index("meal_plan_date_range_idx").on(table.date, table.mealType),
}));

export const shoppingListItems = pgTable("shopping_list_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  weekStartDate: text("week_start_date").notNull(), // YYYY-MM-DD format  
  ingredient: text("ingredient").notNull(),
  quantity: text("quantity").notNull(),
  unit: text("unit"),
  checked: integer("checked").notNull().default(0),
  estimatedCost: text("estimated_cost"),
}, (table) => ({
  weekStartDateIdx: index("shopping_list_week_start_date_idx").on(table.weekStartDate),
  ingredientIdx: index("shopping_list_ingredient_idx").on(table.ingredient),
  checkedIdx: index("shopping_list_checked_idx").on(table.checked),
}));

export interface Ingredient {
  name: string;
  quantity: string;
  unit: string;
}

export const insertRecipeSchema = createInsertSchema(recipes).omit({
  id: true,
  createdAt: true,
});

export const insertMealPlanSchema = createInsertSchema(mealPlans).omit({
  id: true,
});

export const insertShoppingListItemSchema = createInsertSchema(shoppingListItems).omit({
  id: true,
});

export const insertRecipeCollectionSchema = createInsertSchema(recipeCollections).omit({
  id: true,
  createdAt: true,
});

export const insertRecipeCollectionItemSchema = createInsertSchema(recipeCollectionItems).omit({
  id: true,
  addedAt: true,
});

export type Recipe = typeof recipes.$inferSelect;
export type InsertRecipe = z.infer<typeof insertRecipeSchema>;
export type MealPlan = typeof mealPlans.$inferSelect;
export type InsertMealPlan = z.infer<typeof insertMealPlanSchema>;
export type ShoppingListItem = typeof shoppingListItems.$inferSelect;
export type InsertShoppingListItem = z.infer<typeof insertShoppingListItemSchema>;
export type RecipeCollection = typeof recipeCollections.$inferSelect;
export type InsertRecipeCollection = z.infer<typeof insertRecipeCollectionSchema>;
export type RecipeCollectionItem = typeof recipeCollectionItems.$inferSelect;
export type InsertRecipeCollectionItem = z.infer<typeof insertRecipeCollectionItemSchema>;
