import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Navigation from "@/components/navigation";
import RecipeCard from "@/components/recipe-card";
import RecipeModal from "@/components/recipe-modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { type Recipe } from "@shared/schema";
import { Search, Plus } from "lucide-react";

export default function Recipes() {
  const [searchQuery, setSearchQuery] = useState("");
  const [dietaryFilter, setDietaryFilter] = useState("");
  const [isRecipeModalOpen, setIsRecipeModalOpen] = useState(false);

  const { data: recipes = [], isLoading } = useQuery({
    queryKey: ['/api/recipes', searchQuery, dietaryFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchQuery) params.append('search', searchQuery);
      if (dietaryFilter && dietaryFilter !== 'all') params.append('dietary', dietaryFilter);
      
      const response = await fetch(`/api/recipes?${params}`);
      if (!response.ok) throw new Error('Failed to fetch recipes');
      return response.json() as Promise<Recipe[]>;
    }
  });

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-3xl font-bold text-foreground">Recipe Collection</h2>
              <p className="text-muted-foreground mt-1">Manage and organize your recipes</p>
            </div>
            <Button 
              onClick={() => setIsRecipeModalOpen(true)}
              data-testid="button-add-recipe"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Recipe
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between">
              <CardTitle>All Recipes</CardTitle>
              <div className="flex items-center space-x-3 mt-4 sm:mt-0">
                <div className="relative">
                  <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Search recipes..." 
                    className="pl-10"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    data-testid="input-search-recipes"
                  />
                </div>
                <Select value={dietaryFilter} onValueChange={setDietaryFilter}>
                  <SelectTrigger className="w-40" data-testid="select-dietary-filter">
                    <SelectValue placeholder="All Diets" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Diets</SelectItem>
                    <SelectItem value="vegetarian">Vegetarian</SelectItem>
                    <SelectItem value="vegan">Vegan</SelectItem>
                    <SelectItem value="gluten-free">Gluten-Free</SelectItem>
                    <SelectItem value="healthy">Healthy</SelectItem>
                    <SelectItem value="keto">Keto</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-64 w-full rounded-lg" />
                ))}
              </div>
            ) : recipes.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-muted-foreground mb-4">No recipes found</p>
                <Button onClick={() => setIsRecipeModalOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Your First Recipe
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {recipes.map((recipe) => (
                  <RecipeCard
                    key={recipe.id}
                    recipe={recipe}
                  />
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      <RecipeModal 
        isOpen={isRecipeModalOpen}
        onClose={() => setIsRecipeModalOpen(false)}
      />
    </div>
  );
}
