import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { type ShoppingListItem } from "@shared/schema";
import { ShoppingBasket, Download, Trash2 } from "lucide-react";

interface ShoppingListProps {
  items: ShoppingListItem[];
  weekStartDate: string;
  totalCost: number;
  fullView?: boolean;
}

export default function ShoppingList({ items, weekStartDate, totalCost, fullView = false }: ShoppingListProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const updateItemMutation = useMutation({
    mutationFn: async ({ id, checked }: { id: string; checked: boolean }) => {
      return apiRequest('PUT', `/api/shopping-list/${id}`, { checked });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shopping-list'] });
    },
    onError: () => {
      toast({ title: "Failed to update item", variant: "destructive" });
    }
  });

  const deleteItemMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest('DELETE', `/api/shopping-list/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/shopping-list'] });
      toast({ title: "Item removed from shopping list" });
    },
    onError: () => {
      toast({ title: "Failed to remove item", variant: "destructive" });
    }
  });

  const exportList = () => {
    const listText = items.map(item => 
      `${item.checked ? '✓' : '☐'} ${item.ingredient} (${item.quantity}${item.unit ? ' ' + item.unit : ''}) - $${item.estimatedCost}`
    ).join('\n');
    
    const element = document.createElement('a');
    const file = new Blob([`Shopping List\n\n${listText}\n\nTotal: $${totalCost.toFixed(2)}`], 
      { type: 'text/plain' }
    );
    element.href = URL.createObjectURL(file);
    element.download = `shopping-list-${weekStartDate}.txt`;
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    
    toast({ title: "Shopping list exported!" });
  };

  const checkedItems = items.filter(item => item.checked).length;

  if (!fullView) {
    // Preview version for dashboard
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center">
              <ShoppingBasket className="h-5 w-5 text-accent mr-2" />
              Shopping List
            </CardTitle>
            <Badge variant="secondary" data-testid="badge-item-count">
              {items.length} items
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 mb-4">
            {items.slice(0, 3).map((item) => (
              <div key={item.id} className="flex items-center justify-between py-2 border-b border-border last:border-b-0">
                <div className="flex items-center space-x-3">
                  <Checkbox
                    checked={!!item.checked}
                    onCheckedChange={(checked) => 
                      updateItemMutation.mutate({ id: item.id, checked: !!checked })
                    }
                    data-testid={`checkbox-item-${item.id}`}
                  />
                  <span className={`text-sm ${item.checked ? 'line-through text-muted-foreground' : 'text-card-foreground'}`}>
                    {item.ingredient} ({item.quantity}{item.unit && ` ${item.unit}`})
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  ${item.estimatedCost}
                </span>
              </div>
            ))}
            {items.length > 3 && (
              <div className="text-sm text-muted-foreground text-center py-2">
                +{items.length - 3} more items
              </div>
            )}
          </div>
          
          <div className="pt-4 border-t border-border">
            <div className="flex justify-between items-center mb-3">
              <span className="font-medium text-card-foreground">Total</span>
              <span className="font-semibold text-primary" data-testid="text-total-cost">
                ${totalCost.toFixed(2)}
              </span>
            </div>
            <Button 
              onClick={exportList}
              className="w-full bg-accent text-accent-foreground hover:bg-accent/90"
              data-testid="button-export-list"
            >
              <Download className="h-4 w-4 mr-2" />
              Export List
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Full view for shopping page
  return (
    <div className="space-y-4">
      {items.length === 0 ? (
        <div className="text-center py-12">
          <ShoppingBasket className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="text-muted-foreground mb-4">No shopping list generated yet</p>
          <p className="text-sm text-muted-foreground">
            Plan some meals for this week and generate a shopping list
          </p>
        </div>
      ) : (
        <>
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-4">
              <Badge variant="outline" data-testid="badge-item-progress">
                {checkedItems}/{items.length} items
              </Badge>
              <span className="text-sm text-muted-foreground">
                {((checkedItems / items.length) * 100).toFixed(0)}% complete
              </span>
            </div>
            <Button onClick={exportList} variant="outline" data-testid="button-export-full">
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>

          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.id} className="flex items-center justify-between p-3 bg-card border border-border rounded-lg">
                <div className="flex items-center space-x-3">
                  <Checkbox
                    checked={!!item.checked}
                    onCheckedChange={(checked) => 
                      updateItemMutation.mutate({ id: item.id, checked: !!checked })
                    }
                    data-testid={`checkbox-item-${item.id}`}
                  />
                  <div className={item.checked ? 'line-through text-muted-foreground' : ''}>
                    <div className="font-medium">{item.ingredient}</div>
                    <div className="text-sm text-muted-foreground">
                      {item.quantity}{item.unit && ` ${item.unit}`}
                    </div>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-medium">${item.estimatedCost}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => deleteItemMutation.mutate(item.id)}
                    className="text-muted-foreground hover:text-destructive"
                    data-testid={`button-delete-item-${item.id}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-between items-center pt-4 border-t border-border">
            <span className="text-lg font-semibold">Total Estimated Cost</span>
            <span className="text-xl font-bold text-primary" data-testid="text-total-cost-full">
              ${totalCost.toFixed(2)}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
