import { useMemo } from "react";
import { format, addDays } from "date-fns";
import { type MealPlan, type Recipe } from "@shared/schema";

export function useMealPlan(currentWeek: Date, mealPlans: MealPlan[], recipes: Recipe[]) {
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const date = addDays(currentWeek, i);
      return {
        date: format(date, 'yyyy-MM-dd'),
        dayName: format(date, 'EEE'),
        displayDate: format(date, 'MMM d'),
      };
    });
  }, [currentWeek]);

  const getMealPlan = (date: string, mealType: string) => {
    return mealPlans.find(plan => plan.date === date && plan.mealType === mealType);
  };

  const getWeekStats = () => {
    const plannedMeals = mealPlans.length;
    
    let totalPrepTime = 0;
    mealPlans.forEach(plan => {
      if (plan.recipeId) {
        const recipe = recipes.find(r => r.id === plan.recipeId);
        if (recipe) {
          totalPrepTime += (recipe.prepTime || 0) + (recipe.cookTime || 0);
        }
      }
    });

    const hours = Math.floor(totalPrepTime / 60);
    const minutes = totalPrepTime % 60;
    const formattedTime = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

    return {
      plannedMeals,
      totalPrepTime: formattedTime,
    };
  };

  return {
    weekDays,
    getMealPlan,
    getWeekStats,
  };
}
