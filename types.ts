
export type UserRole = 'Admin' | 'Seller';

export interface Product {
  id: string;
  sku: string;
  name: string;
  price: number;
  costPrice: number; // Added to track financial performance
  quantity: number;
  minThreshold: number;
  expiryDate?: string;
  lastUpdated: string;
  tags?: string[];
}

export interface TransactionItem {
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  price: number;
  costPriceAtSale: number; // Track cost at time of sale for accurate historical profit
}

export interface Transaction {
  id: string;
  items: TransactionItem[];
  total: number;
  totalCost: number; // Added to track total cost of the transaction
  type: 'SALE' | 'RESTOCK';
  timestamp: string;
}

export interface InventoryStats {
  totalItems: number;
  totalValue: number;
  totalCostValue: number; // Potential cost of current inventory
  lowStockCount: number;
  outOfStockCount: number;
}
