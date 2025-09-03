import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { type MealPlan, type Recipe } from "@shared/schema";
import { Sun, Clock, Moon, Users, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface MealSlotProps {
  date: string;
  mealType: 'breakfast' | 'lunch' | 'dinner';
  mealPlan?: MealPlan;
  recipes: Recipe[];
  onMealAssign: (date: string, mealType: string, recipeId: string) => void;
  draggedRecipe?: Recipe | null;
  className?: string;
}

const mealIcons = {
  breakfast: Sun,
  lunch: Sun,
  dinner: Moon,
};

const mealColors = {
  breakfast: "text-warning",
  lunch: "text-yellow-500", 
  dinner: "text-blue-500",
};

export default function MealSlot({ 
  date, 
  mealType, 
  mealPlan, 
  recipes, 
  onMealAssign, 
  draggedRecipe,
  className 
}: MealSlotProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const recipe = mealPlan?.recipeId ? recipes.find(r => r.id === mealPlan.recipeId) : null;
  const Icon = mealIcons[mealType];

  const removeMealMutation = useMutation({
    mutationFn: async () => {
      if (!mealPlan) return;
      return apiRequest('DELETE', `/api/meal-plans/${mealPlan.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/meal-plans'] });
      toast({ title: "Meal removed successfully!" });
    },
    onError: () => {
      toast({ title: "Failed to remove meal", variant: "destructive" });
    }
  });

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const recipeId = e.dataTransfer.getData('recipe-id');
    if (recipeId) {
      onMealAssign(date, mealType, recipeId);
    }
  };

  const handleAssignDraggedRecipe = () => {
    if (draggedRecipe) {
      onMealAssign(date, mealType, draggedRecipe.id);
    }
  };

  return (
    <div className={className}>
      <div className="text-xs font-medium text-muted-foreground mb-2 flex items-center">
        <Icon className={cn("h-3 w-3 mr-1", mealColors[mealType])} />
        {mealType.charAt(0).toUpperCase() + mealType.slice(1)}
      </div>
      
      {recipe && mealPlan ? (
        <Card 
          className="meal-slot occupied cursor-pointer hover:shadow-md transition-all group"
          data-testid={`meal-slot-${date}-${mealType}-occupied`}
        >
          <CardContent className="p-3">
            <div className="flex justify-between items-start mb-2">
              <h4 className="font-medium text-sm text-card-foreground line-clamp-2">
                {recipe.name}
              </h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeMealMutation.mutate()}
                className="opacity-0 group-hover:opacity-100 h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                data-testid="button-remove-meal"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
            {recipe.imageUrl && (
              <img 
                src={recipe.imageUrl} 
                alt={recipe.name}
                className="w-full h-16 object-cover rounded mb-2"
              />
            )}
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-2 text-xs text-muted-foreground">
                {(recipe.prepTime || recipe.cookTime) && (
                  <span className="flex items-center">
                    <Clock className="h-3 w-3 mr-1" />
                    {(recipe.prepTime || 0) + (recipe.cookTime || 0)} min
                  </span>
                )}
                <span className="flex items-center">
                  <Users className="h-3 w-3 mr-1" />
                  {mealPlan.servings}
                </span>
              </div>
              {recipe.dietaryTags.length > 0 && (
                <Badge variant="secondary" className="text-xs">
                  {recipe.dietaryTags[0]}
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div
          className={cn(
            "meal-slot empty rounded-lg p-3 min-h-[80px] flex items-center justify-center text-muted-foreground cursor-pointer transition-colors",
            isDragOver && "drag-over"
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={handleAssignDraggedRecipe}
          data-testid={`meal-slot-${date}-${mealType}-empty`}
        >
          <span className="text-sm flex items-center">
            <Plus className="h-4 w-4 mr-2" />
            Add meal
          </span>
        </div>
      )}
    </div>
  );
}
