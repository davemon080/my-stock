
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

  // Fixed cartTotal calculation
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

  // Fixed missing addToCart function
  const addToCart = (product: Product) => {
    setCart(prev => {
      const existing = prev.find(item => item.id === product.id);
      if (existing) {
        return prev.map(item => item.id === product.id ? { ...item, cartQuantity: item.cartQuantity + 1 } : item);
      }
      return [...prev, { ...product, cartQuantity: 1 }];
    });
  };

  // Fixed missing updateCartQty function
  const updateCartQty = (id: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, cartQuantity: Math.max(1, item.cartQuantity + delta) };
      }
      return item;
    }));
  };

  // Fixed missing removeFromCart function
  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  // Fixed missing deleteProduct function
  const deleteProduct = (id: string) => {
    if (window.confirm('Are you sure you want to delete this product?')) {
      setProducts(prev => prev.filter(p => p.id !== id));
      setCart(prev => prev.filter(item => item.id !== id));
    }
  };

  // Fixed missing completeCheckout function
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
    
    // Deduct stock from products
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
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
          <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-600 rounded-full blur-[150px]"></div>
          <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-emerald-600 rounded-full blur-[150px]"></div>
        </div>
        
        <div className="w-full max-w-md bg-white rounded-[3rem] p-10 shadow-2xl relative z-10 animate-in fade-in zoom-in-95 duration-500">
          <div className="text-center mb-10">
            {config.logoUrl ? (
              <img src={config.logoUrl} alt="Logo" className="w-20 h-20 mx-auto mb-6 rounded-2xl object-cover shadow-lg" />
            ) : (
              <div className="w-20 h-20 bg-blue-600 rounded-[2rem] flex items-center justify-center mx-auto mb-6 shadow-xl shadow-blue-600/30">
                <ICONS.Inventory />
              </div>
            )}
            <h1 className="text-3xl font-black text-slate-900 tracking-tight">{config.supermarketName}</h1>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-2">Enterprise POS & Inventory</p>
          </div>

          <div className="flex bg-slate-100 p-1.5 rounded-2xl mb-8">
            {(['Seller', 'Admin'] as UserRole[]).map(r => (
              <button key={r} onClick={() => { setLoginRole(r); setLoginError(''); }} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${loginRole === r ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                {r}
              </button>
            ))}
          </div>

          <form onSubmit={handleLogin} className="space-y-6">
            {loginRole === 'Seller' && (
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Email Address</label>
                <input type="email" required className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-bold transition-all focus:border-blue-600 focus:bg-white" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} />
              </div>
            )}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{loginRole === 'Admin' ? 'Admin Password' : 'Password'}</label>
              <input type="password" required className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-bold transition-all focus:border-blue-600 focus:bg-white" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} />
            </div>

            {loginError && <p className="text-rose-500 text-xs font-bold text-center shake">{loginError}</p>}

            <button type="submit" className="w-full py-5 bg-blue-600 text-white rounded-3xl font-black text-sm uppercase tracking-widest shadow-xl shadow-blue-600/30 hover:bg-blue-700 active:scale-95 transition-all">
              Login to System
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden font-['Plus_Jakarta_Sans']">
      {/* Sidebar */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-72 bg-slate-950 text-white flex flex-col transform transition-transform duration-300 lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-8 flex items-center gap-4 border-b border-white/5 shrink-0">
          {config.logoUrl ? (
            <img src={config.logoUrl} className="w-10 h-10 rounded-xl object-cover" />
          ) : (
            <div className="p-3 bg-blue-600 rounded-2xl"><ICONS.Inventory /></div>
          )}
          <div className="min-w-0">
            <h1 className="text-lg font-black italic tracking-tighter truncate leading-tight uppercase">{config.supermarketName}</h1>
            <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Enterprise v6.2</p>
          </div>
        </div>

        <nav className="flex-1 p-6 space-y-2 overflow-y-auto custom-scrollbar">
          {[
            { id: 'Dashboard', icon: <ICONS.Dashboard />, label: 'Analytics', adminOnly: false },
            { id: 'Inventory', icon: <ICONS.Inventory />, label: 'Stock Manager', adminOnly: false },
            { id: 'Register', icon: <ICONS.Register />, label: 'Checkout', adminOnly: false },
            { id: 'Transactions', icon: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 21h8a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2z"/><path d="M10 7h4"/><path d="M10 11h4"/><path d="M10 15h4"/></svg>, label: 'Sales History', adminOnly: false },
            { id: 'Revenue', icon: <ICONS.Revenue />, label: 'Finance', adminOnly: true },
            { id: 'Settings', icon: <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.1a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>, label: 'Settings', adminOnly: true }
          ].map(item => (
            (item.adminOnly ? currentUser.role === 'Admin' : true) && (
              <button key={item.id} onClick={() => { setActiveTab(item.id as any); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all font-bold text-sm relative ${activeTab === item.id ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                <span className="w-5 h-5">{item.icon}</span>
                {item.label}
              </button>
            )
          ))}
        </nav>

        <div className="p-6 shrink-0">
          <div className="p-5 bg-white/5 border border-white/5 rounded-3xl backdrop-blur-md">
            <div className="mb-4">
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Signed in as</p>
              <p className="text-sm font-black truncate">{currentUser.name}</p>
            </div>
            <button onClick={() => setCurrentUser(null)} className="w-full py-3 bg-white/10 text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-rose-500 transition-all">
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 bg-slate-50 overflow-hidden relative">
        <header className="h-20 bg-white/70 backdrop-blur-xl border-b border-slate-200 px-6 md:px-10 flex items-center justify-between sticky top-0 z-30 shrink-0">
          <div className="flex items-center gap-4 min-w-0">
            <button onClick={() => setIsSidebarOpen(true)} className="p-2.5 bg-slate-100 rounded-xl text-slate-600 lg:hidden active:scale-95 transition-all">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
            </button>
            <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight truncate">{activeTab}</h2>
          </div>
          
          <div className="flex items-center gap-4 shrink-0">
            {activeTab === 'Register' && cart.length > 0 && (
              <button onClick={() => setIsBasketOpen(true)} className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-2xl text-xs font-black shadow-lg shadow-slate-900/20 hover:bg-blue-600 transition-all">
                <ICONS.Register />
                <span>BASKET ({cart.length})</span>
              </button>
            )}
            {currentUser.role === 'Admin' && activeTab === 'Inventory' && (
              <button onClick={() => { setEditingProduct(null); setIsModalOpen(true); }} className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-2xl text-xs font-black hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/30">
                <ICONS.Plus /> <span>ADD PRODUCT</span>
              </button>
            )}
          </div>
        </header>

        {/* Dynamic Page Rendering */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 md:p-10">
          {activeTab === 'Dashboard' && (
            <div className="space-y-10 max-w-7xl mx-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title="Today's Sales" value={`₦${todaySales.toLocaleString()}`} icon={<ICONS.Register />} color="emerald" />
                <StatCard title="Inventory Value" value={`₦${stats.totalValue.toLocaleString()}`} icon={<ICONS.Inventory />} color="blue" />
                <StatCard title="Low Stock" value={stats.lowStockCount} icon={<ICONS.Alert />} color="amber" alert={stats.lowStockCount > 0} />
                <StatCard title="Total SKUs" value={stats.totalItems} icon={<ICONS.Dashboard />} color="slate" />
              </div>
              
              {/* AI Insight Section */}
              <div className="bg-white rounded-[3rem] p-10 border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="text-xl font-black flex items-center gap-3"><span className="p-3 bg-blue-600 text-white rounded-2xl"><ICONS.Dashboard /></span>AI Business Analyst</h3>
                  {loadingInsights && <div className="w-5 h-5 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin"></div>}
                </div>
                <div className="p-8 bg-slate-50 rounded-[2.5rem] mb-8 italic text-slate-700">"{insights.insight}"</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {insights.recommendations.map((r, i) => (
                    <div key={i} className="flex items-start gap-4 p-6 bg-white border border-slate-100 rounded-3xl hover:border-blue-500 transition-all">
                      <div className="w-8 h-8 flex items-center justify-center bg-blue-100 text-blue-600 rounded-xl text-xs font-black shrink-0">{i+1}</div>
                      <p className="text-sm font-bold text-slate-600">{r}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Inventory' && (
             <div className="max-w-7xl mx-auto">
               <div className="bg-white rounded-[3rem] border border-slate-200 overflow-hidden shadow-sm">
                 <table className="w-full text-left">
                    <thead className="bg-slate-50 border-b border-slate-100">
                       <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                          <th className="px-10 py-8">Product Details</th>
                          <th className="px-10 py-8">SKU</th>
                          <th className="px-10 py-8">Pricing</th>
                          <th className="px-10 py-8">Stock Level</th>
                          <th className="px-10 py-8 text-right">Actions</th>
                       </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                       {filteredProducts.map(p => (
                         <tr key={p.id} className="hover:bg-blue-50/20 transition-all">
                            <td className="px-10 py-8 font-black text-slate-900">{p.name}</td>
                            <td className="px-10 py-8 font-mono text-xs">{p.sku}</td>
                            <td className="px-10 py-8 font-black text-sm">₦{p.price.toLocaleString()}</td>
                            <td className="px-10 py-8">
                               <div className={`inline-flex px-3 py-1.5 rounded-xl text-[10px] font-black ${p.quantity <= p.minThreshold ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>
                                 {p.quantity} Units
                               </div>
                            </td>
                            <td className="px-10 py-8 text-right">
                               {currentUser.role === 'Admin' ? (
                                 <div className="flex justify-end gap-2">
                                   <button onClick={() => { setEditingProduct(p); setIsModalOpen(true); }} className="p-3 bg-slate-100 text-slate-400 rounded-xl hover:bg-blue-600 hover:text-white transition-all"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg></button>
                                   <button onClick={() => deleteProduct(p.id)} className="p-3 bg-slate-100 text-slate-400 rounded-xl hover:bg-rose-600 hover:text-white transition-all"><ICONS.Trash /></button>
                                 </div>
                               ) : <span className="text-[10px] font-black text-slate-300 italic uppercase">Locked</span>}
                            </td>
                         </tr>
                       ))}
                    </tbody>
                 </table>
               </div>
             </div>
          )}

          {activeTab === 'Register' && (
            <div className="max-w-7xl mx-auto space-y-8">
               <div className="relative group">
                 <span className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-600 transition-colors"><ICONS.Search /></span>
                 <input type="text" placeholder="Search catalog for checkout..." className="w-full pl-16 pr-8 py-5 text-md font-bold bg-white border-2 border-transparent rounded-[2.5rem] focus:border-blue-600 outline-none transition-all shadow-sm" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
               </div>
               <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-6">
                 {filteredProducts.map(p => (
                   <button key={p.id} disabled={p.quantity <= 0} onClick={() => addToCart(p)} className="p-8 bg-white border-2 border-transparent rounded-[3.5rem] text-left hover:border-blue-600 hover:shadow-2xl transition-all group relative active:scale-95 shadow-sm">
                      <div className="text-2xl font-black text-slate-900 mb-4">₦{p.price.toLocaleString()}</div>
                      <h4 className="text-lg font-black text-slate-800 mb-2 leading-tight line-clamp-2 min-h-[3rem]">{p.name}</h4>
                      <p className="text-[10px] font-bold text-slate-400 mb-6">{p.sku}</p>
                      <div className={`px-2.5 py-1 rounded-xl text-[10px] font-black w-fit ${p.quantity <= p.minThreshold ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>{p.quantity} In Stock</div>
                      {p.quantity <= 0 && <div className="absolute inset-0 bg-white/60 flex items-center justify-center font-black text-rose-600 uppercase tracking-widest rounded-[3.5rem]">SOLD OUT</div>}
                   </button>
                 ))}
               </div>
            </div>
          )}

          {activeTab === 'Settings' && currentUser.role === 'Admin' && (
             <div className="max-w-4xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* Store Identity */}
                <div className="bg-white rounded-[3rem] p-10 border border-slate-200 shadow-sm">
                   <h3 className="text-2xl font-black mb-8 flex items-center gap-3"><span className="p-3 bg-blue-100 text-blue-600 rounded-2xl"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg></span>Store Identity</h3>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Supermarket Name</label>
                        <input type="text" className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-bold focus:border-blue-600" value={config.supermarketName} onChange={e => setConfig({ ...config, supermarketName: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Logo URL (Optional)</label>
                        <input type="text" placeholder="https://..." className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-bold focus:border-blue-600" value={config.logoUrl} onChange={e => setConfig({ ...config, logoUrl: e.target.value })} />
                      </div>
                   </div>
                </div>

                {/* Security */}
                <div className="bg-white rounded-[3rem] p-10 border border-slate-200 shadow-sm">
                   <h3 className="text-2xl font-black mb-8 flex items-center gap-3"><span className="p-3 bg-amber-100 text-amber-600 rounded-2xl"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>Admin Security</h3>
                   <div className="space-y-2">
                      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Admin Master Password</label>
                      <input type="password" className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-bold focus:border-blue-600" value={config.adminPassword} onChange={e => setConfig({ ...config, adminPassword: e.target.value })} />
                   </div>
                </div>

                {/* Seller Management */}
                <div className="bg-white rounded-[3rem] p-10 border border-slate-200 shadow-sm">
                   <h3 className="text-2xl font-black mb-8">User Management (Sellers)</h3>
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
                   }} className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
                      <input name="name" required placeholder="Full Name" className="px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-bold focus:border-blue-600" />
                      <input name="email" required type="email" placeholder="Email Address" className="px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-bold focus:border-blue-600" />
                      <input name="password" required type="password" placeholder="Assign Password" className="px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-bold focus:border-blue-600" />
                      <button type="submit" className="md:col-span-3 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest hover:bg-blue-600 transition-all">Add New User</button>
                   </form>

                   <div className="space-y-4">
                      {config.sellers.map(s => (
                        <div key={s.id} className="p-6 bg-slate-50 border border-slate-100 rounded-3xl flex items-center justify-between">
                           <div>
                              <p className="font-black text-slate-900">{s.name}</p>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{s.email}</p>
                           </div>
                           <button onClick={() => setConfig({ ...config, sellers: config.sellers.filter(sl => sl.id !== s.id) })} className="p-3 text-rose-500 hover:bg-rose-50 rounded-xl transition-all"><ICONS.Trash /></button>
                        </div>
                      ))}
                      {config.sellers.length === 0 && <p className="text-center py-10 text-slate-300 italic">No users created yet.</p>}
                   </div>
                </div>
             </div>
          )}
          
          {/* Revenue Page */}
          {activeTab === 'Revenue' && currentUser.role === 'Admin' && (
            <div className="max-w-7xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <StatCard title="Revenue" value={`₦${financialSummary.rev.toLocaleString()}`} icon={<ICONS.Revenue />} color="emerald" />
                <StatCard title="Cost of Sales" value={`₦${financialSummary.cost.toLocaleString()}`} icon={<ICONS.Inventory />} color="amber" />
                <StatCard title="Net Profit" value={`₦${financialSummary.profit.toLocaleString()}`} icon={<ICONS.Dashboard />} color="blue" />
                <StatCard title="Margin %" value={`${financialSummary.margin.toFixed(1)}%`} icon={<ICONS.Register />} color="slate" />
              </div>
              
              <div className="bg-white rounded-[3rem] p-10 border border-slate-200 shadow-sm">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
                   <h3 className="text-2xl font-black">Financial Analysis</h3>
                   <div className="flex bg-slate-100 p-1.5 rounded-2xl gap-2">
                      {(['All', 'Today', '7D', '30D'] as DateFilter[]).map(f => (
                        <button key={f} onClick={() => setRevenueFilter(f)} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${revenueFilter === f ? 'bg-white text-blue-600 shadow-md' : 'text-slate-400 hover:text-slate-900'}`}>
                          {f === '7D' ? 'Last 7 Days' : f === '30D' ? 'Last 30 Days' : f}
                        </button>
                      ))}
                   </div>
                </div>
                <div className="overflow-x-auto rounded-[2.5rem] border border-slate-100">
                   <table className="w-full text-left min-w-[1000px]">
                     <thead className="bg-slate-50 border-b border-slate-100">
                        <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                           <th className="px-8 py-6">Timestamp</th>
                           <th className="px-8 py-6">Order ID</th>
                           <th className="px-8 py-6">Revenue</th>
                           <th className="px-8 py-6">Profit</th>
                           <th className="px-8 py-6">Margin</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-600">
                        {filteredTransactions.map(tx => (
                          <tr key={tx.id} className="hover:bg-slate-50">
                             <td className="px-8 py-6">{new Date(tx.timestamp).toLocaleString()}</td>
                             <td className="px-8 py-6 font-black text-slate-900">#{tx.id}</td>
                             <td className="px-8 py-6 text-slate-900 font-black">₦{tx.total.toLocaleString()}</td>
                             <td className="px-8 py-6 text-emerald-600 font-black">₦{(tx.total - (tx.totalCost || 0)).toLocaleString()}</td>
                             <td className="px-8 py-6">
                                <span className="px-3 py-1 bg-emerald-100 text-emerald-600 rounded-lg">{(( (tx.total - (tx.totalCost || 0)) / (tx.total || 1) ) * 100).toFixed(1)}%</span>
                             </td>
                          </tr>
                        ))}
                     </tbody>
                   </table>
                </div>
              </div>
            </div>
          )}
          
          {/* Sales History Page */}
          {activeTab === 'Transactions' && (
             <div className="max-w-7xl mx-auto animate-in fade-in slide-in-from-right-4 duration-500">
                <div className="bg-white rounded-[3rem] border border-slate-200 overflow-hidden shadow-sm">
                   <table className="w-full text-left min-w-[900px]">
                      <thead className="bg-slate-50 border-b border-slate-100">
                         <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            <th className="px-10 py-8">Timestamp</th>
                            <th className="px-10 py-8">Order ID</th>
                            <th className="px-10 py-8">Items Purchased</th>
                            <th className="px-10 py-8">Total Sale</th>
                            <th className="px-10 py-8 text-right">Receipt</th>
                         </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {transactions.map(tx => (
                          <tr key={tx.id} className="hover:bg-blue-50/20 transition-all">
                             <td className="px-10 py-8 text-sm font-bold text-slate-600">{new Date(tx.timestamp).toLocaleString()}</td>
                             <td className="px-10 py-8 font-black text-slate-900">#{tx.id}</td>
                             <td className="px-10 py-8 text-xs text-slate-500 max-w-[300px] truncate">{tx.items.map(i => `${i.name} (x${i.quantity})`).join(', ')}</td>
                             <td className="px-10 py-8 font-black text-blue-600">₦{tx.total.toLocaleString()}</td>
                             <td className="px-10 py-8 text-right">
                                <button onClick={() => setReceiptToShow(tx)} className="p-3 bg-slate-100 text-slate-500 rounded-xl hover:bg-blue-600 hover:text-white transition-all">
                                   <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>
                                </button>
                             </td>
                          </tr>
                        ))}
                      </tbody>
                   </table>
                </div>
             </div>
          )}
        </div>

        {/* Overlays */}
        {isBasketOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 md:p-10 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300">
            <div className="w-full max-w-4xl h-full max-h-[850px] bg-white rounded-[3.5rem] shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300">
               <div className="p-10 border-b border-slate-100 flex items-center justify-between shrink-0">
                  <h3 className="text-3xl font-black uppercase">Current Basket</h3>
                  <button onClick={() => setIsBasketOpen(false)} className="p-4 bg-slate-100 rounded-2xl hover:bg-rose-500 hover:text-white transition-all"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
               </div>
               <div className="flex-1 p-10 overflow-y-auto custom-scrollbar space-y-6">
                  {cart.map(item => (
                    <div key={item.id} className="p-8 bg-slate-50 border border-slate-200 rounded-[2.5rem] flex flex-wrap items-center gap-6">
                       <div className="flex-1 min-w-[200px]">
                          <p className="text-lg font-black">{item.name}</p>
                          <p className="text-[10px] font-bold text-slate-400 mt-2">SKU: {item.sku}</p>
                       </div>
                       <div className="flex items-center gap-3 p-2 bg-white rounded-2xl border">
                          <button onClick={() => updateCartQty(item.id, -1)} className="w-10 h-10 flex items-center justify-center bg-slate-50 rounded-xl font-black">-</button>
                          <span className="w-10 text-center font-black">{item.cartQuantity}</span>
                          <button onClick={() => updateCartQty(item.id, 1)} className="w-10 h-10 flex items-center justify-center bg-slate-50 rounded-xl font-black">+</button>
                       </div>
                       <div className="text-right min-w-[120px] font-black text-xl">₦{(item.price * item.cartQuantity).toLocaleString()}</div>
                       <button onClick={() => removeFromCart(item.id)} className="p-4 text-slate-300 hover:text-rose-500 transition-colors"><ICONS.Trash /></button>
                    </div>
                  ))}
               </div>
               <div className="p-10 bg-slate-50 border-t flex flex-col md:flex-row md:items-end justify-between gap-10">
                  <div>
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">Total Payable</p>
                    <p className="text-6xl font-black text-blue-600 tracking-tighter leading-none">₦{cartTotal.toLocaleString()}</p>
                  </div>
                  <button onClick={completeCheckout} disabled={cart.length === 0} className="px-16 py-6 bg-slate-900 text-white rounded-[2rem] font-black uppercase tracking-widest shadow-2xl hover:bg-blue-600 transition-all active:scale-95 disabled:opacity-20">Checkout Now</button>
               </div>
            </div>
          </div>
        )}

        {/* Receipt Display Overlay */}
        {receiptToShow && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl animate-in fade-in duration-300">
            <div className="w-full max-w-md bg-white rounded-[3rem] p-10 shadow-2xl animate-in zoom-in-95 duration-300">
              <div className="text-center mb-8 border-b border-slate-100 pb-8">
                <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 text-white">
                  <ICONS.Register />
                </div>
                <h3 className="text-2xl font-black uppercase tracking-tight">{config.supermarketName}</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Transaction Receipt</p>
              </div>
              
              <div className="space-y-4 mb-8">
                <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase tracking-widest">
                  <span>Order ID: #{receiptToShow.id}</span>
                  <span>{new Date(receiptToShow.timestamp).toLocaleDateString()}</span>
                </div>
                <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                  {receiptToShow.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span className="font-bold text-slate-600">{item.name} x{item.quantity}</span>
                      <span className="font-black">₦{(item.price * item.quantity).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t-2 border-dashed border-slate-100 pt-6 mb-10">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Total Paid</span>
                  <span className="text-3xl font-black text-blue-600">₦{receiptToShow.total.toLocaleString()}</span>
                </div>
              </div>

              <button 
                onClick={() => setReceiptToShow(null)}
                className="w-full py-5 bg-slate-900 text-white rounded-3xl font-black text-sm uppercase tracking-widest hover:bg-blue-600 transition-all active:scale-95"
              >
                Close Receipt
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
    <div className={`p-8 bg-white border-2 rounded-[3.5rem] transition-all duration-500 ${alert ? 'border-rose-100 shadow-2xl shadow-rose-600/10' : 'border-slate-100 shadow-sm hover:shadow-xl group'}`}>
      <div className="flex items-center justify-between mb-8">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest truncate">{title}</span>
        <div className={`p-3.5 rounded-2xl ${alert ? 'bg-rose-500 text-white' : 'bg-slate-50 text-slate-400 group-hover:bg-blue-600 group-hover:text-white transition-all'}`}>{icon}</div>
      </div>
      <div className={`text-4xl font-black tracking-tighter truncate ${alert ? 'text-rose-600' : colorMap[color as keyof typeof colorMap]}`}>{value}</div>
      {alert && <p className="mt-4 text-[9px] font-black text-rose-500 uppercase tracking-[0.2em] animate-pulse">Critical Review</p>}
    </div>
  );
};

export default App;
