import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Utensils, Calendar, Book, ShoppingCart, Plus, Settings } from "lucide-react";

export default function Navigation() {
  const [location] = useLocation();

  const navItems = [
    { href: "/", label: "Dashboard", icon: Calendar },
    { href: "/recipes", label: "Recipes", icon: Book },
    { href: "/shopping", label: "Shopping List", icon: ShoppingCart },
    { href: "/settings", label: "Settings", icon: Settings },
  ];

  return (
    <header className="bg-card border-b border-border shadow-sm sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Utensils className="h-6 w-6 text-primary" />
              <h1 className="text-xl font-bold text-foreground">MealPlan</h1>
            </div>
            <nav className="hidden md:flex space-x-6">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location === item.href;
                return (
                  <Link key={item.href} href={item.href}>
                    <a
                      className={cn(
                        "flex items-center space-x-2 text-sm font-medium transition-colors hover:text-foreground",
                        isActive
                          ? "text-primary border-b-2 border-primary pb-1"
                          : "text-muted-foreground"
                      )}
                      data-testid={`nav-${item.label.toLowerCase().replace(' ', '-')}`}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </a>
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center space-x-4">
            <Link href="/recipes">
              <a>
                <Button className="hidden sm:flex" data-testid="button-add-recipe-nav">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Recipe
                </Button>
              </a>
            </Link>
            <Button variant="ghost" className="md:hidden" data-testid="button-mobile-menu">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </Button>
          </div>
        </div>
      </div>
    </header>
  );
}
