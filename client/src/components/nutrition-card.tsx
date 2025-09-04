import { memo, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Flame, Beef, Wheat, Droplets, Leaf, Zap } from "lucide-react";

interface NutritionData {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sodium: number;
}

interface NutritionCardProps {
  nutrition: NutritionData;
  title: string;
  subtitle?: string;
  showProgress?: boolean;
  targets?: Partial<NutritionData>; // Daily targets for progress bars
}

// Default daily nutrition targets (can be customized)
const DEFAULT_TARGETS = {
  calories: 2000,
  protein: 150,
  carbs: 250,
  fat: 65,
  fiber: 25,
  sodium: 2300,
};

function NutritionCard({ 
  nutrition, 
  title, 
  subtitle, 
  showProgress = false, 
  targets = DEFAULT_TARGETS 
}: NutritionCardProps) {
  const nutritionItems = useMemo(() => [
    {
      icon: Flame,
      label: "Calories",
      value: nutrition.calories,
      unit: "kcal",
      color: "text-orange-500",
      target: targets.calories,
    },
    {
      icon: Beef,
      label: "Protein",
      value: nutrition.protein,
      unit: "g",
      color: "text-red-500",
      target: targets.protein,
    },
    {
      icon: Wheat,
      label: "Carbs",
      value: nutrition.carbs,
      unit: "g",
      color: "text-amber-500",
      target: targets.carbs,
    },
    {
      icon: Droplets,
      label: "Fat",
      value: nutrition.fat,
      unit: "g",
      color: "text-yellow-500",
      target: targets.fat,
    },
    {
      icon: Leaf,
      label: "Fiber",
      value: nutrition.fiber,
      unit: "g",
      color: "text-green-500",
      target: targets.fiber,
    },
    {
      icon: Zap,
      label: "Sodium",
      value: nutrition.sodium,
      unit: "mg",
      color: "text-blue-500",
      target: targets.sodium,
    },
  ], [nutrition, targets]);

  const macroBreakdown = useMemo(() => {
    const totalMacros = nutrition.protein + nutrition.carbs + nutrition.fat;
    if (totalMacros === 0) return { protein: 0, carbs: 0, fat: 0 };
    
    return {
      protein: Math.round((nutrition.protein / totalMacros) * 100),
      carbs: Math.round((nutrition.carbs / totalMacros) * 100),
      fat: Math.round((nutrition.fat / totalMacros) * 100),
    };
  }, [nutrition]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">{title}</h3>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="flex space-x-1">
            <Badge variant="outline" className="text-red-500 border-red-500">
              P: {macroBreakdown.protein}%
            </Badge>
            <Badge variant="outline" className="text-amber-500 border-amber-500">
              C: {macroBreakdown.carbs}%
            </Badge>
            <Badge variant="outline" className="text-yellow-500 border-yellow-500">
              F: {macroBreakdown.fat}%
            </Badge>
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          {nutritionItems.map((item) => {
            const Icon = item.icon;
            const percentage = item.target ? Math.min((item.value / item.target) * 100, 100) : 0;
            
            return (
              <div key={item.label} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Icon className={`h-4 w-4 ${item.color}`} />
                    <span className="text-sm font-medium">{item.label}</span>
                  </div>
                  <span className="text-sm font-bold">
                    {typeof item.value === 'number' ? item.value.toFixed(1) : item.value}
                    <span className="text-xs text-muted-foreground ml-1">{item.unit}</span>
                  </span>
                </div>
                
                {showProgress && item.target && (
                  <div className="space-y-1">
                    <Progress value={percentage} className="h-2" />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>{percentage.toFixed(0)}% of target</span>
                      <span>{item.target}{item.unit}</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        
        {!showProgress && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="text-center">
              <div className="text-2xl font-bold text-primary">
                {nutrition.calories}
                <span className="text-sm font-normal text-muted-foreground ml-1">calories</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {nutrition.protein}g protein • {nutrition.carbs}g carbs • {nutrition.fat}g fat
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default memo(NutritionCard);