
export type UserRole = 'Admin' | 'Seller';

export interface Seller {
  id: string;
  email: string;
  password: string;
  name: string;
}

export interface AppConfig {
  supermarketName: string;
  logoUrl: string;
  adminPassword: string;
  sellers: Seller[];
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  price: number;
  costPrice: number;
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
  costPriceAtSale: number;
}

export interface Transaction {
  id: string;
  items: TransactionItem[];
  total: number;
  totalCost: number;
  type: 'SALE' | 'RESTOCK';
  timestamp: string;
}

export interface InventoryStats {
  totalItems: number;
  totalValue: number;
  totalCostValue: number;
  lowStockCount: number;
  outOfStockCount: number;
}
