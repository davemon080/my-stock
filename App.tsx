
import React, { useState, useMemo, useEffect } from 'react';
import { Product, UserRole, InventoryStats, Transaction, TransactionItem, AppConfig, Seller, Branch } from './types.ts';
import { INITIAL_PRODUCTS, ICONS } from './constants.tsx';
import Fuse from 'fuse.js';
import ProductModal from './components/ProductModal.tsx';
import { getInventoryInsights } from './services/geminiService.ts';

interface CartItem extends Product {
  cartQuantity: number;
}

type DateFilter = 'Today' | '7D' | '30D' | 'All';

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

const App: React.FC = () => {
  // Authentication State
  const [currentUser, setCurrentUser] = useState<{ role: UserRole; name: string; branchId: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'Dashboard' | 'Inventory' | 'Register' | 'Transactions' | 'Revenue' | 'Settings'>('Dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isBasketOpen, setIsBasketOpen] = useState(false);
  const [receiptToShow, setReceiptToShow] = useState<Transaction | null>(null);
  const [revenueFilter, setRevenueFilter] = useState<DateFilter>('All');
  
  // Custom UI States
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void } | null>(null);

  // Helper for Toasts
  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id));
    }, 4000);
  };

  // App Config & Multi-Branch Data Persistence
  const [config, setConfig] = useState<AppConfig>(() => {
    try {
      const saved = localStorage.getItem('sm_v17_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && Array.isArray(parsed.branches) && parsed.branches.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.error("Failed to load config from storage:", e);
    }
    
    const mainBranchId = 'br_main';
    return {
      supermarketName: 'SUPERMART PRO',
      logoUrl: '',
      adminPassword: 'admin',
      sellers: [],
      branches: [{
        id: mainBranchId,
        name: 'Main Branch',
        location: 'HQ',
        products: INITIAL_PRODUCTS,
        transactions: [],
        createdAt: new Date().toISOString()
      }]
    };
  });

  // Selected Branch Context
  const [selectedBranchId, setSelectedBranchId] = useState<string>(config.branches[0].id);

  const activeBranch = useMemo(() => 
    config.branches.find(b => b.id === selectedBranchId) || config.branches[0],
    [config.branches, selectedBranchId]
  );

  const products = activeBranch.products || [];
  const transactions = activeBranch.transactions || [];

  // Persistence with Quota Error Handling
  useEffect(() => {
    try {
      localStorage.setItem('sm_v17_config', JSON.stringify(config));
    } catch (e) {
      if (e instanceof DOMException && e.name === 'QuotaExceededError') {
        showToast("Storage quota exceeded. Large files (like the logo) or excessive history may prevent saving.", "error");
      } else {
        console.error("Storage error:", e);
      }
    }
  }, [config]);

  // Login Logic
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginRole, setLoginRole] = useState<UserRole>('Seller');
  const [loginError, setLoginError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    if (loginRole === 'Admin') {
      if (loginPassword === config.adminPassword) {
        setCurrentUser({ role: 'Admin', name: 'Super Admin', branchId: config.branches[0].id });
        setSelectedBranchId(config.branches[0].id);
        showToast("System Access Granted", "success");
      } else {
        setLoginError('Invalid Administrator Pin');
      }
    } else {
      const seller = config.sellers.find(s => s.email === loginEmail && s.password === loginPassword);
      if (seller) {
        setCurrentUser({ role: 'Seller', name: seller.name, branchId: seller.branchId });
        setSelectedBranchId(seller.branchId);
        showToast(`Welcome, ${seller.name}`, "success");
      } else {
        setLoginError('Invalid Seller Credentials');
      }
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 500 * 1024) {
        showToast("Logo too large! Please use an image smaller than 500KB.", "error");
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        setConfig(prev => ({ ...prev, logoUrl: reader.result as string }));
        showToast("Logo updated", "success");
      };
      reader.readAsDataURL(file);
    }
  };

  const updateBranchData = (updatedBranch: Branch) => {
    setConfig(prev => ({
      ...prev,
      branches: prev.branches.map(b => b.id === updatedBranch.id ? updatedBranch : b)
    }));
  };

  // Product Operations
  const [searchTerm, setSearchTerm] = useState('');
  const [searchTermTransactions, setSearchTermTransactions] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);

  const updateCartQty = (id: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.id === id) {
        return { ...item, cartQuantity: Math.max(0, item.cartQuantity + delta) };
      }
      return item;
    }).filter(item => item.cartQuantity > 0));
  };

  const removeFromCart = (id: string) => {
    setCart(prev => prev.filter(item => item.id !== id));
  };

  const cartTotal = useMemo(() => cart.reduce((acc, item) => acc + (item.price * item.cartQuantity), 0), [cart]);

  const todaySales = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return transactions
      .filter(t => new Date(t.timestamp) >= today)
      .reduce((acc, t) => acc + t.total, 0);
  }, [transactions]);

  const handleSaveProduct = (data: Omit<Product, 'id' | 'lastUpdated' | 'sku'>) => {
    const now = new Date().toISOString();
    let newProducts = [...products];
    if (editingProduct) {
      newProducts = newProducts.map(p => p.id === editingProduct.id ? { ...p, ...data, lastUpdated: now } : p);
      showToast("Inventory updated", "success");
    } else {
      const sku = (data.name.substring(0, 2).toUpperCase()) + Math.floor(1000 + Math.random() * 9000);
      newProducts.push({ ...data, id: Math.random().toString(36).substr(2, 9), sku, lastUpdated: now });
      showToast("SKU created successfully", "success");
    }
    updateBranchData({ ...activeBranch, products: newProducts });
    setIsModalOpen(false); setEditingProduct(null);
  };

  const deleteProduct = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Remove SKU",
      message: "Are you sure you want to permanently remove this product from the current branch?",
      onConfirm: () => {
        updateBranchData({ ...activeBranch, products: products.filter(p => p.id !== id) });
        showToast("Product removed", "info");
        setConfirmModal(null);
      }
    });
  };

  // Register Operations
  const addToCart = (product: Product) => {
    setCart(prev => {
      const ex = prev.find(i => i.id === product.id);
      if (ex) return prev.map(i => i.id === product.id ? { ...i, cartQuantity: i.cartQuantity + 1 } : i);
      return [...prev, { ...product, cartQuantity: 1 }];
    });
  };

  const completeCheckout = () => {
    const total = cart.reduce((acc, i) => acc + (i.price * i.cartQuantity), 0);
    const totalCost = cart.reduce((acc, i) => acc + (i.costPrice * i.cartQuantity), 0);
    const tx: Transaction = {
      id: Math.random().toString(36).substr(2, 6).toUpperCase(),
      items: cart.map(i => ({ 
        productId: i.id,
        name: i.name,
        sku: i.sku,
        price: i.price,
        costPriceAtSale: i.costPrice,
        quantity: i.cartQuantity
      })),
      total, 
      totalCost, 
      type: 'SALE', 
      timestamp: new Date().toISOString()
    };
    const updatedProducts = products.map(p => {
      const inCart = cart.find(c => c.id === p.id);
      return inCart ? { ...p, quantity: Math.max(0, p.quantity - inCart.cartQuantity) } : p;
    });
    updateBranchData({ ...activeBranch, products: updatedProducts, transactions: [tx, ...transactions] });
    setCart([]); setIsBasketOpen(false); setReceiptToShow(tx);
    showToast("Transaction Recorded", "success");
  };

  const handlePrintReceipt = () => {
    window.print();
  };

  const handleQuickPrint = (t: Transaction) => {
    setReceiptToShow(t);
    // Use a small delay to ensure the DOM is updated before printing
    setTimeout(() => {
      window.print();
    }, 100);
  };

  // Settings: Branch Registration
  const handleRegisterBranch = (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const fd = new FormData(form);
    const name = fd.get('branchName') as string;
    const loc = fd.get('branchLoc') as string;
    
    if (!name || !loc) return;

    const newBranch: Branch = {
      id: 'br_' + Math.random().toString(36).substr(2, 5),
      name, 
      location: loc,
      products: INITIAL_PRODUCTS.map(p => ({ ...p, id: Math.random().toString(36).substr(2, 9) })),
      transactions: [], 
      createdAt: new Date().toISOString()
    };
    
    setConfig(prev => ({ ...prev, branches: [...prev.branches, newBranch] }));
    form.reset();
    showToast(`Branch "${name}" online!`, "success");
  };

  // Dashboard Calculations
  const stats = useMemo((): InventoryStats => ({
    totalItems: products.length,
    totalValue: products.reduce((acc, p) => acc + (p.price * (p.quantity || 0)), 0),
    totalCostValue: products.reduce((acc, p) => acc + (p.costPrice * (p.quantity || 0)), 0),
    lowStockCount: products.filter(p => p.quantity > 0 && p.quantity <= p.minThreshold).length,
    outOfStockCount: products.filter(p => p.quantity <= 0).length,
  }), [products]);

  const financialSummary = useMemo(() => {
    const filtered = revenueFilter === 'All' ? transactions : transactions.filter(t => {
      const cutoff = new Date();
      if (revenueFilter === 'Today') cutoff.setHours(0, 0, 0, 0);
      else if (revenueFilter === '7D') cutoff.setDate(cutoff.getDate() - 7);
      else if (revenueFilter === '30D') cutoff.setDate(cutoff.getDate() - 30);
      return new Date(t.timestamp) >= cutoff;
    });
    const rev = filtered.reduce((acc, t) => acc + t.total, 0);
    const cost = filtered.reduce((acc, t) => acc + t.totalCost, 0);
    return { rev, cost, profit: rev - cost, margin: rev > 0 ? ((rev - cost) / rev) * 100 : 0 };
  }, [transactions, revenueFilter]);

  const fuse = useMemo(() => new Fuse(products, { keys: ['name', 'sku'], threshold: 0.3 }), [products]);
  const filteredProducts = useMemo(() => searchTerm ? fuse.search(searchTerm).map(r => r.item) : products, [products, searchTerm, fuse]);

  const filteredTransactions = useMemo(() => {
    if (!searchTermTransactions) return transactions;
    const lowerSearch = searchTermTransactions.toLowerCase();
    return transactions.filter(t => 
      t.id.toLowerCase().includes(lowerSearch) || 
      t.items.some(item => item.name.toLowerCase().includes(lowerSearch) || item.sku.toLowerCase().includes(lowerSearch))
    );
  }, [transactions, searchTermTransactions]);

  if (!currentUser) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-20">
          <div className="absolute -top-[10%] -left-[10%] w-[50%] h-[50%] bg-blue-600 rounded-full blur-[150px]"></div>
          <div className="absolute -bottom-[10%] -right-[10%] w-[50%] h-[50%] bg-emerald-600 rounded-full blur-[150px]"></div>
        </div>
        <div className="w-full max-w-md bg-white rounded-[3rem] p-10 shadow-2xl relative z-10 animate-in fade-in zoom-in-95 duration-500">
          <div className="text-center mb-10">
            {config.logoUrl ? (
              <img src={config.logoUrl} className="w-20 h-20 mx-auto mb-6 rounded-2xl object-cover shadow-lg" />
            ) : (
              <div className="w-20 h-20 bg-blue-600 rounded-[2rem] flex items-center justify-center mx-auto mb-6 text-white shadow-xl shadow-blue-600/30">
                <ICONS.Inventory />
              </div>
            )}
            <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase leading-none">{config.supermarketName}</h1>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-4">Enterprise POS Terminal</p>
          </div>
          <div className="flex bg-slate-100 p-1.5 rounded-2xl mb-8">
            {(['Seller', 'Admin'] as UserRole[]).map(r => (
              <button key={r} onClick={() => setLoginRole(r)} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${loginRole === r ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}>
                {r}
              </button>
            ))}
          </div>
          <form onSubmit={handleLogin} className="space-y-6">
            {loginRole === 'Seller' && (
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Work Email</label>
                <input type="email" required className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-600 outline-none font-bold" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} />
              </div>
            )}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{loginRole === 'Admin' ? 'Admin Pin' : 'Staff Access Pin'}</label>
              <input type="password" required className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-600 outline-none font-bold" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} />
            </div>
            {loginError && <p className="text-rose-500 text-[10px] font-black uppercase text-center animate-bounce">{loginError}</p>}
            <button type="submit" className="w-full py-5 bg-blue-600 text-white rounded-3xl font-black uppercase tracking-widest shadow-xl shadow-blue-600/30 hover:bg-blue-700 transition-all">Sign In</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden font-['Plus_Jakarta_Sans']">
      {/* Custom Browser Popups: Toasts */}
      <div className="fixed top-6 left-1/2 -translate-x-1/2 z-[100] flex flex-col gap-3 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`px-6 py-3 rounded-2xl shadow-2xl font-black text-[10px] uppercase tracking-widest animate-in slide-in-from-top fade-in duration-300 pointer-events-auto flex items-center gap-3 border ${
            t.type === 'success' ? 'bg-emerald-600 text-white border-emerald-500' :
            t.type === 'error' ? 'bg-rose-600 text-white border-rose-500' : 'bg-blue-600 text-white border-blue-500'
          }`}>
            <span>{t.message}</span>
            <button onClick={() => setToasts(prev => prev.filter(toast => toast.id !== t.id))} className="ml-2 hover:opacity-50">✕</button>
          </div>
        ))}
      </div>

      {/* Custom Confirmation Dialog */}
      {confirmModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
           <div className="w-full max-w-sm bg-white rounded-[2.5rem] p-10 shadow-2xl animate-in zoom-in-95 duration-200">
              <h3 className="text-xl font-black text-slate-900 mb-4 uppercase">{confirmModal.title}</h3>
              <p className="text-sm font-bold text-slate-500 mb-10 leading-relaxed">{confirmModal.message}</p>
              <div className="flex gap-4">
                 <button onClick={() => setConfirmModal(null)} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest">Cancel</button>
                 <button onClick={confirmModal.onConfirm} className="flex-1 py-4 bg-rose-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-700 transition-colors shadow-lg shadow-rose-600/20">Confirm</button>
              </div>
           </div>
        </div>
      )}

      {/* Sidebar Navigation */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-72 bg-slate-950 text-white flex flex-col transition-all duration-300 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="p-8 flex items-center justify-between border-b border-white/5 shrink-0">
          <div className="flex items-center gap-4">
            {config.logoUrl ? (
              <img src={config.logoUrl} className="w-10 h-10 rounded-xl object-cover" />
            ) : (
              <div className="p-3 bg-blue-600 rounded-2xl text-white"><ICONS.Inventory /></div>
            )}
            <div className="min-w-0">
              <h1 className="text-lg font-black italic tracking-tighter truncate leading-tight uppercase">{config.supermarketName}</h1>
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{activeBranch.name}</p>
            </div>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-2 text-white/50 hover:text-white transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
        <nav className="flex-1 p-6 space-y-2 overflow-y-auto custom-scrollbar">
          {[
            { id: 'Dashboard', icon: <ICONS.Dashboard />, label: 'Analytics' },
            { id: 'Inventory', icon: <ICONS.Inventory />, label: 'Stock Manager' },
            { id: 'Register', icon: <ICONS.Register />, label: 'Cashier Hub' },
            { id: 'Transactions', icon: <ICONS.Register />, label: 'Receipt Logs' },
            { id: 'Revenue', icon: <ICONS.Revenue />, label: 'Financials', adminOnly: true },
            { id: 'Settings', icon: <ICONS.Dashboard />, label: 'System Control', adminOnly: true }
          ].map(item => (
            (!item.adminOnly || currentUser.role === 'Admin') && (
              <button key={item.id} onClick={() => { setActiveTab(item.id as any); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all font-bold text-sm ${activeTab === item.id ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                {item.icon} {item.label}
              </button>
            )
          ))}
        </nav>
        <div className="p-6 shrink-0 border-t border-white/5">
           <div className="p-5 bg-white/5 rounded-3xl mb-4">
              <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1">Authenticated</p>
              <p className="text-sm font-black truncate">{currentUser.name}</p>
           </div>
           <button onClick={() => setCurrentUser(null)} className="w-full py-3 bg-rose-500/10 text-rose-500 text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-rose-500 hover:text-white transition-all">Logout</button>
        </div>
      </aside>

      {isSidebarOpen && (
        <div className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm lg:hidden animate-in fade-in duration-300" onClick={() => setIsSidebarOpen(false)} />
      )}

      {/* Main Context */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-20 bg-white border-b border-slate-200 px-6 sm:px-10 flex items-center justify-between sticky top-0 z-30 shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2.5 bg-slate-100 text-slate-600 rounded-xl active:scale-95 transition-all">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
            </button>
            <h2 className="text-xl font-black uppercase tracking-tight hidden sm:block">{activeTab}</h2>
          </div>
          
          <div className="flex items-center gap-4">
            {currentUser.role === 'Admin' && (
              <div className="relative group">
                <select 
                  value={selectedBranchId}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                  className="appearance-none bg-blue-50 border-2 border-blue-100 rounded-2xl px-6 py-2.5 pr-12 text-[10px] font-black uppercase tracking-widest text-blue-700 outline-none focus:border-blue-600 cursor-pointer shadow-sm transition-all"
                >
                  {config.branches.map(b => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
                <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-blue-400">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6"/></svg>
                </div>
              </div>
            )}
            
            {activeTab === 'Register' && cart.length > 0 && (
              <button onClick={() => setIsBasketOpen(true)} className="relative p-3 bg-slate-900 text-white rounded-2xl shadow-lg active:scale-95 transition-all hover:bg-blue-600">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>
                <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[10px] font-black w-6 h-6 flex items-center justify-center rounded-full border-2 border-white shadow-md animate-in zoom-in-50">
                  {cart.length}
                </span>
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 sm:p-10 custom-scrollbar">
          {activeTab === 'Dashboard' && (
            <div className="space-y-10 max-w-7xl mx-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title="Daily Revenue" value={`₦${todaySales.toLocaleString()}`} icon={<ICONS.Register />} color="emerald" />
                <StatCard title="Asset Value" value={`₦${stats.totalValue.toLocaleString()}`} icon={<ICONS.Inventory />} color="blue" />
                <StatCard title="Low Stock Alerts" value={stats.lowStockCount} icon={<ICONS.Alert />} color="amber" alert={stats.lowStockCount > 0} />
                <StatCard title="Active SKUs" value={stats.totalItems} icon={<ICONS.Dashboard />} color="slate" />
              </div>
              <div className="bg-white rounded-[3rem] p-10 border border-slate-200 shadow-sm">
                <h3 className="text-xl font-black mb-8 uppercase flex items-center gap-3"><span className="p-3 bg-blue-600 text-white rounded-2xl"><ICONS.Dashboard /></span>Operational Summary: {activeBranch.name}</h3>
                <div className="p-8 bg-slate-50 rounded-[2rem] text-sm text-slate-700 italic border-l-4 border-blue-600 mb-8 leading-relaxed shadow-inner">"Branch analytics confirm independent activity logs for {activeBranch.name}. Local demand for essential goods remains steady."</div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                   {['Stock fresh inventory', 'Audit price variations', 'Conduct staff review'].map((rec, i) => (
                     <div key={i} className="p-6 bg-white border border-slate-100 rounded-3xl hover:border-blue-500 transition-all flex items-center gap-4 group">
                        <div className="w-10 h-10 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center font-black group-hover:bg-blue-600 group-hover:text-white transition-colors">{i+1}</div>
                        <span className="font-bold text-slate-600 text-xs uppercase tracking-wider">{rec}</span>
                     </div>
                   ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Inventory' && (
             <div className="max-w-7xl mx-auto space-y-6">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                   <div className="relative w-full max-w-md">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><ICONS.Search /></span>
                      <input type="text" placeholder="Filter active stock..." className="w-full pl-12 pr-6 py-3 bg-white border-2 border-slate-100 rounded-2xl focus:border-blue-600 outline-none font-bold shadow-sm transition-all" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                   </div>
                   {currentUser.role === 'Admin' && (
                     <button onClick={() => { setEditingProduct(null); setIsModalOpen(true); }} className="w-full sm:w-auto px-8 py-3 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-blue-600/30 active:scale-95 transition-all">Add Product</button>
                   )}
                </div>
                <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm overflow-x-auto">
                   <table className="w-full text-left min-w-[800px]">
                      <thead className="bg-slate-50 border-b">
                         <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            <th className="px-10 py-6">Item</th>
                            <th className="px-10 py-6">SKU</th>
                            <th className="px-10 py-6 text-right">Selling Price</th>
                            <th className="px-10 py-6 text-center">In Stock</th>
                            <th className="px-10 py-6 text-right">Actions</th>
                         </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                         {filteredProducts.map(p => (
                           <tr key={p.id} className="hover:bg-blue-50/10 transition-all group">
                              <td className="px-10 py-6 font-black text-slate-900">{p.name}</td>
                              <td className="px-10 py-6 font-mono text-[10px] text-slate-500">{p.sku}</td>
                              <td className="px-10 py-6 text-right font-black">₦{p.price.toLocaleString()}</td>
                              <td className="px-10 py-6 text-center">
                                 <span className={`px-3 py-1 rounded-xl text-[9px] font-black ${p.quantity <= p.minThreshold ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>{p.quantity} Units</span>
                              </td>
                              <td className="px-10 py-6 text-right">
                                 <div className="flex justify-end gap-2">
                                    <button onClick={() => { setEditingProduct(p); setIsModalOpen(true); }} className="p-2.5 bg-slate-100 text-slate-400 rounded-xl hover:bg-blue-600 hover:text-white transition-all"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg></button>
                                    {currentUser.role === 'Admin' && <button onClick={() => deleteProduct(p.id)} className="p-2.5 bg-slate-100 text-slate-400 rounded-xl hover:bg-rose-600 hover:text-white transition-all"><ICONS.Trash /></button>}
                                 </div>
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
               <div className="relative max-w-2xl mx-auto">
                  <span className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400"><ICONS.Search /></span>
                  <input type="text" placeholder="Search products for sales..." className="w-full pl-16 pr-8 py-5 text-md font-bold bg-white border-2 border-transparent rounded-[2.5rem] focus:border-blue-600 outline-none shadow-sm" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
               </div>
               <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                 {filteredProducts.map(p => (
                   <button key={p.id} disabled={p.quantity <= 0} onClick={() => addToCart(p)} className="p-6 bg-white border-2 border-transparent rounded-[2.5rem] text-left hover:border-blue-600 hover:shadow-xl transition-all group relative active:scale-95 shadow-sm overflow-hidden">
                      <div className="text-xl font-black text-slate-900 mb-2 leading-none">₦{p.price.toLocaleString()}</div>
                      <h4 className="text-xs font-black text-slate-800 mb-1 leading-tight line-clamp-2 min-h-[1.5rem] uppercase">{p.name}</h4>
                      <div className={`mt-4 px-2 py-0.5 rounded-lg text-[8px] font-black w-fit ${p.quantity <= p.minThreshold ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>{p.quantity} In Stock</div>
                      {p.quantity <= 0 && <div className="absolute inset-0 bg-white/70 flex items-center justify-center font-black text-rose-600 uppercase tracking-widest text-[10px]">OUT OF STOCK</div>}
                   </button>
                 ))}
               </div>
            </div>
          )}

          {activeTab === 'Settings' && currentUser.role === 'Admin' && (
            <div className="max-w-4xl mx-auto space-y-10 pb-20">
               <div className="bg-white rounded-[3rem] p-10 border border-slate-200 shadow-sm">
                  <h3 className="text-2xl font-black mb-8 uppercase tracking-tight flex items-center gap-3">
                    <span className="p-3 bg-indigo-100 text-indigo-600 rounded-2xl"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/></svg></span>
                    Network Management
                  </h3>
                  <form onSubmit={handleRegisterBranch} className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
                    <input name="branchName" required placeholder="Branch Name" className="px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-bold focus:border-blue-600 text-sm" />
                    <input name="branchLoc" required placeholder="Physical Location" className="px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none font-bold focus:border-blue-600 text-sm" />
                    <button type="submit" className="sm:col-span-2 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-blue-600 transition-all active:scale-95">Deploy New Branch</button>
                  </form>
                  <div className="space-y-3">
                     {config.branches.map(b => (
                       <div key={b.id} className="p-6 bg-slate-50 rounded-[2rem] border border-slate-100 flex items-center justify-between shadow-sm">
                          <div>
                             <p className="font-black text-slate-900">{b.name}</p>
                             <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{b.location} • Established {new Date(b.createdAt).toLocaleDateString()}</p>
                          </div>
                          <span className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase ${b.id === selectedBranchId ? 'bg-blue-100 text-blue-600 shadow-sm' : 'bg-slate-200 text-slate-500'}`}>{b.id === selectedBranchId ? 'Active Environment' : 'Standby'}</span>
                       </div>
                     ))}
                  </div>
               </div>

               <div className="bg-white rounded-[3rem] p-10 border border-slate-200 shadow-sm">
                  <h3 className="text-2xl font-black mb-8 uppercase tracking-tight">Staff Deployment</h3>
                  <form onSubmit={(e) => {
                    e.preventDefault();
                    const fd = new FormData(e.target as HTMLFormElement);
                    const name = fd.get('name') as string;
                    const newSeller: Seller = {
                      id: Math.random().toString(36).substr(2, 9),
                      name,
                      email: fd.get('email') as string,
                      password: fd.get('password') as string,
                      branchId: fd.get('branch') as string
                    };
                    setConfig(prev => ({ ...prev, sellers: [...prev.sellers, newSeller] }));
                    (e.target as HTMLFormElement).reset();
                    showToast(`${name} assigned to branch`, "success");
                  }} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <input name="name" required placeholder="Staff Full Name" className="px-6 py-4 bg-slate-50 border-2 rounded-2xl text-sm font-bold" />
                    <input name="email" required type="email" placeholder="Staff Email" className="px-6 py-4 bg-slate-50 border-2 rounded-2xl text-sm font-bold" />
                    <input name="password" required placeholder="Staff Access Pin" className="px-6 py-4 bg-slate-50 border-2 rounded-2xl text-sm font-bold" />
                    <select name="branch" className="px-6 py-4 bg-slate-50 border-2 rounded-2xl text-sm font-bold">
                       {config.branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <button type="submit" className="sm:col-span-2 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] active:scale-95 transition-all">Grant Workspace Access</button>
                  </form>
               </div>

               <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  <div className="bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm">
                     <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Global Brand</h4>
                     <input type="text" className="w-full px-5 py-3.5 bg-slate-50 border-2 rounded-xl text-sm font-bold mb-4" value={config.supermarketName} onChange={e => setConfig({...config, supermarketName: e.target.value})} />
                     <div className="flex items-center gap-4">
                        <input type="file" id="up-lg" className="hidden" onChange={handleLogoUpload} />
                        <label htmlFor="up-lg" className="flex-1 text-center py-3.5 bg-slate-100 rounded-xl text-[9px] font-black uppercase cursor-pointer hover:bg-slate-200 transition-colors">Update Identity Logo</label>
                        {config.logoUrl && <img src={config.logoUrl} className="w-12 h-12 rounded-xl object-cover" />}
                     </div>
                  </div>
                  <div className="bg-white rounded-[2.5rem] p-8 border border-slate-200 shadow-sm">
                     <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Admin Pin Security</h4>
                     <input type="password" placeholder="System Pin" className="w-full px-5 py-3.5 bg-slate-50 border-2 rounded-xl text-sm font-bold" value={config.adminPassword} onChange={e => {
                        setConfig({...config, adminPassword: e.target.value});
                     }} />
                     <p className="mt-4 text-[8px] font-bold text-slate-400 italic">Updating this credential affects all administrative access points across the grid.</p>
                  </div>
               </div>
            </div>
          )}

          {activeTab === 'Revenue' && currentUser.role === 'Admin' && (
             <div className="max-w-7xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                   <StatCard title="Performance Value" value={`₦${financialSummary.rev.toLocaleString()}`} icon={<ICONS.Revenue />} color="emerald" />
                   <StatCard title="Capital Costs" value={`₦${financialSummary.cost.toLocaleString()}`} icon={<ICONS.Inventory />} color="amber" />
                   <StatCard title="Net Gains" value={`₦${financialSummary.profit.toLocaleString()}`} icon={<ICONS.Dashboard />} color="blue" />
                   <StatCard title="Profit Efficiency" value={`${financialSummary.margin.toFixed(1)}%`} icon={<ICONS.Register />} color="slate" />
                </div>
                <div className="bg-white rounded-[3rem] p-10 border border-slate-200 shadow-sm overflow-hidden">
                   <div className="flex flex-col lg:flex-row justify-between items-center mb-8 gap-6">
                      <h3 className="text-xl font-black uppercase tracking-tight">{activeBranch.name} Ledger</h3>
                      <div className="flex bg-slate-100 p-1 rounded-xl">
                         {(['All', 'Today', '7D', '30D'] as DateFilter[]).map(f => (
                           <button key={f} onClick={() => setRevenueFilter(f)} className={`px-6 py-2 rounded-lg text-[9px] font-black uppercase transition-all ${revenueFilter === f ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-400'}`}>{f}</button>
                         ))}
                      </div>
                   </div>
                   <div className="overflow-x-auto custom-scrollbar">
                      <table className="w-full text-left min-w-[700px]">
                         <thead className="bg-slate-50 border-b">
                            <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                               <th className="px-8 py-5">Timestamp</th>
                               <th className="px-8 py-5">Sale Value</th>
                               <th className="px-8 py-5">Branch Gain</th>
                               <th className="px-8 py-5">Margin</th>
                            </tr>
                         </thead>
                         <tbody className="divide-y divide-slate-100">
                            {transactions.map(t => (
                              <tr key={t.id} className="text-xs hover:bg-slate-50 transition-colors">
                                 <td className="px-8 py-5 font-bold text-slate-500">{new Date(t.timestamp).toLocaleString()}</td>
                                 <td className="px-8 py-5 font-black">₦{t.total.toLocaleString()}</td>
                                 <td className="px-8 py-5 font-black text-emerald-600">₦{(t.total - t.totalCost).toLocaleString()}</td>
                                 <td className="px-8 py-5">
                                    <span className="px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-lg font-bold">{(((t.total - t.totalCost) / (t.total || 1)) * 100).toFixed(1)}%</span>
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
            <div className="max-w-7xl mx-auto space-y-6">
               <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="relative w-full max-w-md">
                     <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><ICONS.Search /></span>
                     <input type="text" placeholder="Search logs by ID or Item..." className="w-full pl-12 pr-6 py-3 bg-white border-2 border-slate-100 rounded-2xl focus:border-blue-600 outline-none font-bold shadow-sm transition-all" value={searchTermTransactions} onChange={e => setSearchTermTransactions(e.target.value)} />
                  </div>
               </div>
               <div className="bg-white rounded-[3rem] border border-slate-200 overflow-hidden shadow-sm overflow-x-auto">
                  <table className="w-full text-left min-w-[800px]">
                     <thead className="bg-slate-50 border-b">
                        <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                           <th className="px-10 py-6">Ref ID</th>
                           <th className="px-10 py-6">Timestamp</th>
                           <th className="px-10 py-6">Total Value</th>
                           <th className="px-10 py-6 text-right">Invoice / Print</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-100">
                        {filteredTransactions.map(t => (
                          <tr key={t.id} className="hover:bg-blue-50/10 transition-colors">
                             <td className="px-10 py-6 font-black text-slate-900">#{t.id}</td>
                             <td className="px-10 py-6 text-xs text-slate-500 font-bold">{new Date(t.timestamp).toLocaleString()}</td>
                             <td className="px-10 py-6 font-black text-blue-600">₦{t.total.toLocaleString()}</td>
                             <td className="px-10 py-6 text-right">
                                <div className="flex justify-end gap-2">
                                  <button onClick={() => setReceiptToShow(t)} title="View Receipt" className="p-2.5 bg-slate-100 text-slate-500 rounded-xl hover:bg-blue-600 hover:text-white transition-all active:scale-95 shadow-sm">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                                  </button>
                                  <button onClick={() => handleQuickPrint(t)} title="Direct Print" className="p-2.5 bg-slate-100 text-slate-500 rounded-xl hover:bg-emerald-600 hover:text-white transition-all active:scale-95 shadow-sm">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>
                                  </button>
                                </div>
                             </td>
                          </tr>
                        ))}
                        {filteredTransactions.length === 0 && (
                          <tr>
                            <td colSpan={4} className="py-20 text-center text-slate-300 font-black uppercase italic tracking-widest">No matching transactions found</td>
                          </tr>
                        )}
                     </tbody>
                  </table>
               </div>
            </div>
          )}
        </div>

        {isBasketOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300">
            <div className="w-full max-w-4xl h-full sm:max-h-[850px] bg-white rounded-none sm:rounded-[4rem] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-300">
               <div className="p-8 sm:p-12 border-b border-slate-100 flex items-center justify-between shrink-0">
                  <h3 className="text-2xl sm:text-3xl font-black uppercase tracking-tighter">POS Terminal Basket</h3>
                  <button onClick={() => setIsBasketOpen(false)} className="p-4 bg-slate-50 rounded-2xl active:scale-95 transition-all hover:bg-slate-100"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
               </div>
               <div className="flex-1 p-6 sm:p-12 overflow-y-auto custom-scrollbar space-y-4">
                  {cart.map(item => (
                    <div key={item.id} className="p-6 bg-slate-50 border rounded-[2.5rem] flex flex-wrap items-center gap-6 shadow-sm">
                       <div className="flex-1 min-w-[200px]">
                          <p className="text-lg font-black uppercase text-slate-900">{item.name}</p>
                          <p className="text-[10px] font-bold text-slate-400 mt-1 tracking-widest">SKU: {item.sku}</p>
                       </div>
                       <div className="flex items-center gap-3 p-2 bg-white rounded-2xl border shadow-sm">
                          <button onClick={() => updateCartQty(item.id, -1)} className="w-10 h-10 flex items-center justify-center bg-slate-50 rounded-xl font-black text-slate-600 hover:bg-slate-100 transition-colors">-</button>
                          <span className="w-10 text-center font-black">{item.cartQuantity}</span>
                          <button onClick={() => updateCartQty(item.id, 1)} className="w-10 h-10 flex items-center justify-center bg-slate-50 rounded-xl font-black text-slate-600 hover:bg-slate-100 transition-colors">+</button>
                       </div>
                       <div className="text-right min-w-[120px] font-black text-xl text-slate-900">₦{(item.price * item.cartQuantity).toLocaleString()}</div>
                       <button onClick={() => removeFromCart(item.id)} className="p-3 text-rose-300 hover:text-rose-500 transition-colors"><ICONS.Trash /></button>
                    </div>
                  ))}
                  {cart.length === 0 && <div className="py-20 text-center text-slate-300 font-black uppercase tracking-[0.2em] italic">Current Session Basket is Empty</div>}
               </div>
               <div className="p-8 sm:p-12 bg-slate-50 border-t flex flex-col sm:flex-row sm:items-end justify-between gap-10">
                  <div className="text-center sm:text-left">
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-2">Checkout Total</p>
                    <p className="text-5xl sm:text-7xl font-black text-blue-600 tracking-tighter leading-none">₦{cartTotal.toLocaleString()}</p>
                  </div>
                  <button onClick={completeCheckout} disabled={cart.length === 0} className="w-full sm:w-auto px-16 py-6 bg-slate-900 text-white rounded-[2rem] font-black uppercase tracking-widest shadow-2xl hover:bg-blue-600 transition-all active:scale-95 disabled:opacity-20 shadow-blue-600/10">Authorize Payment</button>
               </div>
            </div>
          </div>
        )}

        {/* Digital Receipt Overlay with Printing Capability */}
        {receiptToShow && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl animate-in fade-in duration-300 print-receipt-overlay">
            <div className="w-full max-w-sm bg-white rounded-[3rem] p-10 shadow-2xl animate-in zoom-in-95 duration-300 flex flex-col max-h-[90vh] print-receipt-card">
              <div className="text-center mb-8 border-b border-slate-100 pb-8 shrink-0">
                <h3 className="text-2xl font-black uppercase leading-tight">{config.supermarketName}</h3>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mt-1">{activeBranch.name}</p>
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.3em] mt-4">Authorized Digital Invoice</p>
              </div>
              <div className="space-y-4 mb-8 flex-1 overflow-hidden flex flex-col">
                <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase shrink-0">
                  <span>ID: #{receiptToShow.id}</span>
                  <span>{new Date(receiptToShow.timestamp).toLocaleDateString()}</span>
                </div>
                <div className="space-y-2 overflow-y-auto pr-2 custom-scrollbar flex-1">
                  {receiptToShow.items.map((item, idx) => (
                    <div key={idx} className="flex justify-between text-xs">
                      <span className="font-bold text-slate-600 truncate mr-2">{item.name} x{item.quantity}</span>
                      <span className="font-black text-slate-900">₦{(item.price * item.quantity).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t-2 border-dashed border-slate-100 pt-6 mb-10 shrink-0">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Settled</span>
                  <span className="text-3xl font-black text-blue-600">₦{receiptToShow.total.toLocaleString()}</span>
                </div>
              </div>
              
              <div className="flex flex-col gap-3">
                <button 
                  onClick={handlePrintReceipt} 
                  className="w-full py-4 bg-blue-600 text-white rounded-[2rem] font-black text-[10px] uppercase tracking-widest hover:bg-blue-700 transition-all active:scale-95 shadow-xl shadow-blue-600/20 flex items-center justify-center gap-2"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>
                  Print Receipt
                </button>
                <button 
                  onClick={() => setReceiptToShow(null)} 
                  className="w-full py-4 bg-slate-900 text-white rounded-[2rem] font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 transition-all active:scale-95"
                >
                  Close Document
                </button>
              </div>
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
    <div className={`p-8 bg-white border-2 rounded-[2.5rem] transition-all duration-500 flex flex-col justify-between ${alert ? 'border-rose-100 shadow-xl shadow-rose-600/10' : 'border-slate-50 shadow-sm hover:shadow-xl group'}`}>
      <div className="flex items-center justify-between mb-8">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest truncate">{title}</span>
        <div className={`p-3 rounded-xl shrink-0 ${alert ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30' : 'bg-slate-50 text-slate-400 group-hover:bg-blue-600 group-hover:text-white transition-all shadow-sm'}`}>{icon}</div>
      </div>
      <div>
        <div className={`text-3xl font-black tracking-tighter truncate leading-tight ${alert ? 'text-rose-600' : colorMap[color as keyof typeof colorMap]}`}>{value}</div>
        {alert && <p className="mt-3 text-[8px] font-black text-rose-500 uppercase tracking-[0.2em] animate-pulse">Critical Threshold Breach</p>}
      </div>
    </div>
  );
};

export default App;
