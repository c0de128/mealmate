import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ShoppingListItem {
  id: string;
  ingredient: string;
  quantity: string;
  unit?: string | null;
  checked: number;
  estimatedCost?: string | null;
  weekStartDate: string;
  category?: string;
  recipeName?: string;
}

interface ExportOptions {
  title?: string;
  subtitle?: string;
  groupByCategory?: boolean;
  showRecipeInfo?: boolean;
  includeChecked?: boolean;
  showDate?: boolean;
}

export function exportShoppingListToPDF(
  items: ShoppingListItem[],
  options: ExportOptions = {}
) {
  const {
    title = 'Shopping List',
    subtitle = '',
    groupByCategory = true,
    showRecipeInfo = true,
    includeChecked = true,
    showDate = true
  } = options;

  // Filter items if needed
  const filteredItems = includeChecked ? items : items.filter(item => !item.checked);

  if (filteredItems.length === 0) {
    throw new Error('No items to export');
  }

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.width;
  let yPosition = 20;

  // Add title
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text(title, pageWidth / 2, yPosition, { align: 'center' });
  yPosition += 15;

  // Add subtitle if provided
  if (subtitle) {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'normal');
    doc.text(subtitle, pageWidth / 2, yPosition, { align: 'center' });
    yPosition += 10;
  }

  // Add date if requested
  if (showDate) {
    const weekStart = new Date(filteredItems[0]?.weekStartDate);
    if (!isNaN(weekStart.getTime())) {
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);
      
      doc.setFontSize(12);
      doc.setFont('helvetica', 'normal');
      doc.text(
        `Week of ${weekStart.toLocaleDateString()} - ${weekEnd.toLocaleDateString()}`,
        pageWidth / 2,
        yPosition,
        { align: 'center' }
      );
      yPosition += 15;
    }
  }

  // Add summary stats
  const totalItems = filteredItems.length;
  const checkedItems = filteredItems.filter(item => item.checked).length;
  const pendingItems = totalItems - checkedItems;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `Total: ${totalItems} items${checkedItems > 0 ? ` • Checked: ${checkedItems}` : ''}${pendingItems > 0 ? ` • Remaining: ${pendingItems}` : ''}`,
    pageWidth / 2,
    yPosition,
    { align: 'center' }
  );
  yPosition += 10;

  if (groupByCategory) {
    exportGroupedByCategory(doc, filteredItems, yPosition, showRecipeInfo);
  } else {
    exportAsList(doc, filteredItems, yPosition, showRecipeInfo);
  }

  // Generate filename
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `${title.replace(/[^a-z0-9]/gi, '_')}_${dateStr}.pdf`;

  // Save the PDF
  doc.save(filename);
  
  return {
    filename,
    itemCount: filteredItems.length,
    checkedCount: checkedItems,
    pendingCount: pendingItems
  };
}

function exportGroupedByCategory(
  doc: jsPDF,
  items: ShoppingListItem[],
  startY: number,
  showRecipeInfo: boolean
) {
  // Group items by category
  const categories = groupItemsByCategory(items);
  let yPosition = startY + 10;

  Object.entries(categories).forEach(([categoryName, categoryItems]) => {
    // Check if we need a new page
    if (yPosition > 250) {
      doc.addPage();
      yPosition = 20;
    }

    // Category header
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(categoryName, 20, yPosition);
    yPosition += 8;

    // Create table for category items
    const tableData = categoryItems.map(item => {
      const row = [
        item.checked ? '☑' : '☐',
        `${item.quantity}${item.unit ? ' ' + item.unit : ''}`.trim(),
        item.ingredient,
      ];
      
      if (showRecipeInfo && item.recipeName) {
        row.push(item.recipeName);
      }
      
      return row;
    });

    const headers = ['✓', 'Qty', 'Item'];
    if (showRecipeInfo && categoryItems.some(item => item.recipeName)) {
      headers.push('Recipe');
    }

    autoTable(doc, {
      head: [headers],
      body: tableData,
      startY: yPosition,
      margin: { left: 20, right: 20 },
      styles: {
        fontSize: 10,
        cellPadding: 2,
      },
      headStyles: {
        fillColor: [240, 240, 240],
        textColor: [0, 0, 0],
        fontStyle: 'bold',
        fontSize: 10,
      },
      columnStyles: {
        0: { halign: 'center', cellWidth: 15 },
        1: { cellWidth: showRecipeInfo ? 25 : 35 },
        2: { cellWidth: showRecipeInfo ? 70 : 110 },
        3: showRecipeInfo ? { cellWidth: 60 } : {}
      },
      alternateRowStyles: {
        fillColor: [250, 250, 250]
      },
      didParseCell: (data) => {
        // Strike through completed items
        if (data.column.index > 0 && tableData[data.row.index][0] === '☑') {
          data.cell.styles.textColor = [128, 128, 128];
        }
      }
    });

    yPosition = (doc as any).lastAutoTable.finalY + 15;
  });
}

function exportAsList(
  doc: jsPDF,
  items: ShoppingListItem[],
  startY: number,
  showRecipeInfo: boolean
) {
  const tableData = items.map(item => {
    const row = [
      item.checked ? '☑' : '☐',
      item.category || 'Other',
      `${item.quantity}${item.unit ? ' ' + item.unit : ''}`.trim(),
      item.ingredient,
    ];
    
    if (showRecipeInfo && item.recipeName) {
      row.push(item.recipeName);
    }
    
    return row;
  });

  const headers = ['✓', 'Category', 'Qty', 'Item'];
  if (showRecipeInfo && items.some(item => item.recipeName)) {
    headers.push('Recipe');
  }

  autoTable(doc, {
    head: [headers],
    body: tableData,
    startY: startY + 10,
    margin: { left: 20, right: 20 },
    styles: {
      fontSize: 10,
      cellPadding: 3,
    },
    headStyles: {
      fillColor: [240, 240, 240],
      textColor: [0, 0, 0],
      fontStyle: 'bold',
      fontSize: 10,
    },
    columnStyles: {
      0: { halign: 'center', cellWidth: 15 },
      1: { cellWidth: showRecipeInfo ? 25 : 30 },
      2: { cellWidth: showRecipeInfo ? 20 : 25 },
      3: { cellWidth: showRecipeInfo ? 60 : 95 },
      4: showRecipeInfo ? { cellWidth: 50 } : {}
    },
    alternateRowStyles: {
      fillColor: [250, 250, 250]
    },
    didParseCell: (data) => {
      // Strike through completed items
      if (data.column.index > 0 && tableData[data.row.index][0] === '☑') {
        data.cell.styles.textColor = [128, 128, 128];
      }
    }
  });
}

function groupItemsByCategory(items: ShoppingListItem[]): Record<string, ShoppingListItem[]> {
  const categories: Record<string, ShoppingListItem[]> = {};
  
  // Define category order for better organization
  const categoryOrder = [
    'Produce',
    'Fruits & Vegetables',
    'Meat & Seafood',
    'Dairy & Eggs',
    'Pantry',
    'Grains & Bread',
    'Canned Goods',
    'Frozen',
    'Beverages',
    'Condiments & Spices',
    'Snacks',
    'Personal Care',
    'Household',
    'Other'
  ];
  
  // Group items by category
  items.forEach(item => {
    const category = categorizeItem(item);
    if (!categories[category]) {
      categories[category] = [];
    }
    categories[category].push(item);
  });
  
  // Sort categories by predefined order
  const sortedCategories: Record<string, ShoppingListItem[]> = {};
  
  categoryOrder.forEach(category => {
    if (categories[category]) {
      sortedCategories[category] = categories[category].sort((a, b) => 
        a.ingredient.localeCompare(b.ingredient)
      );
    }
  });
  
  // Add any remaining categories not in the predefined order
  Object.keys(categories).forEach(category => {
    if (!sortedCategories[category]) {
      sortedCategories[category] = categories[category].sort((a, b) => 
        a.ingredient.localeCompare(b.ingredient)
      );
    }
  });
  
  return sortedCategories;
}

function categorizeItem(item: ShoppingListItem): string {
  if (item.category) {
    return item.category;
  }
  
  const name = item.ingredient.toLowerCase();
  
  // Produce
  if (/^(apple|banana|orange|lemon|lime|tomato|onion|garlic|carrot|potato|lettuce|spinach|cucumber|bell pepper|broccoli|mushroom|avocado|celery|ginger|herbs?)s?$/i.test(name) ||
      name.includes('fresh')) {
    return 'Produce';
  }
  
  // Meat & Seafood
  if (/^(chicken|beef|pork|fish|salmon|tuna|shrimp|turkey|ham|bacon|sausage|ground)s?/i.test(name) ||
      name.includes('meat')) {
    return 'Meat & Seafood';
  }
  
  // Dairy & Eggs
  if (/^(milk|cheese|yogurt|butter|cream|eggs?|sour cream)s?$/i.test(name)) {
    return 'Dairy & Eggs';
  }
  
  // Pantry/Grains
  if (/^(rice|pasta|bread|flour|sugar|salt|pepper|olive oil|cooking oil|vinegar|baking)s?/i.test(name) ||
      name.includes('oil')) {
    return 'Pantry';
  }
  
  // Canned Goods
  if (name.includes('canned') || name.includes('jar') ||
      /^(beans?|sauce|soup|broth|stock)s?$/i.test(name)) {
    return 'Canned Goods';
  }
  
  // Frozen
  if (name.includes('frozen')) {
    return 'Frozen';
  }
  
  // Beverages
  if (/^(water|juice|soda|beer|wine|coffee|tea)s?$/i.test(name)) {
    return 'Beverages';
  }
  
  return 'Other';
}