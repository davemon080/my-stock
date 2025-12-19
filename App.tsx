
import React, { useState, useMemo, useEffect } from 'react';
import { Product, UserRole, InventoryStats, Transaction, TransactionItem, AppConfig, Seller } from './types.ts';
import { INITIAL_PRODUCTS, ICONS } from './constants.tsx';
import Fuse from 'fuse.js';
import ProductModal from './components/ProductModal.tsx';
import { getInventoryInsights } from './services/geminiService.ts';

interface CartItem extends Product {
  cartQuantity: number;
}

type DateFilter = 'Today' | '7D' | '30D' | 'All';

const App: React.FC = () => {
  // Authentication & Configuration State
  const [currentUser, setCurrentUser] = useState<{ role: UserRole; name: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'Dashboard' | 'Inventory' | 'Register' | 'Transactions' | 'Revenue' | 'Settings'>('Dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isBasketOpen, setIsBasketOpen] = useState(false);
  const [receiptToShow, setReceiptToShow] = useState<Transaction | null>(null);
  const [revenueFilter, setRevenueFilter] = useState<DateFilter>('All');
  
  // App Config Persistence
  const [config, setConfig] = useState<AppConfig>(() => {
    const saved = localStorage.getItem('sm_config_v12');
    return saved ? JSON.parse(saved) : {
      supermarketName: 'SUPERMART PRO',
      logoUrl: '',
      adminPassword: 'admin2024',
      sellers: []
    };
  });

  // Login State
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginRole, setLoginRole] = useState<UserRole>('Seller');
  const [loginError, setLoginError] = useState('');

  // Data Persistence
  const [products, setProducts] = useState<Product[]>(() => {
    const saved = localStorage.getItem('sm_inventory_v12');
    return saved ? JSON.parse(saved) : INITIAL_PRODUCTS;
  });
  
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const saved = localStorage.getItem('sm_transactions_v12');
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
    const saved = localStorage.getItem('sm_sku_counter_v12');
    return saved ? parseInt(saved) : (products.length + 100);
  });

  // Persistence Effects
  useEffect(() => {
    localStorage.setItem('sm_config_v12', JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    localStorage.setItem('sm_inventory_v12', JSON.stringify(products));
    localStorage.setItem('sm_sku_counter_v12', skuCounter.toString());
  }, [products, skuCounter]);

  useEffect(() => {
    localStorage.setItem('sm_transactions_v12', JSON.stringify(transactions));
  }, [transactions]);

  // AI Analysis
  useEffect(() => {
    if (currentUser && products.length > 0 && activeTab === 'Dashboard') {
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
  }, [products, activeTab, currentUser]);

  // Calculations
  const stats = useMemo((): InventoryStats => ({
    totalItems: products.length,
    totalValue: products.reduce((acc, p) => acc + (p.price * p.quantity), 0),
    totalCostValue: products.reduce((acc, p) => acc + (p.costPrice * p.quantity), 0),
    lowStockCount: products.filter(p => p.quantity > 0 && p.quantity <= p.minThreshold).length,
    outOfStockCount: products.filter(p => p.quantity <= 0).length,
  }), [products]);

  const todaySales = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return transactions
      .filter(tx => tx.type === 'SALE' && new Date(tx.timestamp) >= today)
      .reduce((acc, tx) => acc + tx.total, 0);
  }, [transactions]);

  const totalSalesAllTime = useMemo(() => transactions
    .filter(tx => tx.type === 'SALE')
    .reduce((acc, tx) => acc + tx.total, 0), [transactions]);

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
    let rev = 0; let cost = 0;
    filteredTransactions.filter(tx => tx.type === 'SALE').forEach(tx => {
      rev += tx.total; cost += tx.totalCost || 0;
    });
    return { rev, cost, profit: rev - cost, margin: rev > 0 ? ((rev - cost) / rev) * 100 : 0 };
  }, [filteredTransactions]);

  const cartTotal = useMemo(() => cart.reduce((acc, item) => acc + (item.price * item.cartQuantity), 0), [cart]);

  const fuse = useMemo(() => new Fuse(products, { keys: ['name', 'sku', 'tags'], threshold: 0.3 }), [products]);
  const filteredProducts = useMemo(() => searchTerm ? fuse.search(searchTerm).map(r => r.item) : products, [products, searchTerm, fuse]);

  // Handlers
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    if (loginRole === 'Admin') {
      if (loginPassword === config.adminPassword) {
        setCurrentUser({ role: 'Admin', name: 'Store Owner' });
      } else {
        setLoginError('Invalid admin password');
      }
    } else {
      const seller = config.sellers.find(s => s.email === loginEmail && s.password === loginPassword);
      if (seller) {
        setCurrentUser({ role: 'Seller', name: seller.name });
      } else {
        setLoginError('Invalid seller credentials');
      }
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setConfig(prev => ({ ...prev, logoUrl: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const generateSku = (name: string, seq: number) => {
    const clean = name.replace(/[^a-zA-Z]/g, '');
    const first = clean.charAt(0).toUpperCase() || 'P';
    const last = clean.charAt(clean.length - 1).toUpperCase() || 'X';
    return `${first}${last}${seq.toString().padStart(3, '0')}`;
  };

  const handleSaveProduct = (data: Omit<Product, 'id' | 'lastUpdated' | 'sku'>) => {
    const now = new Date().toISOString();
    if (editingProduct) {
      setProducts(prev => prev.map(p => p.id === editingProduct.id ? { ...p, ...data, lastUpdated: now } : p));
    } else {
      setProducts(prev => [...prev, { ...data, id: Math.random().toString(36).substr(2, 9), sku: generateSku(data.name, skuCounter), lastUpdated: now }]);
      setSkuCounter(prev => prev + 1);
    }
    setIsModalOpen(false); setEditingProduct(null);
  };

  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => item.id === product.id ? { ...item, cartQuantity: item.cartQuantity + 1 } : item);
      }
      return [...prev, { ...product, cartQuantity: 1 }];
    });
  };

  const updateCartQty = (id: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, cartQuantity: Math.max(1, item.cartQuantity + delta) };
      }
      return item;
    }));
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const deleteProduct = (id: string) => {
    if (window.confirm('Are you sure you want to delete this product?')) {
      setProducts(prev => prev.filter(p => p.id !== id));
      setCart(prev => prev.filter(item => item.id !== id));
    }
  };

  const completeCheckout = () => {
    if (cart.length === 0) return;
    const totalCost = cart.reduce((acc, item) => acc + (item.costPrice * item.cartQuantity), 0);
    const transaction: Transaction = {
      id: Math.random().toString(36).substr(2, 6).toUpperCase(),
      items: cart.map(item => ({
        productId: item.id,
        name: item.name,
        sku: item.sku,
        quantity: item.cartQuantity,
        price: item.price,
        costPriceAtSale: item.costPrice
      })),
      total: cartTotal,
      totalCost,
      type: 'SALE',
      timestamp: new Date().toISOString()
    };
    
    setProducts(prev => prev.map(p => {
      const ci = cart.find(c => c.id === p.id);
      return ci ? { ...p, quantity: Math.max(0, p.quantity - ci.cartQuantity) } : p;
    }));

    setTransactions(prev => [transaction, ...prev]);
    setCart([]);
    setIsBasketOpen(false);
    setReceiptToShow(transaction);
  };

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 sm:p-6 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-600 rounded-full blur-[150px]"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-emerald-600 rounded-full blur-[150px]"></div>
        </div>
        
        <div className="w-full max-w-md bg-white rounded-[2rem] sm:rounded-[3rem] p-6 sm:p-10 shadow-2xl relative z-10 animate-in fade-in zoom-in-95 duration-500">
          <div className="text-center mb-6 sm:mb-10">
            {config.logoUrl ? (
              <img src={config.logoUrl} alt="Logo" className="w-16 h-16 sm:w-20 sm:h-20 mx-auto mb-4 sm:mb-6 rounded-2xl object-cover shadow-lg" />
            ) : (
              <div className="w-16 h-16 sm:w-20 sm:h-20 bg-blue-600 rounded-[1.5rem] sm:rounded-[2rem] flex items-center justify-center mx-auto mb-4 sm:mb-6 shadow-xl shadow-blue-600/30">
                <ICONS.Inventory />
              </div>
            )}
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight leading-tight uppercase">{config.supermarketName}</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Enterprise POS & Inventory</p>
          </div>

          <div className="flex bg-slate-100 p-1 rounded-xl sm:p-1.5 sm:rounded-2xl mb-6 sm:mb-8">
            {(['Seller', 'Admin'] as UserRole[]).map(r => (
              <button key={r} onClick={() => { setLoginRole(r); setLoginError(''); }} className={`flex-1 py-2.5 sm:py-3 text-[10px] font-black uppercase tracking-widest rounded-lg sm:rounded-xl transition-all ${loginRole === r ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                {r}
              </button>
            ))}
          </div>

          <form onSubmit={handleLogin} className="space-y-4 sm:space-y-6">
            {loginRole === 'Seller' && (
              <div className="space-y-1 sm:space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Email Address</label>
                <input type="email" required className="w-full px-5 py-3.5 sm:px-6 sm:py-4 bg-slate-50 border-2 border-slate-100 rounded-xl sm:rounded-2xl outline-none font-bold transition-all focus:border-blue-600 focus:bg-white text-sm" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} />
              </div>
            )}
            <div className="space-y-1 sm:space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{loginRole === 'Admin' ? 'Admin Password' : 'Password'}</label>
              <input type="password" required className="w-full px-5 py-3.5 sm:px-6 sm:py-4 bg-slate-50 border-2 border-slate-100 rounded-xl sm:rounded-2xl outline-none font-bold transition-all focus:border-blue-600 focus:bg-white text-sm" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} />
            </div>

            {loginError && <p className="text-rose-500 text-xs font-bold text-center shake">{loginError}</p>}

            <button type="submit" className="w-full py-4 sm:py-5 bg-blue-600 text-white rounded-2xl sm:rounded-3xl font-black text-xs sm:text-sm uppercase tracking-widest shadow-xl shadow-blue-600/30 hover:bg-blue-700 active:scale-95 transition-all mt-4">
              Login to System
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden font-['Plus_Jakarta_Sans']">
      {/* Sidebar - Mobile drawer logic */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-72 bg-slate-950 text-white flex flex-col transform transition-transform duration-300 lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-6 sm:p-8 flex items-center gap-4 border-b border-white/5 shrink-0">
          {config.logoUrl ? (
            <img src={config.logoUrl} className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl object-cover" />
          ) : (
            <div className="p-2 sm:p-3 bg-blue-600 rounded-xl sm:rounded-2xl"><ICONS.Inventory /></div>
          )}
          <div className="min-w-0">
            <h1 className="text-base sm:text-lg font-black italic tracking-tighter truncate leading-tight uppercase">{config.supermarketName}</h1>
            <p className="text-[8px] sm:text-[9px] font-bold text-slate-500 uppercase tracking-widest">Enterprise v6.2</p>
          </div>
        </div>

        <nav className="flex-1 p-4 sm:p-6 space-y-1 sm:space-y-2 overflow-y-auto custom-scrollbar">
          {[
            { id: 'Dashboard', icon: <ICONS.Dashboard />, label: 'Analytics', adminOnly: false },
            { id: 'Inventory', icon: <ICONS.Inventory />, label: 'Stock Manager', adminOnly: false },
            { id: 'Register', icon: <ICONS.Register />, label: 'Checkout', adminOnly: false },
            { id: 'Transactions', icon: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 21h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2z"/><path d="M10 7h4"/><path d="M10 11h4"/><path d="M10 15h4"/></svg>, label: 'Sales History', adminOnly: false },
            { id: 'Revenue', icon: <ICONS.Revenue />, label: 'Finance', adminOnly: true },
            { id: 'Settings', icon: <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>, label: 'Settings', adminOnly: true }
          ].map(item => (
            (item.adminOnly ? currentUser.role === 'Admin' : true) && (
              <button key={item.id} onClick={() => { setActiveTab(item.id as any); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-3 sm:gap-4 px-4 sm:px-6 py-3 sm:py-4 rounded-xl sm:rounded-2xl transition-all font-bold text-xs sm:text-sm relative ${activeTab === item.id ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                <span className="shrink-0">{item.icon}</span>
                <span className="truncate">{item.label}</span>
              </button>
            )
          ))}
        </nav>

        <div className="p-4 sm:p-6 shrink-0">
          <div className="p-4 sm:p-5 bg-white/5 border border-white/5 rounded-2xl sm:rounded-3xl backdrop-blur-md">
            <div className="mb-3 sm:mb-4">
              <p className="text-[8px] sm:text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Signed in as</p>
              <p className="text-xs sm:text-sm font-black truncate">{currentUser.name}</p>
            </div>
            <button onClick={() => setCurrentUser(null)} className="w-full py-2 sm:py-3 bg-white/10 text-[9px] sm:text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-rose-500 transition-all">
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm lg:hidden" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-hidden relative">
        <header className="h-16 sm:h-20 bg-white/80 backdrop-blur-xl border-b border-slate-200 px-4 sm:px-10 flex items-center justify-between sticky top-0 z-30 shrink-0">
          <div className="flex items-center gap-3 sm:gap-4 min-w-0">
            <button onClick={() => setIsSidebarOpen(true)} className="p-2 sm:p-2.5 bg-slate-100 rounded-lg sm:rounded-xl text-slate-600 lg:hidden active:scale-95 transition-all">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
            </button>
            <h2 className="text-lg sm:text-2xl font-black text-slate-900 tracking-tight truncate uppercase">{activeTab}</h2>
          </div>
          
          <div className="flex items-center gap-2 sm:gap-4 shrink-0">
            {activeTab === 'Register' && cart.length > 0 && (
              <button onClick={() => setIsBasketOpen(true)} className="flex items-center gap-2 px-3 py-2 sm:px-6 sm:py-3 bg-slate-900 text-white rounded-xl sm:rounded-2xl text-[10px] sm:text-xs font-black shadow-lg shadow-slate-900/20 hover:bg-blue-600 transition-all">
                <ICONS.Register />
                <span className="hidden xs:inline">BASKET ({cart.length})</span>
                <span className="xs:hidden">({cart.length})</span>
              </button>
            )}
            {currentUser.role === 'Admin' && activeTab === 'Inventory' && (
              <button onClick={() => { setEditingProduct(null); setIsModalOpen(true); }} className="flex items-center gap-2 px-3 py-2 sm:px-6 sm:py-3 bg-blue-600 text-white rounded-xl sm:rounded-2xl text-[10px] sm:text-xs font-black hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/30">
                <ICONS.Plus /> <span className="hidden sm:inline">ADD PRODUCT</span>
              </button>
            )}
          </div>
        </header>

        {/* Dynamic Page Rendering */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-10">
          {activeTab === 'Dashboard' && (
            <div className="space-y-6 sm:space-y-10 max-w-7xl mx-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                <StatCard title="Today's Sales" value={`₦${todaySales.toLocaleString()}`} icon={<ICONS.Register />} color="emerald" />
                <StatCard title="Stock Value" value={`₦${stats.totalValue.toLocaleString()}`} icon={<ICONS.Inventory />} color="blue" />
                <StatCard title="Low Stock" value={stats.lowStockCount} icon={<ICONS.Alert />} color="amber" alert={stats.lowStockCount > 0} />
                <StatCard title="Total SKUs" value={stats.totalItems} icon={<ICONS.Dashboard />} color="slate" />
              </div>
              
              <div className="bg-white rounded-[2rem] sm:rounded-[3rem] p-6 sm:p-10 border border-slate-200 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8">
                  <h3 className="text-lg sm:text-xl font-black flex items-center gap-3"><span className="p-2.5 sm:p-3 bg-blue-600 text-white rounded-xl sm:rounded-2xl"><ICONS.Dashboard /></span>AI Business Analyst</h3>
                  {loadingInsights && <div className="w-4 h-4 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin"></div>}
                </div>
                <div className="p-5 sm:p-8 bg-slate-50 rounded-[1.5rem] sm:rounded-[2.5rem] mb-6 sm:mb-8 italic text-slate-700 text-sm sm:text-base">"{insights.insight}"</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                  {insights.recommendations.map((r, i) => (
                    <div key={i} className="flex items-start gap-3 sm:gap-4 p-4 sm:p-6 bg-white border border-slate-100 rounded-2xl sm:rounded-3xl hover:border-blue-500 transition-all shadow-sm">
                      <div className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center bg-blue-100 text-blue-600 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-black shrink-0">{i+1}</div>
                      <p className="text-xs sm:text-sm font-bold text-slate-600 leading-relaxed">{r}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Inventory' && (
             <div className="max-w-7xl mx-auto">
                <div className="bg-white rounded-[1.5rem] sm:rounded-[3rem] border border-slate-200 overflow-hidden shadow-sm">
                   <div className="overflow-x-auto custom-scrollbar">
                     <table className="w-full text-left min-w-[600px] sm:min-w-[900px]">
                        <thead className="bg-slate-50 border-b border-slate-100">
                           <tr className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">
                              <th className="px-6 sm:px-10 py-5 sm:py-8">Product Details</th>
                              <th className="px-6 sm:px-10 py-5 sm:py-8">SKU</th>
                              <th className="px-6 sm:px-10 py-5 sm:py-8">Price</th>
                              <th className="px-6 sm:px-10 py-5 sm:py-8">Stock</th>
                              <th className="px-6 sm:px-10 py-5 sm:py-8 text-right">Actions</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                           {filteredProducts.map(p => (
                             <tr key={p.id} className="hover:bg-blue-50/20 transition-all">
                                <td className="px-6 sm:px-10 py-5 sm:py-8">
                                  <span className="font-black text-slate-900 text-sm">{p.name}</span>
                                </td>
                                <td className="px-6 sm:px-10 py-5 sm:py-8 font-mono text-[10px] sm:text-xs text-slate-400">{p.sku}</td>
                                <td className="px-6 sm:px-10 py-5 sm:py-8 font-black text-xs sm:text-sm">₦{p.price.toLocaleString()}</td>
                                <td className="px-6 sm:px-10 py-5 sm:py-8">
                                   <div className={`inline-flex px-2 sm:px-3 py-1 rounded-lg sm:rounded-xl text-[9px] sm:text-[10px] font-black ${p.quantity <= p.minThreshold ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
                                     {p.quantity} Units
                                   </div>
                                </td>
                                <td className="px-6 sm:px-10 py-5 sm:py-8 text-right">
                                   {currentUser.role === 'Admin' ? (
                                     <div className="flex justify-end gap-1 sm:gap-2">
                                       <button onClick={() => { setEditingProduct(p); setIsModalOpen(true); }} className="p-2 sm:p-3 bg-slate-100 text-slate-400 rounded-lg sm:rounded-xl hover:bg-blue-600 hover:text-white transition-all"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg></button>
                                       <button onClick={() => deleteProduct(p.id)} className="p-2 sm:p-3 bg-slate-100 text-slate-400 rounded-lg sm:rounded-xl hover:bg-rose-600 hover:text-white transition-all"><ICONS.Trash /></button>
                                     </div>
                                   ) : <span className="text-[9px] font-black text-slate-300 italic uppercase">Locked</span>}
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
            <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8">
               <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-6">
                 {filteredProducts.map(p => (
                   <button key={p.id} disabled={p.quantity <= 0} onClick={() => addToCart(p)} className="p-4 sm:p-8 bg-white border-2 border-transparent rounded-[2rem] sm:rounded-[3.5rem] text-left hover:border-blue-600 hover:shadow-2xl transition-all group relative active:scale-95 shadow-sm overflow-hidden">
                      <div className="text-lg sm:text-2xl font-black text-slate-900 mb-2 sm:mb-4 leading-none">₦{p.price.toLocaleString()}</div>
                      <h4 className="text-xs sm:text-lg font-black text-slate-800 mb-1 sm:mb-2 leading-tight line-clamp-2 min-h-[1.5rem] sm:min-h-[3rem]">{p.name}</h4>
                      <p className="text-[8px] sm:text-[10px] font-bold text-slate-400 mb-3 sm:mb-6">{p.sku}</p>
                      <div className={`px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-lg sm:rounded-xl text-[8px] sm:text-[10px] font-black w-fit ${p.quantity <= p.minThreshold ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>{p.quantity} In Stock</div>
                      {p.quantity <= 0 && <div className="absolute inset-0 bg-white/60 flex items-center justify-center font-black text-rose-600 uppercase tracking-widest text-[10px] sm:text-xs rounded-[2rem] sm:rounded-[3.5rem]">OUT</div>}
                   </button>
                 ))}
               </div>
            </div>
          )}

          {activeTab === 'Settings' && currentUser.role === 'Admin' && (
             <div className="max-w-4xl mx-auto space-y-6 sm:space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* Store Identity */}
                <div className="bg-white rounded-[1.5rem] sm:rounded-[3rem] p-6 sm:p-10 border border-slate-200 shadow-sm">
                   <h3 className="text-xl sm:text-2xl font-black mb-6 sm:mb-8 flex items-center gap-3 uppercase tracking-tight"><span className="p-2 sm:p-3 bg-blue-100 text-blue-600 rounded-xl sm:rounded-2xl"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg></span>Store Profile</h3>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
                      <div className="space-y-1 sm:space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Supermarket Name</label>
                        <input type="text" className="w-full px-5 py-3.5 sm:px-6 sm:py-4 bg-slate-50 border-2 border-slate-100 rounded-xl sm:rounded-2xl outline-none font-bold focus:border-blue-600 text-sm" value={config.supermarketName} onChange={e => setConfig({ ...config, supermarketName: e.target.value })} />
                      </div>
                      <div className="space-y-1 sm:space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Store Logo</label>
                        <div className="flex flex-col gap-4">
                           {config.logoUrl && (
                             <div className="relative w-20 h-20 group">
                                <img src={config.logoUrl} className="w-full h-full object-cover rounded-xl border-2 border-slate-100" />
                                <button onClick={() => setConfig({...config, logoUrl: ''})} className="absolute -top-2 -right-2 p-1 bg-rose-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
                             </div>
                           )}
                           <div className="relative">
                              <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" id="logo-upload" />
                              <label htmlFor="logo-upload" className="inline-flex items-center gap-2 px-6 py-3.5 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-all text-[10px] font-black uppercase tracking-widest text-slate-500">
                                 <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
                                 Upload Logo Image
                              </label>
                           </div>
                           <p className="text-[8px] font-bold text-slate-400">PNG or JPG recommended. File size &lt; 2MB.</p>
                        </div>
                      </div>
                   </div>
                </div>

                <div className="bg-white rounded-[1.5rem] sm:rounded-[3rem] p-6 sm:p-10 border border-slate-200 shadow-sm">
                   <h3 className="text-xl sm:text-2xl font-black mb-6 sm:mb-8 flex items-center gap-3 uppercase tracking-tight"><span className="p-2 sm:p-3 bg-amber-100 text-amber-600 rounded-xl sm:rounded-2xl"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>Change Admin Password</h3>
                   <div className="space-y-4">
                      <div className="space-y-1 sm:space-y-2">
                         <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">New Admin Password</label>
                         <input type="password" placeholder="Enter New Password" className="w-full px-5 py-3.5 sm:px-6 sm:py-4 bg-slate-50 border-2 border-slate-100 rounded-xl sm:rounded-2xl outline-none font-bold focus:border-blue-600 text-sm" value={config.adminPassword} onChange={e => setConfig({ ...config, adminPassword: e.target.value })} />
                      </div>
                      <p className="text-[9px] font-bold text-slate-400 italic bg-blue-50 p-4 rounded-xl border border-blue-100 flex items-start gap-3">
                         <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-blue-600 shrink-0"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="16" y2="12"/><line x1="12" x2="12.01" y1="8" y2="8"/></svg>
                         Warning: Changing the master password will take effect immediately. Ensure you keep it secure.
                      </p>
                   </div>
                </div>

                <div className="bg-white rounded-[1.5rem] sm:rounded-[3rem] p-6 sm:p-10 border border-slate-200 shadow-sm">
                   <h3 className="text-xl sm:text-2xl font-black mb-6 sm:mb-8 uppercase tracking-tight">Staff Management</h3>
                   <form onSubmit={(e) => {
                      e.preventDefault();
                      const form = e.target as HTMLFormElement;
                      const fd = new FormData(form);
                      const email = fd.get('email') as string;
                      if (config.sellers.find(s => s.email === email)) return alert('Email already exists');
                      const newSeller: Seller = {
                        id: Math.random().toString(36).substr(2, 9),
                        name: fd.get('name') as string,
                        email,
                        password: fd.get('password') as string
                      };
                      setConfig({ ...config, sellers: [...config.sellers, newSeller] });
                      form.reset();
                   }} className="flex flex-col gap-4 mb-8 sm:mb-10">
                      <input name="name" required placeholder="Full Name" className="px-5 py-3.5 sm:px-6 sm:py-4 bg-slate-50 border-2 border-slate-100 rounded-xl sm:rounded-2xl outline-none font-bold focus:border-blue-600 text-sm" />
                      <input name="email" required type="email" placeholder="Email Address" className="px-5 py-3.5 sm:px-6 sm:py-4 bg-slate-50 border-2 border-slate-100 rounded-xl sm:rounded-2xl outline-none font-bold focus:border-blue-600 text-sm" />
                      <input name="password" required type="password" placeholder="Set Password" className="px-5 py-3.5 sm:px-6 sm:py-4 bg-slate-50 border-2 border-slate-100 rounded-xl sm:rounded-2xl outline-none font-bold focus:border-blue-600 text-sm" />
                      <button type="submit" className="py-3.5 sm:py-4 bg-slate-900 text-white rounded-xl sm:rounded-2xl font-black uppercase tracking-widest hover:bg-blue-600 transition-all text-[10px] sm:text-xs">Register Staff</button>
                   </form>

                   <div className="space-y-3 sm:space-y-4">
                      {config.sellers.map(s => (
                        <div key={s.id} className="p-4 sm:p-6 bg-slate-50 border border-slate-100 rounded-xl sm:rounded-3xl flex items-center justify-between">
                           <div className="min-w-0">
                              <p className="font-black text-slate-900 text-sm truncate">{s.name}</p>
                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate">{s.email}</p>
                           </div>
                           <button onClick={() => setConfig({ ...config, sellers: config.sellers.filter(sl => sl.id !== s.id) })} className="p-2 sm:p-3 text-rose-500 hover:bg-rose-50 rounded-lg sm:rounded-xl transition-all shrink-0"><ICONS.Trash /></button>
                        </div>
                      ))}
                      {config.sellers.length === 0 && <p className="text-center py-6 sm:py-10 text-slate-300 italic text-sm">No registered staff users.</p>}
                   </div>
                </div>
             </div>
          )}
          
          {activeTab === 'Revenue' && currentUser.role === 'Admin' && (
            <div className="max-w-7xl mx-auto space-y-6 sm:space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                <StatCard title="Selected Revenue" value={`₦${financialSummary.rev.toLocaleString()}`} icon={<ICONS.Revenue />} color="emerald" />
                <StatCard title="Cost Basis" value={`₦${financialSummary.cost.toLocaleString()}`} icon={<ICONS.Inventory />} color="amber" />
                <StatCard title="Net Gains" value={`₦${financialSummary.profit.toLocaleString()}`} icon={<ICONS.Dashboard />} color="blue" />
                <StatCard title="Profit %" value={`${financialSummary.margin.toFixed(1)}%`} icon={<ICONS.Register />} color="slate" />
              </div>
              
              <div className="bg-white rounded-[1.5rem] sm:rounded-[3rem] p-6 sm:p-10 border border-slate-200 shadow-sm">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 mb-8 sm:mb-10">
                   <h3 className="text-xl sm:text-2xl font-black uppercase tracking-tight">Finance Tracker</h3>
                   <div className="flex bg-slate-100 p-1 rounded-xl sm:rounded-2xl gap-1 sm:gap-2 overflow-x-auto custom-scrollbar no-scrollbar-at-mobile">
                      {(['All', 'Today', '7D', '30D'] as DateFilter[]).map(f => (
                        <button key={f} onClick={() => setRevenueFilter(f)} className={`px-4 sm:px-6 py-2 sm:py-2.5 rounded-lg sm:rounded-xl text-[8px] sm:text-[10px] font-black uppercase tracking-widest transition-all shrink-0 ${revenueFilter === f ? 'bg-white text-blue-600 shadow-md' : 'text-slate-400 hover:text-slate-900'}`}>
                          {f === '7D' ? '7 Days' : f === '30D' ? '30 Days' : f}
                        </button>
                      ))}
                   </div>
                </div>
                <div className="overflow-x-auto custom-scrollbar rounded-xl sm:rounded-[2.5rem] border border-slate-100">
                   <table className="w-full text-left min-w-[800px] sm:min-w-[1000px]">
                     <thead className="bg-slate-50 border-b border-slate-100">
                        <tr className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">
                           <th className="px-6 sm:px-8 py-4 sm:py-6">Date</th>
                           <th className="px-6 sm:px-8 py-4 sm:py-6">Order ID</th>
                           <th className="px-6 sm:px-8 py-4 sm:py-6">Revenue</th>
                           <th className="px-6 sm:px-8 py-4 sm:py-6">Profit</th>
                           <th className="px-6 sm:px-8 py-4 sm:py-6">Margin</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-100 text-[11px] sm:text-xs font-bold text-slate-600">
                        {filteredTransactions.map(tx => (
                          <tr key={tx.id} className="hover:bg-slate-50 transition-colors">
                             <td className="px-6 sm:px-8 py-4 sm:py-6">{new Date(tx.timestamp).toLocaleString()}</td>
                             <td className="px-6 sm:px-8 py-4 sm:py-6 font-black text-slate-900">#{tx.id}</td>
                             <td className="px-6 sm:px-8 py-4 sm:py-6 text-slate-900 font-black">₦{tx.total.toLocaleString()}</td>
                             <td className="px-6 sm:px-8 py-4 sm:py-6 text-emerald-600 font-black">₦{(tx.total - (tx.totalCost || 0)).toLocaleString()}</td>
                             <td className="px-6 sm:px-8 py-4 sm:py-6">
                                <span className="px-2 py-0.5 sm:px-3 sm:py-1 bg-emerald-100 text-emerald-600 rounded-lg">{(( (tx.total - (tx.totalCost || 0)) / (tx.total || 1) ) * 100).toFixed(1)}%</span>
                             </td>
                          </tr>
                        ))}
                     </tbody>
                   </table>
                </div>
              </div>
            </div>
          )}
          
          {activeTab === 'Transactions' && (
             <div className="max-w-7xl mx-auto animate-in fade-in slide-in-from-right-4 duration-500">
                <div className="bg-white rounded-[1.5rem] sm:rounded-[3rem] border border-slate-200 overflow-hidden shadow-sm">
                   <div className="overflow-x-auto custom-scrollbar">
                     <table className="w-full text-left min-w-[700px] sm:min-w-[900px]">
                        <thead className="bg-slate-50 border-b border-slate-100">
                           <tr className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest">
                              <th className="px-6 sm:px-10 py-5 sm:py-8">Timestamp</th>
                              <th className="px-6 sm:px-10 py-5 sm:py-8">Order ID</th>
                              <th className="px-6 sm:px-10 py-5 sm:py-8">Items</th>
                              <th className="px-6 sm:px-10 py-5 sm:py-8">Total</th>
                              <th className="px-6 sm:px-10 py-5 sm:py-8 text-right">Action</th>
                           </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {transactions.map(tx => (
                            <tr key={tx.id} className="hover:bg-blue-50/20 transition-all">
                               <td className="px-6 sm:px-10 py-5 sm:py-8 text-[11px] sm:text-sm font-bold text-slate-600">{new Date(tx.timestamp).toLocaleString()}</td>
                               <td className="px-6 sm:px-10 py-5 sm:py-8 font-black text-slate-900 text-xs sm:text-sm">#{tx.id}</td>
                               <td className="px-6 sm:px-10 py-5 sm:py-8 text-[10px] sm:text-xs text-slate-500 max-w-[200px] sm:max-w-[300px] truncate">{tx.items.map(i => `${i.name} (x${i.quantity})`).join(', ')}</td>
                               <td className="px-6 sm:px-10 py-5 sm:py-8 font-black text-blue-600 text-xs sm:text-sm">₦{tx.total.toLocaleString()}</td>
                               <td className="px-6 sm:px-10 py-5 sm:py-8 text-right">
                                  <button onClick={() => setReceiptToShow(tx)} className="p-2 sm:p-3 bg-slate-100 text-slate-500 rounded-lg sm:rounded-xl hover:bg-blue-600 hover:text-white transition-all">
                                     <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>
                                  </button>
                               </td>
                            </tr>
                          ))}
                        </tbody>
                     </table>
                   </div>
                </div>
             </div>
          )}
        </div>

        {/* Overlays - Improved responsiveness for Basket */}
        {isBasketOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-0 sm:p-4 md:p-10 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300">
            <div className="w-full max-w-4xl h-full sm:max-h-[850px] bg-white rounded-none sm:rounded-[3.5rem] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-300">
               <div className="p-6 sm:p-10 border-b border-slate-100 flex items-center justify-between shrink-0">
                  <h3 className="text-xl sm:text-3xl font-black uppercase tracking-tight">Cart Items</h3>
                  <button onClick={() => setIsBasketOpen(false)} className="p-2 sm:p-4 bg-slate-50 text-slate-400 rounded-xl sm:rounded-2xl hover:bg-rose-500 hover:text-white transition-all"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
               </div>
               <div className="flex-1 p-4 sm:p-10 overflow-y-auto custom-scrollbar space-y-4 sm:space-y-6">
                  {cart.map(item => (
                    <div key={item.id} className="p-4 sm:p-8 bg-slate-50 border border-slate-100 rounded-2xl sm:rounded-[2.5rem] flex flex-wrap items-center gap-4 sm:gap-6">
                       <div className="flex-1 min-w-[150px]">
                          <p className="text-sm sm:text-lg font-black truncate">{item.name}</p>
                          <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 mt-1 uppercase">SKU: {item.sku}</p>
                       </div>
                       <div className="flex items-center gap-2 sm:gap-3 p-1.5 sm:p-2 bg-white rounded-xl sm:rounded-2xl border">
                          <button onClick={() => updateCartQty(item.id, -1)} className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center bg-slate-50 rounded-lg sm:rounded-xl font-black">-</button>
                          <span className="w-8 text-center font-black text-sm">{item.cartQuantity}</span>
                          <button onClick={() => updateCartQty(item.id, 1)} className="w-8 h-8 sm:w-10 sm:h-10 flex items-center justify-center bg-slate-50 rounded-lg sm:rounded-xl font-black">+</button>
                       </div>
                       <div className="text-right min-w-[100px] font-black text-base sm:text-xl shrink-0">₦{(item.price * item.cartQuantity).toLocaleString()}</div>
                       <button onClick={() => removeFromCart(item.id)} className="p-2 text-slate-300 hover:text-rose-500 transition-colors shrink-0"><ICONS.Trash /></button>
                    </div>
                  ))}
               </div>
               <div className="p-6 sm:p-10 bg-slate-50 border-t flex flex-col sm:flex-row sm:items-end justify-between gap-6 sm:gap-10 shrink-0">
                  <div className="text-center sm:text-left">
                    <p className="text-[9px] sm:text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1 sm:mb-2">Total Payable</p>
                    <p className="text-4xl sm:text-6xl font-black text-blue-600 tracking-tighter leading-none">₦{cartTotal.toLocaleString()}</p>
                  </div>
                  <button onClick={completeCheckout} disabled={cart.length === 0} className="w-full sm:w-auto px-10 sm:px-16 py-4 sm:py-6 bg-slate-900 text-white rounded-xl sm:rounded-[2rem] font-black uppercase tracking-widest shadow-2xl hover:bg-blue-600 transition-all active:scale-95 disabled:opacity-20 text-xs sm:text-base">Confirm & Print</button>
               </div>
            </div>
          </div>
        )}

        {/* Receipt Display Overlay */}
        {receiptToShow && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl animate-in fade-in duration-300">
            <div className="w-full max-w-sm bg-white rounded-[2rem] sm:rounded-[3rem] p-6 sm:p-10 shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh]">
              <div className="text-center mb-6 border-b border-slate-100 pb-6 shrink-0">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-blue-600 rounded-xl sm:rounded-2xl flex items-center justify-center mx-auto mb-4 text-white">
                  <ICONS.Register />
                </div>
                <h3 className="text-xl sm:text-2xl font-black uppercase tracking-tight leading-tight">{config.supermarketName}</h3>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Transaction Receipt</p>
              </div>
              
              <div className="space-y-4 mb-6 flex-1 overflow-hidden flex flex-col">
                <div className="flex justify-between text-[9px] font-black text-slate-400 uppercase tracking-widest shrink-0">
                  <span>ID: #{receiptToShow.id}</span>
                  <span>{new Date(receiptToShow.timestamp).toLocaleDateString()}</span>
                </div>
                <div className="space-y-2 overflow-y-auto pr-2 custom-scrollbar flex-1">
                  {receiptToShow.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-xs sm:text-sm">
                      <span className="font-bold text-slate-600">{item.name} <span className="text-slate-400 text-[10px]">x{item.quantity}</span></span>
                      <span className="font-black text-slate-900">₦{(item.price * item.quantity).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t-2 border-dashed border-slate-100 pt-5 sm:pt-6 mb-8 shrink-0">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-widest">Grand Total</span>
                  <span className="text-2xl sm:text-3xl font-black text-blue-600">₦{receiptToShow.total.toLocaleString()}</span>
                </div>
              </div>

              <button 
                onClick={() => setReceiptToShow(null)}
                className="w-full py-4 sm:py-5 bg-slate-900 text-white rounded-2xl sm:rounded-3xl font-black text-[10px] sm:text-xs uppercase tracking-widest hover:bg-blue-600 transition-all active:scale-95 shrink-0"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </main>

      <ProductModal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setEditingProduct(null); }} onSave={handleSaveProduct} initialData={editingProduct} />
    </div>
  );
};

const StatCard = ({ title, value, icon, color, alert }: { title: string, value: any, icon: React.ReactNode, color: string, alert?: boolean }) => {
  const colorMap = { emerald: 'text-emerald-600', blue: 'text-blue-600', amber: 'text-amber-600', rose: 'text-rose-600', slate: 'text-slate-900' };
  return (
    <div className={`p-5 sm:p-8 bg-white border-2 rounded-[1.5rem] sm:rounded-[3.5rem] transition-all duration-500 flex flex-col justify-between ${alert ? 'border-rose-100 shadow-xl shadow-rose-600/10' : 'border-slate-50 shadow-sm hover:shadow-xl group'}`}>
      <div className="flex items-center justify-between mb-4 sm:mb-8">
        <span className="text-[8px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest truncate">{title}</span>
        <div className={`p-2 sm:p-3.5 rounded-lg sm:rounded-2xl shrink-0 ${alert ? 'bg-rose-500 text-white' : 'bg-slate-50 text-slate-400 group-hover:bg-blue-600 group-hover:text-white transition-all'}`}>{icon}</div>
      </div>
      <div>
        <div className={`text-xl sm:text-4xl font-black tracking-tighter truncate leading-tight ${alert ? 'text-rose-600' : colorMap[color as keyof typeof colorMap]}`}>{value}</div>
        {alert && <p className="mt-2 sm:mt-4 text-[7px] sm:text-[9px] font-black text-rose-500 uppercase tracking-[0.2em] animate-pulse">Alert Triggered</p>}
      </div>
    </div>
  );
};

export default App;
