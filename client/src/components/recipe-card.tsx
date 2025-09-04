import { useState, memo, useCallback, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { type Recipe } from "@shared/schema";
import OptimizedImage from "@/components/optimized-image";
import { Clock, Users, Copy, Edit, Trash2, Star, Heart } from "lucide-react";

interface RecipeCardProps {
  recipe: Recipe;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

function RecipeCard({ recipe, onDragStart, onDragEnd }: RecipeCardProps) {
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

  const toggleFavoriteMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', `/api/recipes/${recipe.id}/favorite`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/recipes'] });
      toast({ title: recipe.isFavorite ? "Removed from favorites" : "Added to favorites" });
    },
    onError: () => {
      toast({ title: "Failed to update favorite", variant: "destructive" });
    }
  });

  const setRatingMutation = useMutation({
    mutationFn: async (rating: number) => {
      return apiRequest('POST', `/api/recipes/${recipe.id}/rating`, { rating });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/recipes'] });
      toast({ title: "Rating updated!" });
    },
    onError: () => {
      toast({ title: "Failed to update rating", variant: "destructive" });
    }
  });

  const difficultyStars = useMemo(() => {
    const stars = recipe.difficulty === 'easy' ? 1 : recipe.difficulty === 'medium' ? 2 : 3;
    return Array.from({ length: 5 }, (_, i) => (
      <Star 
        key={i} 
        className={`h-3 w-3 ${i < stars ? 'text-warning fill-current' : 'text-muted-foreground'}`} 
      />
    ));
  }, [recipe.difficulty]);

  const ratingStars = useMemo(() => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star 
        key={i}
        className={`h-3 w-3 cursor-pointer transition-colors ${
          i < (recipe.rating || 0) ? 'text-yellow-400 fill-current' : 'text-muted-foreground hover:text-yellow-300'
        }`}
        onClick={(e) => {
          e.stopPropagation();
          setRatingMutation.mutate(i + 1);
        }}
      />
    ));
  }, [recipe.rating, setRatingMutation]);

  const handleDragStart = useCallback((e: React.DragEvent) => {
    setIsDragging(true);
    onDragStart?.();
    e.dataTransfer.setData('recipe-id', recipe.id);
  }, [onDragStart, recipe.id]);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    onDragEnd?.();
  }, [onDragEnd]);

  const totalTime = useMemo(() => {
    return (recipe.prepTime || 0) + (recipe.cookTime || 0);
  }, [recipe.prepTime, recipe.cookTime]);

  const visibleDietaryTags = useMemo(() => {
    return recipe.dietaryTags.slice(0, 2);
  }, [recipe.dietaryTags]);

  return (
    <Card 
      className={`recipe-card overflow-hidden cursor-grab transition-all ${isDragging ? 'opacity-50' : ''}`}
      draggable={!!onDragStart}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      data-testid={`card-recipe-${recipe.id}`}
    >
      <OptimizedImage
        src={recipe.imageUrl}
        alt={recipe.name}
        className="w-full h-32"
      />
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
                {totalTime} min
              </span>
            )}
            <span className="flex items-center">
              <Users className="h-3 w-3 mr-1" />
              {recipe.servings} servings
            </span>
          </div>
          {recipe.dietaryTags.length > 0 && (
            <div className="flex space-x-1">
              {visibleDietaryTags.map((tag) => (
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
        
        {/* Rating Row */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-1">
            <span className="text-xs text-muted-foreground">Rating:</span>
            <div className="flex">{ratingStars}</div>
          </div>
          {recipe.isFavorite && (
            <Heart className="h-3 w-3 text-red-500 fill-current" />
          )}
        </div>
        
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-1">
            <div className="flex">
              {difficultyStars}
            </div>
            <span className="text-xs text-muted-foreground capitalize">
              {recipe.difficulty}
            </span>
          </div>
          <div className="flex space-x-1">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                toggleFavoriteMutation.mutate();
              }}
              disabled={toggleFavoriteMutation.isPending}
              className={`${recipe.isFavorite ? 'text-red-500 hover:text-red-600' : 'text-muted-foreground hover:text-red-500'}`}
              data-testid="button-favorite-recipe"
            >
              <Heart className={`h-3 w-3 ${recipe.isFavorite ? 'fill-current' : ''}`} />
            </Button>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                duplicateRecipeMutation.mutate();
              }}
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
              onClick={(e) => {
                e.stopPropagation();
                deleteRecipeMutation.mutate();
              }}
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

export default memo(RecipeCard);
