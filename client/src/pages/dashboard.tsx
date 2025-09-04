import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format, startOfWeek, addDays } from "date-fns";
import Navigation from "@/components/navigation";
import RecipeCard from "@/components/recipe-card";
import MealSlot from "@/components/meal-slot";
import RecipeModal from "@/components/recipe-modal";
import ShoppingList from "@/components/shopping-list";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useDragDrop } from "@/hooks/use-drag-drop";
import { useMealPlan } from "@/hooks/use-meal-plan";
import { apiRequest } from "@/lib/queryClient";
import { type Recipe, type MealPlan } from "@shared/schema";
import { Utensils, Users, ShoppingCart, Plus, ChevronLeft, ChevronRight, Sun, Clock, Moon, Search, Filter, WandSparkles, ChartPie } from "lucide-react";

export default function Dashboard() {
  const [currentWeek, setCurrentWeek] = useState(() => startOfWeek(new Date()));
  const [servingCount, setServingCount] = useState(4);
  const [searchQuery, setSearchQuery] = useState("");
  const [dietaryFilter, setDietaryFilter] = useState("");
  const [isRecipeModalOpen, setIsRecipeModalOpen] = useState(false);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const weekStartDate = format(currentWeek, 'yyyy-MM-dd');

  const { data: recipes = [], isLoading: recipesLoading } = useQuery({
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

  const { data: mealPlans = [], isLoading: mealPlansLoading } = useQuery({
    queryKey: ['/api/meal-plans', weekStartDate],
    queryFn: async () => {
      const response = await fetch(`/api/meal-plans?weekStartDate=${weekStartDate}`);
      if (!response.ok) throw new Error('Failed to fetch meal plans');
      return response.json() as Promise<MealPlan[]>;
    }
  });

  const { data: shoppingList = [] } = useQuery({
    queryKey: ['/api/shopping-list', weekStartDate],
    queryFn: async () => {
      const response = await fetch(`/api/shopping-list?weekStartDate=${weekStartDate}`);
      if (!response.ok) throw new Error('Failed to fetch shopping list');
      return response.json();
    }
  });

  const assignMealMutation = useMutation({
    mutationFn: async ({ date, mealType, recipeId }: { date: string; mealType: string; recipeId: string }) => {
      return apiRequest('POST', '/api/meal-plans', {
        date,
        mealType,
        recipeId,
        servings: servingCount
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/meal-plans'] });
      toast({ title: "Meal assigned successfully!" });
    },
    onError: () => {
      toast({ title: "Failed to assign meal", variant: "destructive" });
    }
  });

  const generateShoppingListMutation = useMutation({
    mutationFn: async () => {
      return apiRequest('POST', '/api/shopping-list/generate', { weekStartDate });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shopping-list'] });
      toast({ title: "Shopping list generated!" });
    },
    onError: () => {
      toast({ title: "Failed to generate shopping list", variant: "destructive" });
    }
  });

  const { draggedRecipe, handleDragStart, handleDragEnd } = useDragDrop();
  const { 
    weekDays, 
    getMealPlan, 
    getWeekStats 
  } = useMealPlan(currentWeek, mealPlans, recipes);

  const handleMealAssignment = useCallback((date: string, mealType: string, recipeId: string) => {
    assignMealMutation.mutate({ date, mealType, recipeId });
  }, [assignMealMutation]);

  const stats = getWeekStats();
  
  const totalEstimatedCost = useMemo(() => 
    shoppingList.reduce((sum: number, item: any) => 
      sum + parseFloat(item.estimatedCost || '0'), 0
    ),
    [shoppingList]
  );

  const weekLabel = useMemo(() => 
    `${format(currentWeek, 'MMM d')} - ${format(addDays(currentWeek, 6), 'MMM d, yyyy')}`,
    [currentWeek]
  );
  
  const handlePreviousWeek = useCallback(() => {
    setCurrentWeek(addDays(currentWeek, -7));
  }, [currentWeek]);
  
  const handleNextWeek = useCallback(() => {
    setCurrentWeek(addDays(currentWeek, 7));
  }, [currentWeek]);
  
  const handleGenerateShoppingList = useCallback(() => {
    generateShoppingListMutation.mutate();
  }, [generateShoppingListMutation]);
  
  const handleOpenRecipeModal = useCallback(() => {
    setIsRecipeModalOpen(true);
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Dashboard Header */}
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-3xl font-bold text-foreground">This Week's Meal Plan</h2>
              <p className="text-muted-foreground mt-1">Plan your meals and generate shopping lists effortlessly</p>
            </div>
            <div className="flex items-center space-x-3 mt-4 sm:mt-0">
              <div className="flex items-center space-x-2 bg-card border border-border rounded-lg px-4 py-2">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">Servings:</span>
                <Input 
                  type="number" 
                  value={servingCount} 
                  onChange={(e) => setServingCount(parseInt(e.target.value) || 4)}
                  min="1" 
                  max="12"
                  className="w-16 text-center border-0 p-0 h-auto text-sm"
                  data-testid="input-servings"
                />
              </div>
              <Button 
                onClick={handleGenerateShoppingList}
                disabled={generateShoppingListMutation.isPending}
                className="bg-accent text-accent-foreground hover:bg-accent/90"
                data-testid="button-generate-shopping-list"
              >
                <ShoppingCart className="h-4 w-4 mr-2" />
                Generate List
              </Button>
            </div>
          </div>
        </div>

        {/* Meal Planning Calendar */}
        <Card className="mb-8">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between">
              <CardTitle>Weekly Meal Plan</CardTitle>
              <div className="flex items-center space-x-2 mt-4 sm:mt-0">
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={handlePreviousWeek}
                  data-testid="button-previous-week"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-sm font-medium px-4" data-testid="text-current-week">
                  {weekLabel}
                </span>
                <Button 
                  variant="ghost" 
                  size="sm"
                  onClick={handleNextWeek}
                  data-testid="button-next-week"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-7 gap-4">
              {weekDays.map((day) => (
                <div key={day.date} className="bg-secondary/50 rounded-lg p-4 min-h-[400px]">
                  <div className="text-center mb-4">
                    <div className="font-semibold text-foreground">{day.dayName}</div>
                    <div className="text-sm text-muted-foreground">{day.displayDate}</div>
                  </div>
                  
                  {(['breakfast', 'lunch', 'dinner'] as const).map((mealType) => (
                    <MealSlot
                      key={`${day.date}-${mealType}`}
                      date={day.date}
                      mealType={mealType}
                      mealPlan={getMealPlan(day.date, mealType)}
                      recipes={recipes}
                      onMealAssign={handleMealAssignment}
                      draggedRecipe={draggedRecipe}
                      className="mb-4 last:mb-0"
                    />
                  ))}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recipe Library and Sidebar */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Recipe Library */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between">
                  <CardTitle>Recipe Library</CardTitle>
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
                {recipesLoading ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <Skeleton key={i} className="h-64 w-full rounded-lg" />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {recipes.map((recipe) => (
                      <RecipeCard
                        key={recipe.id}
                        recipe={recipe}
                        onDragStart={() => handleDragStart(recipe)}
                        onDragEnd={handleDragEnd}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Shopping List Preview */}
            <ShoppingList 
              items={shoppingList} 
              weekStartDate={weekStartDate}
              totalCost={totalEstimatedCost}
            />

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle>Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <Button variant="ghost" className="w-full justify-between p-3 h-auto">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-primary/20 rounded-lg flex items-center justify-center">
                      <WandSparkles className="h-5 w-5 text-primary" />
                    </div>
                    <div className="text-left">
                      <div className="font-medium">Smart Suggestions</div>
                      <div className="text-xs text-muted-foreground">Get AI meal recommendations</div>
                    </div>
                  </div>
                </Button>

                <Button variant="ghost" className="w-full justify-between p-3 h-auto">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-accent/20 rounded-lg flex items-center justify-center">
                      <Clock className="h-5 w-5 text-accent" />
                    </div>
                    <div className="text-left">
                      <div className="font-medium">Meal Prep Timer</div>
                      <div className="text-xs text-muted-foreground">Estimate prep time</div>
                    </div>
                  </div>
                </Button>

                <Button variant="ghost" className="w-full justify-between p-3 h-auto">
                  <div className="flex items-center space-x-3">
                    <div className="w-10 h-10 bg-warning/20 rounded-lg flex items-center justify-center">
                      <ChartPie className="h-5 w-5 text-warning" />
                    </div>
                    <div className="text-left">
                      <div className="font-medium">Nutrition Analysis</div>
                      <div className="text-xs text-muted-foreground">View meal nutrition</div>
                    </div>
                  </div>
                </Button>
              </CardContent>
            </Card>

            {/* Weekly Stats */}
            <Card>
              <CardHeader>
                <CardTitle>This Week</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Planned meals</span>
                  <span className="font-medium" data-testid="text-planned-meals">
                    {stats.plannedMeals} of 21
                  </span>
                </div>
                <div className="w-full bg-secondary rounded-full h-2">
                  <div 
                    className="bg-primary h-2 rounded-full transition-all" 
                    style={{ width: `${(stats.plannedMeals / 21) * 100}%` }}
                  />
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Prep time</span>
                  <span className="font-medium" data-testid="text-prep-time">
                    {stats.totalPrepTime}
                  </span>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Est. cost</span>
                  <span className="font-medium text-success" data-testid="text-estimated-cost">
                    ${totalEstimatedCost.toFixed(2)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* Floating Action Button */}
      <Button
        className="fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all z-40"
        onClick={handleOpenRecipeModal}
        data-testid="button-add-recipe"
      >
        <Plus className="h-6 w-6" />
      </Button>

      {/* Recipe Modal */}
      <RecipeModal 
        isOpen={isRecipeModalOpen}
        onClose={() => setIsRecipeModalOpen(false)}
      />

      {/* Mobile Navigation Bottom Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-card border-t border-border md:hidden z-40">
        <div className="flex items-center justify-around py-2">
          <a href="#dashboard" className="flex flex-col items-center p-3 text-primary">
            <Clock className="h-5 w-5" />
            <span className="text-xs mt-1">Plan</span>
          </a>
          <a href="#recipes" className="flex flex-col items-center p-3 text-muted-foreground">
            <Utensils className="h-5 w-5" />
            <span className="text-xs mt-1">Recipes</span>
          </a>
          <a href="#add" className="flex flex-col items-center p-3 text-muted-foreground">
            <Plus className="h-5 w-5" />
            <span className="text-xs mt-1">Add</span>
          </a>
          <a href="#shopping" className="flex flex-col items-center p-3 text-muted-foreground">
            <ShoppingCart className="h-5 w-5" />
            <span className="text-xs mt-1">Shop</span>
          </a>
        </div>
      </nav>
    </div>
  );
}
