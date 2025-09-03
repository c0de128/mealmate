import { sql } from "drizzle-orm";
import { pgTable, text, varchar, integer, jsonb, timestamp } from "drizzle-orm/pg-core";
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
  createdAt: timestamp("created_at").defaultNow(),
});

export const mealPlans = pgTable("meal_plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  date: text("date").notNull(), // YYYY-MM-DD format
  mealType: varchar("meal_type", { enum: ["breakfast", "lunch", "dinner"] }).notNull(),
  recipeId: varchar("recipe_id").references(() => recipes.id, { onDelete: "cascade" }),
  servings: integer("servings").notNull().default(4),
});

export const shoppingListItems = pgTable("shopping_list_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  weekStartDate: text("week_start_date").notNull(), // YYYY-MM-DD format  
  ingredient: text("ingredient").notNull(),
  quantity: text("quantity").notNull(),
  unit: text("unit"),
  checked: integer("checked").notNull().default(0),
  estimatedCost: text("estimated_cost"),
});

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

export type Recipe = typeof recipes.$inferSelect;
export type InsertRecipe = z.infer<typeof insertRecipeSchema>;
export type MealPlan = typeof mealPlans.$inferSelect;
export type InsertMealPlan = z.infer<typeof insertMealPlanSchema>;
export type ShoppingListItem = typeof shoppingListItems.$inferSelect;
export type InsertShoppingListItem = z.infer<typeof insertShoppingListItemSchema>;
