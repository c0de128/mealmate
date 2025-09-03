import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format, startOfWeek, addDays } from "date-fns";
import Navigation from "@/components/navigation";
import ShoppingList from "@/components/shopping-list";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function Shopping() {
  const [currentWeek, setCurrentWeek] = useState(() => startOfWeek(new Date()));
  const weekStartDate = format(currentWeek, 'yyyy-MM-dd');

  const { data: shoppingList = [] } = useQuery({
    queryKey: ['/api/shopping-list', weekStartDate],
    queryFn: async () => {
      const response = await fetch(`/api/shopping-list?weekStartDate=${weekStartDate}`);
      if (!response.ok) throw new Error('Failed to fetch shopping list');
      return response.json();
    }
  });

  const totalEstimatedCost = shoppingList.reduce((sum: number, item: any) => 
    sum + parseFloat(item.estimatedCost || '0'), 0
  );

  const weekLabel = `${format(currentWeek, 'MMM d')} - ${format(addDays(currentWeek, 6), 'MMM d, yyyy')}`;

  return (
    <div className="min-h-screen bg-background">
      <Navigation />
      
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-3xl font-bold text-foreground">Shopping List</h2>
              <p className="text-muted-foreground mt-1">Manage your weekly grocery shopping</p>
            </div>
            <div className="flex items-center space-x-2 mt-4 sm:mt-0">
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => setCurrentWeek(addDays(currentWeek, -7))}
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
                onClick={() => setCurrentWeek(addDays(currentWeek, 7))}
                data-testid="button-next-week"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Weekly Shopping List</CardTitle>
          </CardHeader>
          <CardContent>
            <ShoppingList 
              items={shoppingList} 
              weekStartDate={weekStartDate}
              totalCost={totalEstimatedCost}
              fullView={true}
            />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
