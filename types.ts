
export type Category = 
  | 'Produce' 
  | 'Dairy' 
  | 'Bakery' 
  | 'Meat' 
  | 'Frozen' 
  | 'Pantry' 
  | 'Beverages' 
  | 'Household' 
  | 'Personal Care';

export type UserRole = 'Admin' | 'Seller';

export interface Transaction {
  id: string;
  productId: string;
  productName: string;
  type: 'SALE' | 'RESTOCK';
  quantity: number;
  price: number;
  timestamp: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: Category;
  price: number;
  quantity: number;
  minThreshold: number;
  expiryDate?: string;
  lastUpdated: string;
  description?: string;
  tags?: string[];
}

export interface InventoryStats {
  totalItems: number;
  totalValue: number;
  lowStockCount: number;
  expiringSoonCount: number;
  outOfStockCount: number;
}

export interface AIResponse {
  insight: string;
  recommendations: string[];
}
