import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { type Recipe } from "@shared/schema";
import { Clock, Users, Copy, Edit, Trash2, Star } from "lucide-react";

interface RecipeCardProps {
  recipe: Recipe;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

export default function RecipeCard({ recipe, onDragStart, onDragEnd }: RecipeCardProps) {
  const [isDragging, setIsDragging] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const deleteRecipeMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('DELETE', `/api/recipes/${recipe.id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/recipes'] });
      toast({ title: "Recipe deleted successfully!" });
    },
    onError: () => {
      toast({ title: "Failed to delete recipe", variant: "destructive" });
    }
  });

  const duplicateRecipeMutation = useMutation({
    mutationFn: async () => {
      const { id, createdAt, ...recipeData } = recipe;
      return apiRequest('POST', '/api/recipes', {
        ...recipeData,
        name: `${recipeData.name} (Copy)`
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/recipes'] });
      toast({ title: "Recipe duplicated successfully!" });
    },
    onError: () => {
      toast({ title: "Failed to duplicate recipe", variant: "destructive" });
    }
  });

  const getDifficultyStars = (difficulty: string) => {
    const stars = difficulty === 'easy' ? 1 : difficulty === 'medium' ? 2 : 3;
    return Array.from({ length: 5 }, (_, i) => (
      <Star 
        key={i} 
        className={`h-3 w-3 ${i < stars ? 'text-warning fill-current' : 'text-muted-foreground'}`} 
      />
    ));
  };

  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true);
    onDragStart?.();
    e.dataTransfer.setData('recipe-id', recipe.id);
  };

  const handleDragEnd = () => {
    setIsDragging(false);
    onDragEnd?.();
  };

  return (
    <Card 
      className={`recipe-card overflow-hidden cursor-grab transition-all ${isDragging ? 'opacity-50' : ''}`}
      draggable={!!onDragStart}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      data-testid={`card-recipe-${recipe.id}`}
    >
      {recipe.imageUrl && (
        <img 
          src={recipe.imageUrl} 
          alt={recipe.name}
          className="w-full h-32 object-cover"
        />
      )}
      <CardContent className="p-4">
        <h4 className="font-semibold text-card-foreground mb-2" data-testid="text-recipe-name">
          {recipe.name}
        </h4>
        {recipe.description && (
          <p className="text-sm text-muted-foreground mb-3 line-clamp-2" data-testid="text-recipe-description">
            {recipe.description}
          </p>
        )}
        
        <div className="flex justify-between items-center mb-3">
          <div className="flex items-center space-x-4 text-xs text-muted-foreground">
            {(recipe.prepTime || recipe.cookTime) && (
              <span className="flex items-center">
                <Clock className="h-3 w-3 mr-1" />
                {(recipe.prepTime || 0) + (recipe.cookTime || 0)} min
              </span>
            )}
            <span className="flex items-center">
              <Users className="h-3 w-3 mr-1" />
              {recipe.servings} servings
            </span>
          </div>
          {recipe.dietaryTags.length > 0 && (
            <div className="flex space-x-1">
              {recipe.dietaryTags.slice(0, 2).map((tag) => (
                <Badge 
                  key={tag} 
                  variant="secondary" 
                  className="text-xs px-2 py-1"
                  data-testid={`badge-dietary-${tag}`}
                >
                  {tag}
                </Badge>
              ))}
            </div>
          )}
        </div>
        
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-1">
            <div className="flex">
              {getDifficultyStars(recipe.difficulty)}
            </div>
            <span className="text-xs text-muted-foreground capitalize">
              {recipe.difficulty}
            </span>
          </div>
          <div className="flex space-x-2">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => duplicateRecipeMutation.mutate()}
              disabled={duplicateRecipeMutation.isPending}
              data-testid="button-duplicate-recipe"
            >
              <Copy className="h-3 w-3" />
            </Button>
            <Button 
              variant="ghost" 
              size="sm"
              data-testid="button-edit-recipe"
            >
              <Edit className="h-3 w-3" />
            </Button>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => deleteRecipeMutation.mutate()}
              disabled={deleteRecipeMutation.isPending}
              className="text-destructive hover:text-destructive"
              data-testid="button-delete-recipe"
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
