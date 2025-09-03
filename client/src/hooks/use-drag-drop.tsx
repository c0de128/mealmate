import { useState } from "react";
import { type Recipe } from "@shared/schema";

export function useDragDrop() {
  const [draggedRecipe, setDraggedRecipe] = useState<Recipe | null>(null);

  const handleDragStart = (recipe: Recipe) => {
    setDraggedRecipe(recipe);
  };

  const handleDragEnd = () => {
    setDraggedRecipe(null);
  };

  return {
    draggedRecipe,
    handleDragStart,
    handleDragEnd,
  };
}
