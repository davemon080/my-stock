
export type UserRole = 'Admin' | 'Seller';

export interface Product {
  id: string;
  sku: string;
  name: string;
  price: number;
  quantity: number;
  minThreshold: number;
  expiryDate?: string;
  lastUpdated: string;
  tags?: string[];
}

export interface Transaction {
  id: string;
  productId: string;
  productName: string;
  type: 'SALE' | 'RESTOCK';
  quantity: number;
  price: number;
  timestamp: string;
}

export interface InventoryStats {
  totalItems: number;
  totalValue: number;
  lowStockCount: number;
  outOfStockCount: number;
}
