
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
  // Start as Seller on Dashboard as requested
  const [role, setRole] = useState<UserRole>('Seller');
  const [activeTab, setActiveTab] = useState<'Dashboard' | 'Inventory' | 'Register'>('Dashboard');
  
  // Admin Login State
  const [isLoginOverlayOpen, setIsLoginOverlayOpen] = useState(false);
  const [passcodeInput, setPasscodeInput] = useState('');
  const [loginError, setLoginError] = useState(false);

  // Data Persistence
  const [products, setProducts] = useState<Product[]>(() => {
    const saved = localStorage.getItem('sm_inventory_v5');
    return saved ? JSON.parse(saved) : INITIAL_PRODUCTS;
  });
  
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const saved = localStorage.getItem('sm_transactions_v5');
    return saved ? JSON.parse(saved) : [];
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  
  // AI Insights State
  const [insights, setInsights] = useState<{insight: string, recommendations: string[]}>({
    insight: 'Analyzing store performance...',
    recommendations: []
  });
  const [loadingInsights, setLoadingInsights] = useState(false);

  // Persistence Effects
  useEffect(() => {
    localStorage.setItem('sm_inventory_v5', JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    localStorage.setItem('sm_transactions_v5', JSON.stringify(transactions));
  }, [transactions]);

  // AI Analysis Effect
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

  // Daily Sales calculation for Seller Dashboard
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

  // POS Cart Management
  const addToCart = (product: Product) => {
    if (product.quantity <= 0) return;
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        if (existing.cartQuantity >= product.quantity) {
          alert(`Insufficient stock. Only ${product.quantity} available.`);
          return prev;
        }
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
    alert(`Success! Sale recorded: ₦${cartTotal.toLocaleString()}`);
  };

  // Role Switching Logic
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

  // Product CRUD
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
    <div className="flex h-screen bg-slate-50 overflow-hidden text-slate-900">
      {/* Admin Login Overlay */}
      {isLoginOverlayOpen && (
        <div className="fixed inset-0 z-[100] bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-sm rounded-[2.5rem] p-10 shadow-2xl relative animate-in zoom-in-95 duration-300">
            <button 
              onClick={() => { setIsLoginOverlayOpen(false); setPasscodeInput(''); setLoginError(false); }}
              className="absolute top-6 right-6 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
            <div className="mb-8 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </div>
              <h3 className="text-2xl font-black text-slate-800 tracking-tight">Admin Access</h3>
              <p className="text-slate-500 text-xs font-bold uppercase mt-2 tracking-widest">Enter Secure Passcode</p>
            </div>
            <form onSubmit={handleAdminLogin} className="space-y-6">
              <input 
                type="password"
                placeholder="••••••••"
                className={`w-full px-6 py-4 bg-slate-50 border-2 rounded-2xl text-center text-xl font-black tracking-[0.5em] outline-none transition-all ${loginError ? 'border-rose-500 shake bg-rose-50 text-rose-600' : 'border-slate-100 focus:border-blue-600 focus:bg-white'}`}
                value={passcodeInput}
                onChange={e => setPasscodeInput(e.target.value)}
                autoFocus
              />
              {loginError && <p className="text-rose-500 text-[10px] font-black text-center uppercase tracking-widest animate-pulse">Incorrect Passcode</p>}
              <button 
                type="submit"
                className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-[0.2em] text-sm shadow-xl shadow-blue-600/30 hover:bg-blue-700 transition-all active:scale-95"
              >
                Unlock Dashboard
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Navigation Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col shadow-2xl z-30">
        <div className="p-8 flex items-center gap-3 border-b border-white/10">
          <div className="bg-blue-600 p-2.5 rounded-xl shadow-lg shadow-blue-600/20">
            <ICONS.Inventory />
          </div>
          <span className="font-black text-xl tracking-tight italic">SUPERMART</span>
        </div>

        <nav className="flex-1 p-6 space-y-3">
          {[
            { id: 'Dashboard', icon: <ICONS.Dashboard />, label: 'Analytics' },
            { id: 'Inventory', icon: <ICONS.Inventory />, label: 'Stock Manager' },
            { id: 'Register', icon: <ICONS.Register />, label: 'Point of Sale' }
          ].map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={`w-full flex items-center gap-4 px-5 py-3.5 rounded-2xl transition-all font-bold text-sm ${
                activeTab === item.id 
                ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/30' 
                : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-6">
          <div className="bg-slate-800 p-4 rounded-2xl border border-white/5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Active Role</span>
              <span className={`text-[10px] px-2 py-0.5 rounded font-black ${role === 'Admin' ? 'bg-amber-500/20 text-amber-500' : 'bg-emerald-500/20 text-emerald-500'}`}>{role}</span>
            </div>
            <button 
              onClick={handleRoleToggle}
              className="w-full py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-xs font-black transition-all"
            >
              {role === 'Admin' ? 'Logout Admin' : 'Admin Login'}
            </button>
          </div>
        </div>
      </aside>

      {/* Primary Workspace */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-50 relative">
        <header className="h-20 bg-white/80 backdrop-blur-md border-b border-slate-200 px-8 flex items-center justify-between shrink-0 sticky top-0 z-20">
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">{activeTab}</h2>
          
          <div className="flex items-center gap-6">
            {activeTab !== 'Register' && (
               <div className="relative group">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors"><ICONS.Search /></span>
                <input 
                  type="text" 
                  placeholder="Find products, SKU, category..." 
                  className="pl-12 pr-6 py-3 bg-slate-100/50 border border-transparent rounded-2xl text-sm font-medium focus:bg-white focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 outline-none w-72 transition-all focus:w-96"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
            )}
            {role === 'Admin' && activeTab === 'Inventory' && (
              <button 
                onClick={() => { setEditingProduct(null); setIsModalOpen(true); }}
                className="flex items-center gap-3 px-6 py-3 bg-blue-600 text-white rounded-2xl text-sm font-black shadow-2xl shadow-blue-600/30 hover:bg-blue-700 active:scale-95 transition-all"
              >
                <ICONS.Plus /> NEW ITEM
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {activeTab === 'Dashboard' && (
            <div className="p-10 space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                {/* Restricted Visibility Rule */}
                {role === 'Admin' ? (
                  <StatCard title="Inventory Value" value={`₦${stats.totalValue.toLocaleString()}`} color="blue" />
                ) : (
                  <StatCard title="Today's Sales" value={`₦${todaySales.toLocaleString()}`} color="blue" />
                )}
                <StatCard title="Total SKU" value={stats.totalItems} color="slate" />
                <StatCard title="Low Stock" value={stats.lowStockCount} color="amber" alert={stats.lowStockCount > 0} />
                <StatCard title="Stock Out" value={stats.outOfStockCount} color="rose" alert={stats.outOfStockCount > 0} />
              </div>
              
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                <div className="lg:col-span-2 bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm">
                    <h3 className="font-black text-slate-800 mb-8 flex items-center gap-3 text-lg">
                      <span className="bg-blue-100 text-blue-600 p-2 rounded-xl inline-flex"><ICONS.Dashboard /></span>
                      AI Demand Forecast & Strategy
                    </h3>
                    
                    {loadingInsights ? (
                      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                        <div className="w-12 h-12 border-4 border-blue-600/10 border-t-blue-600 rounded-full animate-spin mb-6"></div>
                        <p className="text-sm font-bold tracking-widest uppercase">Consulting Gemini Engine...</p>
                      </div>
                    ) : (
                      <div className="space-y-8">
                        <div className="bg-blue-50/50 p-6 rounded-3xl border border-blue-100/50">
                          <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest block mb-3">EXECUTIVE SUMMARY</span>
                          <p className="text-sm text-slate-700 leading-relaxed font-medium italic">"{insights.insight}"</p>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                          {insights.recommendations.map((rec, i) => (
                            <div key={i} className="flex items-start gap-5 p-5 bg-slate-50 rounded-2xl border border-slate-100 hover:border-blue-300 transition-all hover:bg-white hover:shadow-xl hover:shadow-blue-500/5 group">
                              <div className="mt-0.5 w-8 h-8 flex items-center justify-center bg-blue-600 text-white rounded-xl text-xs font-black shrink-0 shadow-lg shadow-blue-600/20 group-hover:scale-110 transition-transform">{i + 1}</div>
                              <span className="text-sm text-slate-600 font-bold leading-snug">{rec}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                </div>

                <div className="bg-white rounded-[2rem] border border-slate-200 p-8 shadow-sm">
                  <h3 className="font-black text-slate-800 mb-6 text-lg">Live Transactions</h3>
                  <div className="space-y-5 max-h-[600px] overflow-y-auto custom-scrollbar pr-3">
                    {transactions.length === 0 ? (
                      <div className="py-20 text-center space-y-4">
                        <div className="mx-auto w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-300"><ICONS.Register /></div>
                        <p className="text-slate-400 text-xs font-black uppercase tracking-widest">No Sales Found</p>
                      </div>
                    ) : (
                      transactions.slice(0, 15).map(tx => (
                        <div key={tx.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:bg-white hover:border-blue-100 transition-all">
                          <div className="min-w-0">
                            <p className="text-sm font-black text-slate-800 truncate">{tx.productName}</p>
                            <p className="text-[10px] text-slate-400 font-bold mt-0.5 uppercase">{new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-sm font-black text-emerald-600">₦{tx.price.toLocaleString()}</p>
                            <p className="text-[10px] font-black text-slate-400 uppercase">Qty: {tx.quantity}</p>
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
            <div className="p-10 animate-in fade-in zoom-in-95 duration-500">
              <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-slate-50/50 border-b border-slate-100">
                    <tr className="text-slate-500 text-[11px] font-black uppercase tracking-[0.1em]">
                      <th className="px-8 py-5">Product Master</th>
                      <th className="px-8 py-5">Category</th>
                      <th className="px-8 py-5">Unit Price</th>
                      <th className="px-8 py-5">Availability</th>
                      <th className="px-8 py-5 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredProducts.map(p => (
                      <tr key={p.id} className="group hover:bg-blue-50/30 transition-colors">
                        <td className="px-8 py-5">
                          <div className="font-black text-slate-800">{p.name}</div>
                          <div className="text-[11px] text-slate-400 font-mono mt-0.5">{p.sku}</div>
                        </td>
                        <td className="px-8 py-5">
                          <span className="text-xs font-black text-slate-500 bg-slate-100 px-3 py-1 rounded-full">{p.category}</span>
                        </td>
                        <td className="px-8 py-5">
                          <div className="text-sm font-black text-slate-900">₦{p.price.toLocaleString()}</div>
                        </td>
                        <td className="px-8 py-5">
                          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-[11px] font-black ${
                            p.quantity <= 0 ? 'bg-rose-100 text-rose-600' : 
                            p.quantity <= p.minThreshold ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'
                          }`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${p.quantity <= 0 ? 'bg-rose-500' : p.quantity <= p.minThreshold ? 'bg-amber-500' : 'bg-emerald-500'}`}></div>
                            {p.quantity} Units
                          </div>
                        </td>
                        <td className="px-8 py-5 text-right">
                          {role === 'Admin' ? (
                            <button 
                              onClick={() => { setEditingProduct(p); setIsModalOpen(true); }}
                              className="px-5 py-2 bg-slate-900 text-white rounded-xl text-[11px] font-black hover:bg-blue-600 transition-all active:scale-95"
                            >
                              EDIT
                            </button>
                          ) : (
                            <span className="text-[10px] font-black text-slate-300 italic">Restricted</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'Register' && (
            <div className="flex h-full animate-in fade-in slide-in-from-right-4 duration-500 overflow-hidden bg-slate-100/40">
               {/* Product Grid Area */}
               <div className="flex-[2] flex flex-col min-w-0 border-r border-slate-200">
                 <div className="p-8 bg-white border-b border-slate-100">
                    <div className="relative group">
                      <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600"><ICONS.Search /></span>
                      <input 
                        type="text" 
                        placeholder="Search Catalog or Barcode..." 
                        className="w-full pl-14 pr-6 py-4 bg-slate-50 border-2 border-transparent rounded-[1.5rem] text-sm font-bold focus:bg-white focus:border-blue-600 outline-none transition-all"
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        autoFocus
                      />
                    </div>
                 </div>
                 
                 <div className="flex-1 p-8 overflow-y-auto custom-scrollbar grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 auto-rows-max">
                    {filteredProducts.map(p => (
                      <button 
                        key={p.id}
                        disabled={p.quantity <= 0}
                        onClick={() => addToCart(p)}
                        className={`p-6 bg-white border-2 border-transparent rounded-[2rem] text-left hover:border-blue-600 hover:shadow-2xl transition-all group relative active:scale-[0.98] ${p.quantity <= 0 ? 'opacity-40 cursor-not-allowed' : 'shadow-sm'}`}
                      >
                        <div className="flex justify-between items-start mb-4">
                          <span className="text-[10px] font-black bg-blue-50 text-blue-600 px-3 py-1 rounded-full uppercase">{p.category}</span>
                          <span className="font-black text-lg text-slate-900">₦{p.price.toLocaleString()}</span>
                        </div>
                        <p className="font-black text-slate-800 text-md truncate mb-1">{p.name}</p>
                        <p className="text-[11px] text-slate-400 font-mono">{p.sku}</p>
                        
                        <div className="mt-6 flex items-center justify-between">
                           <div className={`text-[10px] font-black px-2 py-1 rounded-lg ${p.quantity <= p.minThreshold ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-400'}`}>
                              STOCK: {p.quantity}
                           </div>
                           <div className="bg-blue-600 text-white p-2 rounded-xl scale-0 group-hover:scale-110 transition-transform">
                              <ICONS.Plus />
                           </div>
                        </div>
                        {p.quantity <= 0 && <div className="absolute inset-0 bg-white/80 flex items-center justify-center font-black text-rose-600 uppercase text-xs z-10">SOLD OUT</div>}
                      </button>
                    ))}
                 </div>
               </div>

               {/* Cart Summary Panel */}
               <div className="w-[420px] bg-white flex flex-col shadow-[-20px_0_50px_rgba(0,0,0,0.03)] z-10">
                  <div className="p-8 border-b border-slate-100 flex items-center justify-between">
                     <h3 className="font-black text-slate-900 uppercase text-xl tracking-tighter">Current Sale</h3>
                     <span className="bg-blue-600 text-white w-8 h-8 flex items-center justify-center rounded-full text-xs font-black">{cart.length}</span>
                  </div>

                  <div className="flex-1 p-8 overflow-y-auto custom-scrollbar space-y-4">
                     {cart.length === 0 ? (
                       <div className="h-full flex flex-col items-center justify-center text-center opacity-20">
                          <div className="mb-6 p-8 bg-slate-100 rounded-full"><ICONS.Register /></div>
                          <p className="text-sm font-black uppercase tracking-widest text-slate-800">Basket is Empty</p>
                       </div>
                     ) : (
                       cart.map(item => (
                         <div key={item.id} className="flex items-center gap-4 p-5 bg-slate-50 rounded-3xl border border-slate-100">
                            <div className="flex-1 min-w-0">
                               <p className="text-sm font-black text-slate-800 truncate">{item.name}</p>
                               <p className="text-[11px] text-slate-400 font-black mt-0.5">₦{item.price.toLocaleString()} EA</p>
                            </div>
                            <div className="flex items-center gap-3 bg-white rounded-2xl p-1 shadow-sm border border-slate-200">
                               <button onClick={() => updateCartQty(item.id, -1)} className="w-7 h-7 flex items-center justify-center hover:bg-slate-100 rounded-xl text-xs font-black transition-all">-</button>
                               <span className="text-[12px] font-black w-6 text-center">{item.cartQuantity}</span>
                               <button onClick={() => updateCartQty(item.id, 1)} className="w-7 h-7 flex items-center justify-center hover:bg-slate-100 rounded-xl text-xs font-black transition-all">+</button>
                            </div>
                            <button onClick={() => removeFromCart(item.id)} className="text-slate-300 hover:text-rose-500 transition-colors p-2">
                               <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                            </button>
                         </div>
                       ))
                     )}
                  </div>

                  <div className="p-10 border-t border-slate-100 bg-slate-50/80">
                     <div className="space-y-4 mb-8">
                        <div className="flex justify-between items-center text-slate-500 text-[11px] font-black uppercase tracking-widest">
                           <span>Subtotal</span>
                           <span>₦{cartTotal.toLocaleString()}</span>
                        </div>
                        <div className="flex justify-between items-end text-slate-900 font-black text-3xl tracking-tighter">
                           <span className="text-xs uppercase tracking-widest text-slate-400 pb-2">Total</span>
                           <span className="text-blue-600">₦{cartTotal.toLocaleString()}</span>
                        </div>
                     </div>
                     <button 
                        disabled={cart.length === 0}
                        onClick={completeCheckout}
                        className="w-full py-6 bg-blue-600 text-white rounded-[2rem] font-black uppercase tracking-[0.2em] text-sm shadow-2xl shadow-blue-600/40 hover:bg-blue-700 disabled:opacity-30 disabled:shadow-none transition-all active:scale-95 flex items-center justify-center gap-3"
                     >
                        FINALIZE & PAY
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

const StatCard = ({ title, value, color, alert }: { title: string, value: any, color: string, alert?: boolean }) => {
  return (
    <div className={`bg-white p-8 rounded-[2.5rem] border-2 transition-all duration-500 ${alert ? 'border-rose-100 shadow-2xl shadow-rose-600/10 animate-pulse' : 'border-slate-100 shadow-sm hover:shadow-xl'}`}>
      <div className="flex items-center justify-between mb-4">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">{title}</span>
        {alert && <div className="p-1.5 bg-rose-500 text-white rounded-lg"><ICONS.Alert /></div>}
      </div>
      <div className={`text-4xl font-black tracking-tighter ${alert ? 'text-rose-600' : 'text-slate-900'}`}>{value}</div>
      {alert && <p className="text-[10px] font-black text-rose-500 mt-4 uppercase tracking-widest">Attention Needed</p>}
    </div>
  );
};

export default App;
