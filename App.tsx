
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Product, UserRole, InventoryStats, Transaction, TransactionItem } from './types.ts';
import { INITIAL_PRODUCTS, ICONS } from './constants.tsx';
import Fuse from 'fuse.js';
import ProductModal from './components/ProductModal.tsx';
import { getInventoryInsights } from './services/geminiService.ts';

interface CartItem extends Product {
  cartQuantity: number;
}

type DateFilter = 'Today' | '7D' | '30D' | 'All';

const App: React.FC = () => {
  const [role, setRole] = useState<UserRole>('Seller');
  const [activeTab, setActiveTab] = useState<'Dashboard' | 'Inventory' | 'Register' | 'Transactions' | 'Revenue'>('Dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isBasketOpen, setIsBasketOpen] = useState(false);
  const [receiptToShow, setReceiptToShow] = useState<Transaction | null>(null);
  const [revenueFilter, setRevenueFilter] = useState<DateFilter>('All');
  
  // Admin Login State
  const [isLoginOverlayOpen, setIsLoginOverlayOpen] = useState(false);
  const [passcodeInput, setPasscodeInput] = useState('');
  const [loginError, setLoginError] = useState(false);

  // Data Persistence
  const [products, setProducts] = useState<Product[]>(() => {
    const saved = localStorage.getItem('sm_inventory_v11');
    return saved ? JSON.parse(saved) : INITIAL_PRODUCTS;
  });
  
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const saved = localStorage.getItem('sm_transactions_v11');
    return saved ? JSON.parse(saved) : [];
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  
  // AI Insights State
  const [insights, setInsights] = useState<{insight: string, recommendations: string[]}>({
    insight: 'Initializing smart analysis...',
    recommendations: []
  });
  const [loadingInsights, setLoadingInsights] = useState(false);

  // SKU Counter
  const [skuCounter, setSkuCounter] = useState(() => {
    const saved = localStorage.getItem('sm_sku_counter_v11');
    return saved ? parseInt(saved) : (products.length + 100);
  });

  // Persistence
  useEffect(() => {
    localStorage.setItem('sm_inventory_v11', JSON.stringify(products));
    localStorage.setItem('sm_sku_counter_v11', skuCounter.toString());
  }, [products, skuCounter]);

  useEffect(() => {
    localStorage.setItem('sm_transactions_v11', JSON.stringify(transactions));
  }, [transactions]);

  // AI Analysis
  useEffect(() => {
    if (products.length > 0 && activeTab === 'Dashboard') {
      const fetchInsights = async () => {
        setLoadingInsights(true);
        try {
          const data = await getInventoryInsights(products);
          setInsights(data);
        } catch (e) {
          console.error("AI Insight Error:", e);
        } finally {
          setLoadingInsights(false);
        }
      };
      fetchInsights();
    }
  }, [products, activeTab]);

  // Derived Stats
  const stats = useMemo((): InventoryStats => {
    return {
      totalItems: products.length,
      totalValue: products.reduce((acc, p) => acc + (p.price * p.quantity), 0),
      totalCostValue: products.reduce((acc, p) => acc + (p.costPrice * p.quantity), 0),
      lowStockCount: products.filter(p => p.quantity > 0 && p.quantity <= p.minThreshold).length,
      outOfStockCount: products.filter(p => p.quantity <= 0).length,
    };
  }, [products]);

  // Added fix: Calculate lifetime sales for the dashboard
  const totalSalesAllTime = useMemo(() => {
    return transactions
      .filter(tx => tx.type === 'SALE')
      .reduce((acc, tx) => acc + tx.total, 0);
  }, [transactions]);

  // Added fix: Calculate today's sales for the dashboard
  const todaySales = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return transactions
      .filter(tx => tx.type === 'SALE' && new Date(tx.timestamp) >= today)
      .reduce((acc, tx) => acc + tx.total, 0);
  }, [transactions]);

  // Revenue Calculations with Filtering
  const filteredTransactions = useMemo(() => {
    if (revenueFilter === 'All') return transactions;
    const now = new Date();
    const cutoff = new Date();
    if (revenueFilter === 'Today') cutoff.setHours(0, 0, 0, 0);
    else if (revenueFilter === '7D') cutoff.setDate(now.getDate() - 7);
    else if (revenueFilter === '30D') cutoff.setDate(now.getDate() - 30);
    return transactions.filter(tx => new Date(tx.timestamp) >= cutoff);
  }, [transactions, revenueFilter]);

  const financialSummary = useMemo(() => {
    let rev = 0;
    let cost = 0;
    filteredTransactions.filter(tx => tx.type === 'SALE').forEach(tx => {
      rev += tx.total;
      cost += tx.totalCost || 0;
    });
    const profit = rev - cost;
    const margin = rev > 0 ? (profit / rev) * 100 : 0;
    return { rev, cost, profit, margin };
  }, [filteredTransactions]);

  // Search Logic
  const fuse = useMemo(() => new Fuse(products, { 
    keys: ['name', 'sku', 'tags'], 
    threshold: 0.3 
  }), [products]);
  
  const filteredProducts = useMemo(() => {
    if (!searchTerm) return products;
    return fuse.search(searchTerm).map(r => r.item);
  }, [products, searchTerm, fuse]);

  const generateSku = (name: string, seq: number) => {
    const cleanName = name.replace(/[^a-zA-Z]/g, '');
    const first = cleanName.charAt(0).toUpperCase() || 'P';
    const last = cleanName.charAt(cleanName.length - 1).toUpperCase() || 'X';
    const num = seq.toString().padStart(3, '0');
    return `${first}${last}${num}`;
  };

  const addToCart = (product: Product) => {
    if (product.quantity <= 0) return;
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        if (existing.cartQuantity >= product.quantity) return prev;
        return prev.map(item => item.id === product.id ? { ...item, cartQuantity: item.cartQuantity + 1 } : item);
      }
      return [...prev, { ...product, cartQuantity: 1 }];
    });
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const updateCartQty = (id: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        const newQty = Math.max(1, item.cartQuantity + delta);
        if (newQty > item.quantity) return item;
        return { ...item, cartQuantity: newQty };
      }
      return item;
    }));
  };

  const cartTotal = useMemo(() => cart.reduce((acc, item) => acc + (item.price * item.cartQuantity), 0), [cart]);
  const cartTotalCost = useMemo(() => cart.reduce((acc, item) => acc + (item.costPrice * item.cartQuantity), 0), [cart]);

  const completeCheckout = () => {
    if (cart.length === 0) return;
    const now = new Date().toISOString();
    
    const transactionItems: TransactionItem[] = cart.map(item => ({
      productId: item.id,
      name: item.name,
      sku: item.sku,
      quantity: item.cartQuantity,
      price: item.price,
      costPriceAtSale: item.costPrice
    }));

    const newTransaction: Transaction = {
      id: Math.random().toString(36).substr(2, 9).toUpperCase(),
      items: transactionItems,
      total: cartTotal,
      totalCost: cartTotalCost,
      type: 'SALE',
      timestamp: now
    };

    setProducts(prev => prev.map(p => {
      const soldItem = cart.find(item => item.id === p.id);
      return soldItem ? { ...p, quantity: p.quantity - soldItem.cartQuantity, lastUpdated: now } : p;
    }));

    setTransactions(prev => [newTransaction, ...prev]);
    setReceiptToShow(newTransaction);
    setCart([]);
    setSearchTerm('');
    setIsBasketOpen(false);
  };

  const handleAdminLogin = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (passcodeInput === "admin2024") {
      setRole('Admin');
      setIsLoginOverlayOpen(false);
      setPasscodeInput('');
      setLoginError(false);
      setActiveTab('Dashboard');
    } else {
      setLoginError(true);
      setTimeout(() => setLoginError(false), 2000);
    }
  };

  const handleRoleToggle = () => {
    if (role === 'Admin') {
      setRole('Seller');
      setActiveTab('Dashboard');
    } else {
      setIsLoginOverlayOpen(true);
    }
  };

  const handleSaveProduct = (productData: Omit<Product, 'id' | 'lastUpdated' | 'sku'>) => {
    const now = new Date().toISOString();
    if (editingProduct) {
      setProducts(prev => prev.map(p => p.id === editingProduct.id ? { ...p, ...productData, lastUpdated: now } : p));
    } else {
      const newSku = generateSku(productData.name, skuCounter);
      setProducts(prev => [...prev, { ...productData, id: Math.random().toString(36).substr(2, 9), sku: newSku, lastUpdated: now }]);
      setSkuCounter(prev => prev + 1);
    }
    setIsModalOpen(false);
    setEditingProduct(null);
  };

  const deleteProduct = (id: string) => {
    if (window.confirm("Delete this product?")) {
      setProducts(prev => prev.filter(p => p.id !== id));
      setCart(prev => prev.filter(item => item.id !== id));
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden font-['Plus_Jakarta_Sans']">
      
      {/* Receipt Modal */}
      {receiptToShow && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-lg animate-in fade-in duration-300 print:bg-white print:p-0">
          <div className="w-full max-w-sm bg-white rounded-[3rem] p-8 shadow-2xl flex flex-col items-center text-center relative animate-in zoom-in-95 duration-300 print:shadow-none print:p-4 print:rounded-none">
            <button onClick={() => setReceiptToShow(null)} className="absolute top-6 right-6 text-slate-300 hover:text-slate-600 print:hidden">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-6 print:hidden">
               <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
            </div>
            <h2 className="text-2xl font-black mb-1">SUPERMART</h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-8">Official Receipt</p>
            
            <div className="w-full space-y-3 mb-8 text-left border-y border-slate-100 py-6">
                <div className="flex justify-between text-[11px] font-bold text-slate-500">
                    <span>Date:</span>
                    <span>{new Date(receiptToShow.timestamp).toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-[11px] font-bold text-slate-500">
                    <span>Txn ID:</span>
                    <span>#{receiptToShow.id}</span>
                </div>
                <div className="pt-4 space-y-3">
                    {receiptToShow.items.map((item, idx) => (
                        <div key={idx} className="flex justify-between items-start text-xs">
                            <div className="flex-1 pr-4">
                                <p className="font-black text-slate-800">{item.name}</p>
                                <p className="text-[10px] text-slate-400">Qty: {item.quantity} × ₦{item.price.toLocaleString()}</p>
                            </div>
                            <span className="font-bold text-slate-900 shrink-0">₦{(item.price * item.quantity).toLocaleString()}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="w-full flex justify-between items-end mb-8">
                <span className="text-xs font-black uppercase text-slate-400">Total Paid</span>
                <span className="text-3xl font-black text-blue-600 tracking-tighter">₦{receiptToShow.total.toLocaleString()}</span>
            </div>

            <div className="w-full space-y-4 print:hidden">
                <button onClick={() => window.print()} className="w-full py-5 bg-slate-900 text-white rounded-3xl font-black text-sm uppercase tracking-widest hover:bg-blue-600 transition-all flex items-center justify-center gap-2">
                   <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>
                   Print Receipt
                </button>
                <button onClick={() => setReceiptToShow(null)} className="w-full py-4 text-[11px] font-black text-slate-400 uppercase tracking-widest hover:text-slate-900 transition-all">Close</button>
            </div>
            
            <p className="mt-8 text-[10px] font-bold text-slate-300 uppercase tracking-[0.3em]">Thank you for shopping!</p>
          </div>
        </div>
      )}

      {/* Admin Login Modal */}
      {isLoginOverlayOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="w-full max-w-sm p-10 bg-white rounded-[3rem] shadow-2xl relative animate-in zoom-in-95 duration-300">
            <button onClick={() => setIsLoginOverlayOpen(false)} className="absolute top-8 right-8 text-slate-400 hover:text-slate-600">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
            <div className="mb-10 text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 mb-6 bg-blue-100 text-blue-600 rounded-3xl">
                <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </div>
              <h3 className="text-3xl font-black text-slate-900">Admin Mode</h3>
              <p className="mt-2 text-xs font-bold tracking-widest text-slate-500 uppercase">Enter Secure Passcode</p>
            </div>
            <form onSubmit={handleAdminLogin} className="space-y-6">
              <input 
                type="password"
                placeholder="••••••••"
                className={`w-full px-8 py-5 text-3xl font-black text-center tracking-[0.4em] bg-slate-50 border-2 rounded-3xl outline-none transition-all ${loginError ? 'border-rose-500 bg-rose-50 text-rose-600 shake' : 'border-slate-100 focus:border-blue-600 focus:bg-white'}`}
                value={passcodeInput}
                onChange={e => setPasscodeInput(e.target.value)}
                autoFocus
              />
              <button type="submit" className="w-full py-5 text-sm font-black text-white uppercase transition-all bg-blue-600 shadow-xl rounded-3xl tracking-widest hover:bg-blue-700 active:scale-95 shadow-blue-600/30">
                Unlock System
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Responsive Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-72 bg-slate-950 text-white flex flex-col transform transition-transform duration-300 lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-8 flex items-center gap-4 border-b border-white/5 shrink-0">
          <div className="p-3 bg-blue-600 rounded-2xl shadow-lg shadow-blue-600/40">
            <ICONS.Inventory />
          </div>
          <div>
            <h1 className="text-xl font-black italic tracking-tighter leading-tight">SUPERMART</h1>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Enterprise v6.1</p>
          </div>
        </div>

        <nav className="flex-1 p-6 space-y-2 overflow-y-auto custom-scrollbar">
          {[
            { id: 'Dashboard', icon: <ICONS.Dashboard />, label: 'Analytics', adminOnly: false },
            { id: 'Inventory', icon: <ICONS.Inventory />, label: 'Stock Manager', adminOnly: false },
            { id: 'Register', icon: <ICONS.Register />, label: 'Checkout', adminOnly: false },
            { id: 'Transactions', icon: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 21h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2z"/><path d="M10 7h4"/><path d="M10 11h4"/><path d="M10 15h4"/></svg>, label: 'Sales History', adminOnly: false },
            { id: 'Revenue', icon: <ICONS.Revenue />, label: 'Revenue & Finance', adminOnly: true }
          ].map(item => (
            (item.adminOnly ? role === 'Admin' : true) && (
              <button
                key={item.id}
                onClick={() => { setActiveTab(item.id as any); setIsSidebarOpen(false); }}
                className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all font-bold text-sm relative ${
                  activeTab === item.id 
                  ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/20' 
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
                }`}
              >
                {/* Fixed fix: Removed parenthesis from item.icon because it is a React element, not a callable function */}
                <span className="w-5 h-5">{item.icon}</span>
                {item.label}
              </button>
            )
          ))}
        </nav>

        <div className="p-6 shrink-0">
          <div className="p-5 bg-white/5 border border-white/5 rounded-3xl backdrop-blur-md">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Role</span>
              <span className={`text-[10px] px-2.5 py-1 rounded-lg font-black ${role === 'Admin' ? 'bg-amber-500/20 text-amber-500' : 'bg-emerald-500/20 text-emerald-500'}`}>{role}</span>
            </div>
            <button onClick={handleRoleToggle} className="w-full py-3 bg-white/10 text-[11px] font-black uppercase tracking-widest rounded-2xl hover:bg-white/20 transition-all">
              {role === 'Admin' ? 'Logout Admin' : 'Admin Login'}
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm lg:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-hidden relative">
        <header className="h-20 bg-white/70 backdrop-blur-xl border-b border-slate-200 px-6 md:px-10 flex items-center justify-between sticky top-0 z-30 shrink-0">
          <div className="flex items-center gap-4 min-w-0">
            <button onClick={() => setIsSidebarOpen(true)} className="p-2.5 bg-slate-100 rounded-xl text-slate-600 lg:hidden active:scale-95 transition-all shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
            </button>
            <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight truncate">
              {activeTab === 'Register' ? 'Point of Sale' : activeTab === 'Revenue' ? 'Financial Intelligence' : activeTab}
            </h2>
          </div>
          
          <div className="flex items-center gap-4 shrink-0">
            {activeTab === 'Register' && cart.length > 0 && (
              <button 
                onClick={() => setIsBasketOpen(true)}
                className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl text-xs font-black shadow-lg shadow-slate-900/20 hover:bg-blue-600 transition-all active:scale-95"
              >
                <ICONS.Register />
                <span>VIEW BASKET</span>
                <span className="bg-blue-600 text-white w-5 h-5 flex items-center justify-center rounded-full text-[10px]">{cart.length}</span>
              </button>
            )}

            {activeTab !== 'Register' && activeTab !== 'Transactions' && activeTab !== 'Revenue' && (
              <div className="relative group hidden sm:block">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-all"><ICONS.Search /></span>
                <input 
                  type="text" 
                  placeholder="Search catalog..." 
                  className="pl-12 pr-6 py-3 bg-slate-100/50 border border-slate-200 rounded-2xl text-sm font-bold focus:bg-white focus:border-blue-600 focus:ring-4 focus:ring-blue-600/10 outline-none w-48 md:w-80 transition-all"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
            )}
            
            {role === 'Admin' && activeTab === 'Inventory' && (
              <button onClick={() => { setEditingProduct(null); setIsModalOpen(true); }} className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-2xl text-xs font-black shadow-lg shadow-blue-600/30 hover:bg-blue-700 transition-all active:scale-95">
                <ICONS.Plus /> <span className="hidden md:inline">ADD PRODUCT</span>
              </button>
            )}
          </div>
        </header>

        {/* Order Basket Overlay */}
        {isBasketOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 md:p-10 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300">
            <div className="w-full max-w-4xl h-full max-h-[850px] bg-white rounded-[3.5rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
              <div className="p-8 md:p-10 border-b border-slate-100 flex items-center justify-between shrink-0">
                 <div className="flex items-center gap-4">
                    <button onClick={() => setIsBasketOpen(false)} className="p-3 bg-slate-100 rounded-2xl text-slate-500 hover:bg-slate-200 transition-colors">
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                    </button>
                    <h3 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tighter uppercase">Current Basket</h3>
                 </div>
                 <span className="w-12 h-12 flex items-center justify-center bg-blue-600 text-white rounded-2xl text-md font-black shadow-lg shadow-blue-600/30">{cart.length}</span>
              </div>

              <div className="flex-1 p-8 md:p-10 overflow-y-auto custom-scrollbar space-y-6">
                {cart.map(item => (
                  <div key={item.id} className="p-6 md:p-8 bg-slate-50 border border-slate-200 rounded-[2.5rem] flex flex-wrap items-center gap-6 hover:shadow-xl transition-all">
                    <div className="flex-1 min-w-[200px]">
                        <p className="text-lg font-black text-slate-900 truncate break-words">{item.name}</p>
                        <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-widest">SKU: {item.sku}</p>
                    </div>
                    <div className="flex items-center gap-3 p-2 bg-white border border-slate-200 rounded-2xl shadow-sm">
                        <button onClick={() => updateCartQty(item.id, -1)} className="w-10 h-10 flex items-center justify-center bg-slate-50 hover:bg-slate-100 rounded-xl text-lg font-black transition-all">-</button>
                        <span className="w-10 text-center text-md font-black">{item.cartQuantity}</span>
                        <button onClick={() => updateCartQty(item.id, 1)} className="w-10 h-10 flex items-center justify-center bg-slate-50 hover:bg-slate-100 rounded-xl text-lg font-black transition-all">+</button>
                    </div>
                    <div className="text-right min-w-[120px]">
                        <p className="text-xl font-black text-slate-900 tracking-tighter">₦{(item.price * item.cartQuantity).toLocaleString()}</p>
                        <p className="text-[10px] font-bold text-slate-400 mt-1">Unit: ₦{item.price.toLocaleString()}</p>
                    </div>
                    <button onClick={() => removeFromCart(item.id)} className="p-4 text-slate-300 hover:text-rose-500 transition-colors">
                        <ICONS.Trash />
                    </button>
                  </div>
                ))}
              </div>

              <div className="p-10 bg-slate-50 border-t border-slate-100 shrink-0">
                 <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div>
                        <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] mb-3">Total Payable</p>
                        <p className="text-5xl md:text-6xl font-black text-blue-600 tracking-tighter leading-none">₦{cartTotal.toLocaleString()}</p>
                    </div>
                    <div className="flex gap-4">
                        <button 
                            onClick={() => setIsBasketOpen(false)}
                            className="px-8 py-5 text-sm font-black text-slate-500 uppercase tracking-widest rounded-[2rem] hover:bg-white transition-all"
                        >
                            Back
                        </button>
                        <button 
                            onClick={completeCheckout}
                            className="px-12 py-5 text-sm font-black text-white uppercase tracking-[0.2em] bg-slate-900 shadow-2xl rounded-[2rem] hover:bg-blue-600 transition-all active:scale-95 shadow-slate-900/20"
                        >
                            Finalize & Pay
                        </button>
                    </div>
                 </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {activeTab === 'Dashboard' && (
            <div className="p-6 md:p-10 space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-[1600px] mx-auto w-full">
              {/* Stats Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
                {role === 'Admin' ? (
                  <>
                    <StatCard title="Total Sales Lifetime" value={`₦${totalSalesAllTime.toLocaleString()}`} icon={<ICONS.Register />} color="emerald" />
                    <StatCard title="Inventory Value" value={`₦${stats.totalValue.toLocaleString()}`} icon={<ICONS.Inventory />} color="blue" />
                  </>
                ) : (
                  <>
                    <StatCard title="Today's Total Sales" value={`₦${todaySales.toLocaleString()}`} icon={<ICONS.Register />} color="blue" />
                    <StatCard title="Items Available" value={stats.totalItems} icon={<ICONS.Dashboard />} color="slate" />
                  </>
                )}
                <StatCard title="Low Stock Alerts" value={stats.lowStockCount} icon={<ICONS.Alert />} color="amber" alert={stats.lowStockCount > 0} />
                <StatCard title="Total SKU Count" value={stats.totalItems} icon={<ICONS.Dashboard />} color="rose" />
              </div>

              <div className="flex flex-col xl:flex-row gap-10">
                <div className="flex-1 bg-white rounded-[3rem] p-8 md:p-10 border border-slate-200 shadow-sm min-w-0">
                  <div className="flex items-center justify-between mb-10">
                    <h3 className="text-xl font-black text-slate-900 flex items-center gap-3">
                      <span className="p-3 bg-blue-600 text-white rounded-2xl shrink-0"><ICONS.Dashboard /></span>
                      AI Business Strategy
                    </h3>
                  </div>

                  {loadingInsights ? (
                    <div className="py-20 flex flex-col items-center justify-center text-slate-400">
                      <div className="w-12 h-12 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin mb-6"></div>
                      <p className="text-sm font-black tracking-widest uppercase animate-pulse text-center">Consulting AI Intelligence...</p>
                    </div>
                  ) : (
                    <div className="space-y-10 overflow-hidden">
                      <div className="p-8 bg-slate-50 border border-slate-100 rounded-[2.5rem]">
                        <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest block mb-4">MANAGER SUMMARY</span>
                        <p className="text-md md:text-lg font-bold text-slate-800 leading-relaxed italic break-words">"{insights.insight}"</p>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {insights.recommendations.map((rec, i) => (
                          <div key={i} className="flex items-start gap-5 p-6 bg-white border border-slate-100 rounded-3xl hover:border-blue-500 hover:shadow-xl transition-all group overflow-hidden">
                            <div className="w-10 h-10 flex items-center justify-center bg-blue-600 text-white rounded-2xl text-xs font-black shrink-0">{i + 1}</div>
                            <p className="text-sm font-bold text-slate-600 leading-snug break-words">{rec}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="w-full xl:w-96 bg-white rounded-[3rem] p-8 border border-slate-200 shadow-sm flex flex-col shrink-0">
                  <h3 className="text-xl font-black text-slate-900 mb-8">Latest Orders</h3>
                  <div className="flex-1 space-y-4 overflow-y-auto custom-scrollbar max-h-[600px] pr-2">
                    {transactions.length === 0 ? (
                      <div className="py-20 text-center opacity-30">
                        <p className="text-xs font-black uppercase tracking-widest text-slate-500">No Sales Record</p>
                      </div>
                    ) : (
                      transactions.slice(0, 10).map(tx => (
                        <div key={tx.id} className="p-5 bg-slate-50 border border-slate-100 rounded-[2rem] flex items-center justify-between hover:bg-white hover:border-blue-100 transition-all">
                          <div className="min-w-0">
                            <p className="text-sm font-black text-slate-900 truncate">Order #{tx.id}</p>
                            <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase">{tx.items.length} items • {new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                          </div>
                          <div className="text-right ml-3">
                            <p className="text-sm font-black text-blue-600">₦{tx.total.toLocaleString()}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <button onClick={() => setActiveTab('Transactions')} className="mt-8 py-4 bg-slate-950 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-600 transition-all">View All Sales</button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Inventory' && (
            <div className="p-6 md:p-10 animate-in fade-in zoom-in-95 duration-500 max-w-[1600px] mx-auto w-full">
              <div className="bg-white rounded-[3rem] border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left min-w-[900px]">
                    <thead className="bg-slate-50/50 border-b border-slate-100">
                      <tr className="text-slate-400 text-[10px] font-black uppercase tracking-widest">
                        <th className="px-10 py-8">Product Name</th>
                        <th className="px-10 py-8">SKU Code</th>
                        <th className="px-10 py-8">Cost Price</th>
                        <th className="px-10 py-8">Selling Price</th>
                        <th className="px-10 py-8">Quantity</th>
                        <th className="px-10 py-8 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredProducts.map(p => (
                        <tr key={p.id} className="group hover:bg-blue-50/20 transition-all duration-300">
                          <td className="px-10 py-8">
                            <div className="font-black text-slate-900 text-md truncate break-words max-w-[300px]">{p.name}</div>
                          </td>
                          <td className="px-10 py-8">
                            <span className="px-4 py-1.5 bg-slate-100 text-slate-600 rounded-full text-[10px] font-black uppercase tracking-widest font-mono">{p.sku}</span>
                          </td>
                          <td className="px-10 py-8 font-black text-slate-400 text-sm">₦{p.costPrice.toLocaleString()}</td>
                          <td className="px-10 py-8 font-black text-slate-900 text-sm">₦{p.price.toLocaleString()}</td>
                          <td className="px-10 py-8">
                            <div className={`inline-flex items-center gap-2.5 px-4 py-2 rounded-2xl text-[11px] font-black ${
                              p.quantity <= 0 ? 'bg-rose-100 text-rose-600' : 
                              p.quantity <= p.minThreshold ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'
                            }`}>
                              <span className={`w-2.5 h-2.5 rounded-full ${p.quantity <= 0 ? 'bg-rose-500' : p.quantity <= p.minThreshold ? 'bg-amber-500' : 'bg-emerald-500'}`}></span>
                              {p.quantity} Units
                            </div>
                          </td>
                          <td className="px-10 py-8 text-right">
                            <div className="flex items-center justify-end gap-3">
                              {role === 'Admin' ? (
                                <>
                                  <button onClick={() => {setEditingProduct(p); setIsModalOpen(true);}} className="p-3 bg-slate-100 text-slate-600 rounded-2xl hover:bg-blue-600 hover:text-white transition-all">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                                  </button>
                                  <button onClick={() => deleteProduct(p.id)} className="p-3 bg-slate-100 text-slate-600 rounded-2xl hover:bg-rose-600 hover:text-white transition-all">
                                    <ICONS.Trash />
                                  </button>
                                </>
                              ) : (
                                <span className="text-[10px] font-black text-slate-300 uppercase italic">Protected</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Register' && (
            <div className="h-full flex flex-col bg-slate-100/40 animate-in fade-in slide-in-from-right-4 duration-500 overflow-hidden max-w-[1600px] mx-auto w-full">
               <div className="p-6 md:p-10 bg-white border-b border-slate-100 shadow-sm flex flex-col md:flex-row gap-6 shrink-0">
                  <div className="flex-1 relative group">
                    <span className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors"><ICONS.Search /></span>
                    <input 
                      type="text" 
                      placeholder="Checkout items..." 
                      className="w-full pl-16 pr-8 py-5 text-md font-bold bg-slate-50 border-2 border-transparent rounded-[2.5rem] focus:bg-white focus:border-blue-600 outline-none transition-all shadow-inner"
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      autoFocus
                    />
                  </div>
               </div>
               
               <div className="flex-1 p-6 md:p-10 overflow-y-auto custom-scrollbar grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-8 auto-rows-max">
                  {filteredProducts.map(p => (
                    <button 
                      key={p.id}
                      disabled={p.quantity <= 0}
                      onClick={() => addToCart(p)}
                      className={`p-8 bg-white border-2 border-transparent rounded-[3.5rem] text-left hover:border-blue-600 hover:shadow-2xl transition-all group relative active:scale-[0.98] ${p.quantity <= 0 ? 'opacity-40 grayscale cursor-not-allowed' : 'shadow-sm'}`}
                    >
                      <div className="flex justify-between items-start mb-6">
                         <div className="text-2xl font-black text-slate-900">₦{p.price.toLocaleString()}</div>
                         <div className="px-3 py-1 bg-slate-100 rounded-lg text-[9px] font-black uppercase tracking-widest text-slate-500">{p.sku}</div>
                      </div>
                      <h4 className="text-lg font-black text-slate-800 mb-2 leading-tight line-clamp-2 min-h-[3rem] break-words">{p.name}</h4>
                      
                      <div className="mt-8 flex items-center justify-between overflow-visible">
                         <div className={`px-2.5 py-1.5 rounded-xl text-[10px] font-black ${p.quantity <= p.minThreshold ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>
                            {p.quantity} Units
                         </div>
                         <div className="p-3 bg-blue-600 text-white rounded-2xl opacity-0 group-hover:opacity-100 lg:group-hover:translate-y-0 translate-y-4 transition-all shadow-lg shadow-blue-600/40 shrink-0">
                            <ICONS.Plus />
                         </div>
                      </div>
                      {p.quantity <= 0 && <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/60 font-black text-rose-600 uppercase text-xs tracking-widest rounded-[3.5rem]">OUT OF STOCK</div>}
                    </button>
                  ))}
               </div>
            </div>
          )}

          {activeTab === 'Transactions' && (
            <div className="p-6 md:p-10 animate-in fade-in slide-in-from-right-4 duration-500 max-w-[1600px] mx-auto w-full">
               <div className="bg-white rounded-[3rem] border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left min-w-[900px]">
                    <thead className="bg-slate-50/50 border-b border-slate-100">
                      <tr className="text-slate-400 text-[10px] font-black uppercase tracking-widest">
                        <th className="px-10 py-8">Timestamp</th>
                        <th className="px-10 py-8">Transaction ID</th>
                        <th className="px-10 py-8">Items</th>
                        <th className="px-10 py-8">Total Sale</th>
                        <th className="px-10 py-8 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {transactions.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-20 text-center text-slate-300 font-bold italic uppercase tracking-widest">No Sales Found</td>
                        </tr>
                      ) : (
                        transactions.map(tx => (
                          <tr key={tx.id} className="group hover:bg-blue-50/20 transition-all">
                            <td className="px-10 py-8 text-sm font-bold text-slate-600 whitespace-nowrap">
                              {new Date(tx.timestamp).toLocaleString()}
                            </td>
                            <td className="px-10 py-8">
                              <span className="px-4 py-1.5 bg-slate-900 text-white rounded-full text-[10px] font-black uppercase tracking-widest">#{tx.id}</span>
                            </td>
                            <td className="px-10 py-8">
                                <div className="text-xs font-bold text-slate-700 max-w-[300px] break-words">
                                  {tx.items.map(i => `${i.name} (x${i.quantity})`).join(', ')}
                                </div>
                            </td>
                            <td className="px-10 py-8">
                                <span className="text-lg font-black text-emerald-600">₦{tx.total.toLocaleString()}</span>
                            </td>
                            <td className="px-10 py-8 text-right">
                                <button onClick={() => setReceiptToShow(tx)} className="p-3 bg-slate-100 text-slate-500 rounded-2xl hover:bg-blue-600 hover:text-white transition-all">
                                   <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>
                                </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Revenue' && role === 'Admin' && (
            <div className="p-6 md:p-10 animate-in fade-in slide-in-from-right-4 duration-500 max-w-[1600px] mx-auto w-full space-y-10">
               {/* Financial Summary Bars */}
               <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                  <StatCard title="Selected Revenue" value={`₦${financialSummary.rev.toLocaleString()}`} icon={<ICONS.Revenue />} color="emerald" />
                  <StatCard title="Selected Cost" value={`₦${financialSummary.cost.toLocaleString()}`} icon={<ICONS.Inventory />} color="amber" />
                  <StatCard title="Net Profit" value={`₦${financialSummary.profit.toLocaleString()}`} icon={<ICONS.Dashboard />} color="blue" />
                  <StatCard title="Gross Margin" value={`${financialSummary.margin.toFixed(1)}%`} icon={<ICONS.Register />} color="slate" />
               </div>

               <div className="bg-white rounded-[3rem] p-8 md:p-10 border border-slate-200 shadow-sm space-y-10">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                     <div>
                        <h3 className="text-2xl font-black text-slate-900 tracking-tight">Financial Intelligence</h3>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Supermart Real-time Profits</p>
                     </div>
                     <div className="flex bg-slate-100 p-1.5 rounded-2xl gap-2">
                        {(['All', 'Today', '7D', '30D'] as DateFilter[]).map(f => (
                          <button 
                            key={f}
                            onClick={() => setRevenueFilter(f)}
                            className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${revenueFilter === f ? 'bg-white text-blue-600 shadow-md' : 'text-slate-400 hover:text-slate-900'}`}
                          >
                            {f === '7D' ? 'Last 7 Days' : f === '30D' ? 'Last 30 Days' : f}
                          </button>
                        ))}
                     </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
                      {/* Potential Value */}
                      <div className="p-8 bg-slate-50 border border-slate-100 rounded-[2.5rem] space-y-6">
                          <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest">Inventory Projection</h4>
                          <div className="grid grid-cols-2 gap-4">
                             <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Total Stock Cost</p>
                                <p className="text-xl font-black text-slate-900">₦{stats.totalCostValue.toLocaleString()}</p>
                             </div>
                             <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Potential Revenue</p>
                                <p className="text-xl font-black text-blue-600">₦{stats.totalValue.toLocaleString()}</p>
                             </div>
                          </div>
                          <div className="w-full h-4 bg-slate-200 rounded-full overflow-hidden flex">
                              <div className="h-full bg-amber-500" style={{ width: `${(stats.totalCostValue / (stats.totalValue || 1)) * 100}%` }}></div>
                              <div className="h-full bg-emerald-500" style={{ width: `${(1 - stats.totalCostValue / (stats.totalValue || 1)) * 100}%` }}></div>
                          </div>
                          <p className="text-[10px] font-bold text-slate-400 italic">Visualizing potential cost (Amber) vs markup (Green) for current warehouse stock.</p>
                      </div>

                      {/* Top Margin Products */}
                      <div className="p-8 bg-white border border-slate-100 rounded-[2.5rem] space-y-6">
                         <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest">Top Margin SKUs</h4>
                         <div className="space-y-4">
                            {products.slice().sort((a,b) => ((b.price - b.costPrice)/b.price) - ((a.price - a.costPrice)/a.price)).slice(0, 5).map(p => (
                               <div key={p.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                  <div>
                                     <p className="text-xs font-black text-slate-900">{p.name}</p>
                                     <p className="text-[9px] font-bold text-slate-400 uppercase">Margin: {(((p.price - p.costPrice)/p.price)*100).toFixed(1)}%</p>
                                  </div>
                                  <div className="text-right">
                                     <p className="text-xs font-black text-emerald-600">+₦{(p.price - p.costPrice).toLocaleString()} Profit/Unit</p>
                                  </div>
                               </div>
                            ))}
                         </div>
                      </div>
                  </div>

                  <div className="overflow-x-auto rounded-3xl border border-slate-100">
                      <table className="w-full text-left min-w-[1000px]">
                        <thead className="bg-slate-50 border-b border-slate-100">
                           <tr className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                              <th className="px-8 py-6">Transaction Date</th>
                              <th className="px-8 py-6">Total Items</th>
                              <th className="px-8 py-6">Transaction Revenue</th>
                              <th className="px-8 py-6">Estimated Cost</th>
                              <th className="px-8 py-6">Gross Profit</th>
                              <th className="px-8 py-6">Net Margin</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                           {filteredTransactions.filter(tx => tx.type === 'SALE').map(tx => {
                             const txProfit = tx.total - (tx.totalCost || 0);
                             const txMargin = tx.total > 0 ? (txProfit / tx.total) * 100 : 0;
                             return (
                               <tr key={tx.id} className="hover:bg-slate-50 transition-all">
                                  <td className="px-8 py-6 text-xs font-bold text-slate-600">{new Date(tx.timestamp).toLocaleString()}</td>
                                  <td className="px-8 py-6 text-xs font-black text-slate-900">{tx.items.length}</td>
                                  <td className="px-8 py-6 text-xs font-black text-slate-900">₦{tx.total.toLocaleString()}</td>
                                  <td className="px-8 py-6 text-xs font-bold text-amber-600">₦{(tx.totalCost || 0).toLocaleString()}</td>
                                  <td className="px-8 py-6 text-xs font-black text-emerald-600">₦{txProfit.toLocaleString()}</td>
                                  <td className="px-8 py-6">
                                     <span className={`px-3 py-1 rounded-lg text-[9px] font-black ${txMargin > 30 ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-500'}`}>{txMargin.toFixed(1)}%</span>
                                  </td>
                               </tr>
                             )
                           })}
                        </tbody>
                      </table>
                  </div>
               </div>
            </div>
          )}
        </div>
      </main>

      <ProductModal 
        isOpen={isModalOpen} 
        onClose={() => { setIsModalOpen(false); setEditingProduct(null); }} 
        onSave={handleSaveProduct} 
        initialData={editingProduct} 
      />
    </div>
  );
};

const StatCard = ({ title, value, icon, color, alert }: { title: string, value: any, icon: React.ReactNode, color: string, alert?: boolean }) => {
  const colorStyles = {
    blue: 'text-blue-600 group-hover:text-blue-700',
    emerald: 'text-emerald-600 group-hover:text-emerald-700',
    rose: 'text-rose-600 group-hover:text-rose-700',
    amber: 'text-amber-600 group-hover:text-amber-700',
    slate: 'text-slate-900 group-hover:text-blue-600'
  };

  return (
    <div className={`p-8 bg-white border-2 rounded-[3.5rem] transition-all duration-500 min-w-0 ${alert ? 'border-rose-100 shadow-2xl shadow-rose-600/10' : 'border-slate-100 shadow-sm hover:shadow-2xl group'}`}>
      <div className="flex items-center justify-between mb-8 overflow-hidden">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] truncate pr-2 shrink-0">{title}</span>
        <div className={`p-3.5 rounded-2xl transition-all shrink-0 ${alert ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30' : 'bg-slate-50 text-slate-400 group-hover:bg-blue-600 group-hover:text-white'}`}>
          {icon}
        </div>
      </div>
      <div className={`text-4xl 2xl:text-5xl font-black tracking-tighter truncate break-words transition-colors ${alert ? 'text-rose-600' : colorStyles[color as keyof typeof colorStyles] || 'text-slate-900'}`}>
        {value}
      </div>
      {alert && <p className="mt-5 text-[10px] font-black text-rose-500 uppercase tracking-widest animate-pulse">Action Required</p>}
    </div>
  );
};

export default App;
