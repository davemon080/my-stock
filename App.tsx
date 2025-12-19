
import React, { useState, useMemo, useEffect } from 'react';
import { Product, UserRole, InventoryStats, Category, Transaction } from './types.ts';
import { INITIAL_PRODUCTS, CATEGORIES, ICONS } from './constants.tsx';
import Fuse from 'fuse.js';
import ProductModal from './components/ProductModal.tsx';
import { getInventoryInsights } from './services/geminiService.ts';

interface CartItem extends Product {
  cartQuantity: number;
}

const App: React.FC = () => {
  const [role, setRole] = useState<UserRole>('Seller');
  const [activeTab, setActiveTab] = useState<'Dashboard' | 'Inventory' | 'Register'>('Dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isMobileCartOpen, setIsMobileCartOpen] = useState(false);
  
  // Admin Login State
  const [isLoginOverlayOpen, setIsLoginOverlayOpen] = useState(false);
  const [passcodeInput, setPasscodeInput] = useState('');
  const [loginError, setLoginError] = useState(false);

  // Data Persistence
  const [products, setProducts] = useState<Product[]>(() => {
    const saved = localStorage.getItem('sm_inventory_v7');
    return saved ? JSON.parse(saved) : INITIAL_PRODUCTS;
  });
  
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const saved = localStorage.getItem('sm_transactions_v7');
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

  // Persistence
  useEffect(() => {
    localStorage.setItem('sm_inventory_v7', JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    localStorage.setItem('sm_transactions_v7', JSON.stringify(transactions));
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
      lowStockCount: products.filter(p => p.quantity > 0 && p.quantity <= p.minThreshold).length,
      outOfStockCount: products.filter(p => p.quantity <= 0).length,
    };
  }, [products]);

  const todaySales = useMemo(() => {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    return transactions
      .filter(tx => new Date(tx.timestamp) >= startOfDay)
      .reduce((acc, tx) => acc + tx.price, 0);
  }, [transactions]);

  // Search Logic
  const fuse = useMemo(() => new Fuse(products, { 
    keys: ['name', 'sku', 'category'], 
    threshold: 0.3 
  }), [products]);
  
  const filteredProducts = useMemo(() => {
    if (!searchTerm) return products;
    return fuse.search(searchTerm).map(r => r.item);
  }, [products, searchTerm, fuse]);

  // Cart Logic
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

  const completeCheckout = () => {
    if (cart.length === 0) return;
    const now = new Date().toISOString();
    const newTransactions: Transaction[] = cart.map(item => ({
      id: Math.random().toString(36).substr(2, 9),
      productId: item.id,
      productName: item.name,
      type: 'SALE',
      quantity: item.cartQuantity,
      price: item.price * item.cartQuantity,
      timestamp: now
    }));

    setProducts(prev => prev.map(p => {
      const soldItem = cart.find(item => item.id === p.id);
      return soldItem ? { ...p, quantity: p.quantity - soldItem.cartQuantity, lastUpdated: now } : p;
    }));

    setTransactions(prev => [...newTransactions, ...prev].slice(0, 100));
    setCart([]);
    setSearchTerm('');
    setIsMobileCartOpen(false);
    alert(`Success! Sale recorded: ₦${cartTotal.toLocaleString()}`);
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

  const handleSaveProduct = (productData: Omit<Product, 'id' | 'lastUpdated'>) => {
    const now = new Date().toISOString();
    if (editingProduct) {
      setProducts(prev => prev.map(p => p.id === editingProduct.id ? { ...p, ...productData, lastUpdated: now } : p));
    } else {
      setProducts(prev => [...prev, { ...productData, id: Math.random().toString(36).substr(2, 9), lastUpdated: now }]);
    }
    setIsModalOpen(false);
    setEditingProduct(null);
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden font-['Plus_Jakarta_Sans']">
      {/* Admin Login Modal */}
      {isLoginOverlayOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300">
          <div className="w-full max-w-sm p-10 bg-white rounded-[3rem] shadow-2xl relative animate-in zoom-in-95 duration-300">
            <button onClick={() => {setIsLoginOverlayOpen(false); setPasscodeInput('');}} className="absolute top-8 right-8 text-slate-400 hover:text-slate-600">
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
        <div className="p-8 flex items-center gap-4 border-b border-white/5">
          <div className="p-3 bg-blue-600 rounded-2xl shadow-lg shadow-blue-600/40">
            <ICONS.Inventory />
          </div>
          <div>
            <h1 className="text-xl font-black italic tracking-tighter leading-tight">SUPERMART</h1>
            <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Inventory v2.0</p>
          </div>
        </div>

        <nav className="flex-1 p-6 space-y-2 overflow-y-auto custom-scrollbar">
          {[
            { id: 'Dashboard', icon: <ICONS.Dashboard />, label: 'Analytics' },
            { id: 'Inventory', icon: <ICONS.Inventory />, label: 'Stock Manager' },
            { id: 'Register', icon: <ICONS.Register />, label: 'Point of Sale' }
          ].map(item => (
            <button
              key={item.id}
              onClick={() => { setActiveTab(item.id as any); setIsSidebarOpen(false); }}
              className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all font-bold text-sm ${
                activeTab === item.id 
                ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/20' 
                : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <span className="w-5 h-5">{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-6">
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
      <main className="flex-1 flex flex-col min-w-0 bg-slate-50">
        <header className="h-20 bg-white/70 backdrop-blur-xl border-b border-slate-200 px-6 md:px-10 flex items-center justify-between sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(true)} className="p-2.5 bg-slate-100 rounded-xl text-slate-600 lg:hidden active:scale-95 transition-all">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
            </button>
            <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight">{activeTab}</h2>
          </div>
          
          <div className="flex items-center gap-4">
            {activeTab !== 'Register' && (
              <div className="relative group hidden sm:block">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-all"><ICONS.Search /></span>
                <input 
                  type="text" 
                  placeholder="Find products..." 
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

            {activeTab === 'Register' && (
              <button onClick={() => setIsMobileCartOpen(true)} className="lg:hidden p-3 bg-slate-900 text-white rounded-2xl relative shadow-lg active:scale-95 transition-all">
                <ICONS.Register />
                {cart.length > 0 && <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-blue-600 text-[10px] font-black flex items-center justify-center rounded-full border-2 border-white">{cart.length}</span>}
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {activeTab === 'Dashboard' && (
            <div className="p-6 md:p-10 space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
              {/* Stats Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 md:gap-8">
                {role === 'Admin' ? (
                  <StatCard title="Inventory Value" value={`₦${stats.totalValue.toLocaleString()}`} icon={<ICONS.Inventory />} color="blue" />
                ) : (
                  <StatCard title="Today's Sales" value={`₦${todaySales.toLocaleString()}`} icon={<ICONS.Register />} color="blue" />
                )}
                <StatCard title="Total SKUs" value={stats.totalItems} icon={<ICONS.Dashboard />} color="slate" />
                <StatCard title="Low Stock" value={stats.lowStockCount} icon={<ICONS.Alert />} color="amber" alert={stats.lowStockCount > 0} />
                <StatCard title="Out of Stock" value={stats.outOfStockCount} icon={<ICONS.Alert />} color="rose" alert={stats.outOfStockCount > 0} />
              </div>

              <div className="flex flex-col xl:flex-row gap-10">
                {/* AI & Analytics Area */}
                <div className="flex-1 bg-white rounded-[3rem] p-8 md:p-10 border border-slate-200 shadow-sm">
                  <div className="flex items-center justify-between mb-10">
                    <h3 className="text-xl font-black text-slate-900 flex items-center gap-3">
                      <span className="p-3 bg-blue-600 text-white rounded-2xl"><ICONS.Dashboard /></span>
                      AI Demand Insights
                    </h3>
                    {loadingInsights && <div className="w-5 h-5 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin"></div>}
                  </div>

                  {loadingInsights && insights.recommendations.length === 0 ? (
                    <div className="py-20 flex flex-col items-center justify-center text-slate-400">
                      <p className="text-sm font-black tracking-widest uppercase animate-pulse">Running Gemini analysis...</p>
                    </div>
                  ) : (
                    <div className="space-y-10">
                      <div className="p-8 bg-slate-50 border border-slate-100 rounded-[2.5rem]">
                        <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest block mb-4">MANAGER SUMMARY</span>
                        <p className="text-md md:text-lg font-bold text-slate-800 leading-relaxed italic">"{insights.insight}"</p>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {insights.recommendations.map((rec, i) => (
                          <div key={i} className="flex items-start gap-5 p-6 bg-white border border-slate-100 rounded-3xl hover:border-blue-500 hover:shadow-xl hover:shadow-blue-500/5 transition-all group">
                            <div className="w-10 h-10 flex items-center justify-center bg-blue-600 text-white rounded-2xl text-xs font-black shadow-lg shadow-blue-600/20 group-hover:scale-110 transition-transform">{i + 1}</div>
                            <p className="text-sm font-bold text-slate-600 leading-snug">{rec}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Sales Feed */}
                <div className="w-full xl:w-96 bg-white rounded-[3rem] p-8 border border-slate-200 shadow-sm flex flex-col">
                  <h3 className="text-xl font-black text-slate-900 mb-8">Recent Activity</h3>
                  <div className="flex-1 space-y-4 overflow-y-auto custom-scrollbar max-h-[500px] pr-2">
                    {transactions.length === 0 ? (
                      <div className="py-20 text-center opacity-30">
                        <p className="text-xs font-black uppercase tracking-widest text-slate-500">No Sales Logged</p>
                      </div>
                    ) : (
                      transactions.slice(0, 20).map(tx => (
                        <div key={tx.id} className="p-5 bg-slate-50 border border-slate-100 rounded-[2rem] flex items-center justify-between hover:bg-white hover:border-blue-100 transition-all">
                          <div className="min-w-0">
                            <p className="text-sm font-black text-slate-900 truncate">{tx.productName}</p>
                            <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase">{new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-black text-blue-600">₦{tx.price.toLocaleString()}</p>
                            <p className="text-[10px] font-black text-slate-400 mt-1 uppercase">QTY: {tx.quantity}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Inventory' && (
            <div className="p-6 md:p-10 animate-in fade-in zoom-in-95 duration-500">
              <div className="bg-white rounded-[3rem] border border-slate-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left min-w-[800px]">
                    <thead className="bg-slate-50/50 border-b border-slate-100">
                      <tr className="text-slate-400 text-[10px] font-black uppercase tracking-widest">
                        <th className="px-10 py-8">Product Details</th>
                        <th className="px-10 py-8">Category</th>
                        <th className="px-10 py-8">Price</th>
                        <th className="px-10 py-8">Stock Level</th>
                        <th className="px-10 py-8 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredProducts.map(p => (
                        <tr key={p.id} className="group hover:bg-blue-50/20 transition-all duration-300">
                          <td className="px-10 py-8">
                            <div className="font-black text-slate-900 text-md">{p.name}</div>
                            <div className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">{p.sku}</div>
                          </td>
                          <td className="px-10 py-8">
                            <span className="px-4 py-1.5 bg-slate-100 text-slate-600 rounded-full text-[10px] font-black uppercase tracking-widest">{p.category}</span>
                          </td>
                          <td className="px-10 py-8 font-black text-slate-900 text-sm">₦{p.price.toLocaleString()}</td>
                          <td className="px-10 py-8">
                            <div className={`inline-flex items-center gap-2.5 px-4 py-2 rounded-2xl text-[11px] font-black ${
                              p.quantity <= 0 ? 'bg-rose-100 text-rose-600' : 
                              p.quantity <= p.minThreshold ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'
                            }`}>
                              <span className={`w-2.5 h-2.5 rounded-full ${p.quantity <= 0 ? 'bg-rose-500' : p.quantity <= p.minThreshold ? 'bg-amber-500' : 'bg-emerald-500'} animate-pulse`}></span>
                              {p.quantity} Units
                            </div>
                          </td>
                          <td className="px-10 py-8 text-right">
                            {role === 'Admin' ? (
                              <button onClick={() => {setEditingProduct(p); setIsModalOpen(true);}} className="p-3 bg-slate-900 text-white rounded-2xl hover:bg-blue-600 transition-all active:scale-90">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                              </button>
                            ) : (
                              <span className="text-[10px] font-black text-slate-200 uppercase tracking-widest italic">Protected</span>
                            )}
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
            <div className="flex h-full animate-in fade-in slide-in-from-right-4 duration-500 overflow-hidden relative">
               {/* Product Grid Area */}
               <div className="flex-1 flex flex-col min-w-0 bg-slate-100/40">
                 <div className="p-6 md:p-10 bg-white border-b border-slate-100 flex flex-col md:flex-row gap-6 shadow-sm z-10">
                    <div className="flex-1 relative group">
                      <span className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600"><ICONS.Search /></span>
                      <input 
                        type="text" 
                        placeholder="Search or scan SKU..." 
                        className="w-full pl-16 pr-8 py-5 text-md font-bold bg-slate-50 border-2 border-transparent rounded-[2rem] focus:bg-white focus:border-blue-600 outline-none transition-all"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        autoFocus
                      />
                    </div>
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2 md:pb-0">
                      {['All Items', ...CATEGORIES.slice(0, 3)].map(cat => (
                        <button key={cat} className="px-6 py-4 bg-white border-2 border-slate-100 rounded-2xl text-[10px] font-black uppercase tracking-widest whitespace-nowrap hover:border-blue-600 transition-all">
                          {cat}
                        </button>
                      ))}
                    </div>
                 </div>
                 
                 <div className="flex-1 p-6 md:p-10 overflow-y-auto custom-scrollbar grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 auto-rows-max">
                    {filteredProducts.map(p => (
                      <button 
                        key={p.id}
                        disabled={p.quantity <= 0}
                        onClick={() => addToCart(p)}
                        className={`p-6 bg-white border-2 border-transparent rounded-[2.5rem] text-left hover:border-blue-600 hover:shadow-2xl transition-all group relative active:scale-[0.98] ${p.quantity <= 0 ? 'opacity-40 grayscale cursor-not-allowed' : 'shadow-sm'}`}
                      >
                        <div className="flex justify-between items-start mb-6">
                          <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-xl text-[9px] font-black uppercase tracking-widest">{p.category}</span>
                          <span className="text-lg font-black text-slate-900">₦{p.price.toLocaleString()}</span>
                        </div>
                        <h4 className="text-md font-black text-slate-800 mb-1 leading-tight line-clamp-2">{p.name}</h4>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{p.sku}</p>
                        
                        <div className="mt-8 flex items-center justify-between">
                           <div className={`px-2.5 py-1.5 rounded-xl text-[10px] font-black ${p.quantity <= p.minThreshold ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>
                              {p.quantity} IN STOCK
                           </div>
                           <div className="p-2.5 bg-blue-600 text-white rounded-2xl opacity-0 group-hover:opacity-100 lg:group-hover:translate-y-0 translate-y-2 transition-all shadow-lg shadow-blue-600/40">
                              <ICONS.Plus />
                           </div>
                        </div>
                        {p.quantity <= 0 && <div className="absolute inset-0 z-20 flex items-center justify-center bg-white/60 font-black text-rose-600 uppercase text-xs tracking-widest rounded-[2.5rem]">STOCK OUT</div>}
                      </button>
                    ))}
                 </div>
               </div>

               {/* Cart Panel - Mobile Responsive */}
               <div className={`fixed lg:static inset-y-0 right-0 z-[60] w-full sm:w-[450px] lg:w-[400px] xl:w-[450px] bg-white flex flex-col shadow-[-20px_0_60px_rgba(0,0,0,0.1)] transition-transform duration-500 transform ${isMobileCartOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'}`}>
                  <div className="p-10 border-b border-slate-100 flex items-center justify-between shrink-0">
                     <div className="flex items-center gap-4">
                        <button onClick={() => setIsMobileCartOpen(false)} className="lg:hidden p-3 bg-slate-100 rounded-2xl text-slate-500">
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
                        </button>
                        <h3 className="text-2xl font-black text-slate-900 tracking-tighter uppercase">Current Sale</h3>
                     </div>
                     <span className="w-10 h-10 flex items-center justify-center bg-blue-600 text-white rounded-2xl text-sm font-black shadow-lg shadow-blue-600/30">{cart.length}</span>
                  </div>

                  <div className="flex-1 p-8 md:p-10 overflow-y-auto custom-scrollbar space-y-5">
                     {cart.length === 0 ? (
                       <div className="h-full flex flex-col items-center justify-center text-center py-20 opacity-20">
                          <div className="p-10 mb-8 bg-slate-100 rounded-[3rem]"><ICONS.Register /></div>
                          <p className="text-sm font-black uppercase tracking-widest text-slate-800">Basket is empty</p>
                       </div>
                     ) : (
                       cart.map(item => (
                         <div key={item.id} className="p-6 bg-slate-50 border border-slate-200 rounded-[2.5rem] flex items-center gap-4 hover:shadow-xl hover:shadow-slate-200/50 transition-all">
                            <div className="flex-1 min-w-0">
                               <p className="text-sm font-black text-slate-900 truncate leading-tight">{item.name}</p>
                               <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase">₦{item.price.toLocaleString()} Each</p>
                            </div>
                            <div className="flex items-center gap-2.5 p-1.5 bg-white border border-slate-200 rounded-2xl shadow-sm">
                               <button onClick={() => updateCartQty(item.id, -1)} className="w-8 h-8 flex items-center justify-center bg-slate-50 hover:bg-slate-100 rounded-xl text-xs font-black transition-all">-</button>
                               <span className="w-8 text-center text-xs font-black">{item.cartQuantity}</span>
                               <button onClick={() => updateCartQty(item.id, 1)} className="w-8 h-8 flex items-center justify-center bg-slate-50 hover:bg-slate-100 rounded-xl text-xs font-black transition-all">+</button>
                            </div>
                            <button onClick={() => removeFromCart(item.id)} className="p-3 text-slate-300 hover:text-rose-500 transition-colors">
                               <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                            </button>
                         </div>
                       ))
                     )}
                  </div>

                  <div className="p-10 bg-slate-50/50 border-t border-slate-100 shrink-0">
                     <div className="mb-10 space-y-4">
                        <div className="flex items-center justify-between text-[11px] font-black text-slate-400 uppercase tracking-widest">
                           <span>Subtotal</span>
                           <span>₦{cartTotal.toLocaleString()}</span>
                        </div>
                        <div className="flex items-end justify-between">
                           <span className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em] mb-2">Total Pay</span>
                           <span className="text-4xl font-black text-blue-600 tracking-tighter">₦{cartTotal.toLocaleString()}</span>
                        </div>
                     </div>
                     <button 
                        disabled={cart.length === 0}
                        onClick={completeCheckout}
                        className="w-full py-6 text-sm font-black text-white uppercase tracking-widest transition-all bg-blue-600 shadow-2xl rounded-[2.5rem] hover:bg-blue-700 active:scale-95 disabled:opacity-30 shadow-blue-600/40"
                     >
                        Finalize & Print Receipt
                     </button>
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
  return (
    <div className={`p-8 bg-white border-2 rounded-[3rem] transition-all duration-500 ${alert ? 'border-rose-100 shadow-2xl shadow-rose-600/10 animate-pulse' : 'border-slate-100 shadow-sm hover:shadow-2xl hover:shadow-slate-200/50 hover:border-blue-100 group'}`}>
      <div className="flex items-center justify-between mb-6">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{title}</span>
        <div className={`p-3 rounded-2xl transition-all ${alert ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30' : 'bg-slate-50 text-slate-400 group-hover:bg-blue-600 group-hover:text-white'}`}>
          {icon}
        </div>
      </div>
      <div className={`text-4xl font-black tracking-tighter transition-colors ${alert ? 'text-rose-600' : 'text-slate-900 group-hover:text-blue-600'}`}>{value}</div>
      {alert && <p className="mt-4 text-[10px] font-black text-rose-500 uppercase tracking-widest">Action Required</p>}
    </div>
  );
};

export default App;
