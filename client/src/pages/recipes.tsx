import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Navigation from "@/components/navigation";
import RecipeCard from "@/components/recipe-card";
import RecipeForm from "@/components/recipe-form";
import BulkOperations from "@/components/bulk-operations";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { type Recipe } from "@shared/schema";
import { Search, Square, CheckSquare } from "lucide-react";

export default function Recipes() {
  const [searchQuery, setSearchQuery] = useState("");
  const [dietaryFilter, setDietaryFilter] = useState("");
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<string[]>([]);
  const [selectionMode, setSelectionMode] = useState(false);

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

  const toggleRecipeSelection = (recipeId: string) => {
    setSelectedRecipeIds(prev => 
      prev.includes(recipeId) 
        ? prev.filter(id => id !== recipeId)
        : [...prev, recipeId]
    );
  };

  const selectAllRecipes = () => {
    setSelectedRecipeIds(recipes.map(recipe => recipe.id));
  };

  const clearSelection = () => {
    setSelectedRecipeIds([]);
    setSelectionMode(false);
  };

  const toggleSelectionMode = () => {
    setSelectionMode(!selectionMode);
    if (selectionMode) {
      setSelectedRecipeIds([]);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div>
            <h2 className="text-3xl font-bold text-foreground">Recipe Collection</h2>
            <p className="text-muted-foreground mt-1">Manage and organize your recipes</p>
          </div>
        </div>

        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-xl">Add New Recipe</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col space-y-4">
              <p className="text-muted-foreground">
                Create a new recipe to add to your collection. You can manually enter recipe details or import from a URL.
              </p>
              <RecipeForm />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between">
              <div className="flex items-center space-x-4">
                <CardTitle>All Recipes</CardTitle>
                {selectionMode && (
                  <div className="flex items-center space-x-2 text-sm text-muted-foreground">
                    <span>{selectedRecipeIds.length} selected</span>
                    {recipes.length > 0 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={selectedRecipeIds.length === recipes.length ? clearSelection : selectAllRecipes}
                      >
                        {selectedRecipeIds.length === recipes.length ? (
                          <>
                            <CheckSquare className="h-4 w-4 mr-1" />
                            Deselect All
                          </>
                        ) : (
                          <>
                            <Square className="h-4 w-4 mr-1" />
                            Select All
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center space-x-3 mt-4 sm:mt-0">
                {selectionMode && (
                  <div className="flex items-center space-x-2">
                    <BulkOperations 
                      selectedRecipeIds={selectedRecipeIds} 
                      onSelectionChange={setSelectedRecipeIds}
                    />
                    <Button variant="outline" size="sm" onClick={clearSelection}>
                      Cancel
                    </Button>
                  </div>
                )}
                {!selectionMode && (
                  <>
                    <Button variant="outline" size="sm" onClick={toggleSelectionMode}>
                      Select Recipes
                    </Button>
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
                  </>
                )}
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
                <p className="text-sm text-muted-foreground">Use the "Add New Recipe" section above to create your first recipe.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {recipes.map((recipe) => (
                  <div key={recipe.id} className="relative">
                    {selectionMode && (
                      <div className="absolute top-2 left-2 z-10">
                        <Checkbox
                          checked={selectedRecipeIds.includes(recipe.id)}
                          onCheckedChange={() => toggleRecipeSelection(recipe.id)}
                          className="bg-background border-2 border-primary data-[state=checked]:bg-primary"
                        />
                      </div>
                    )}
                    <div className={`${selectionMode ? 'cursor-pointer' : ''} ${selectedRecipeIds.includes(recipe.id) ? 'ring-2 ring-primary ring-offset-2' : ''}`}>
                      <RecipeCard
                        recipe={recipe}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
