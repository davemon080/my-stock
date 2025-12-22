
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Product, UserRole, InventoryStats, Transaction, AppConfig, Seller, Branch } from './types.ts';
import { ICONS } from './constants.tsx';
import Fuse from 'fuse.js';
import ProductModal from './components/ProductModal.tsx';
import { db } from './services/dbService.ts';
import { getStoreStrategy } from './services/geminiService.ts';

interface CartItem extends Product {
  cartQuantity: number;
}

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

const App: React.FC = () => {
  const [isInitializing, setIsInitializing] = useState(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Persistent Session State
  const [currentUser, setCurrentUser] = useState<{ role: UserRole; name: string; branchId: string } | null>(() => {
    const savedSession = localStorage.getItem('supermart_session');
    return savedSession ? JSON.parse(savedSession) : null;
  });

  const [activeTab, setActiveTab] = useState<'Dashboard' | 'Inventory' | 'Register' | 'Transactions' | 'Revenue' | 'Settings'>('Dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isBasketOpen, setIsBasketOpen] = useState(false);
  const [receiptToShow, setReceiptToShow] = useState<Transaction | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void } | null>(null);

  // Database States
  const [config, setConfig] = useState<AppConfig>({
    supermarketName: 'MY STORE',
    logoUrl: '',
    adminPassword: 'admin',
    sellers: [],
    branches: []
  });
  const [selectedBranchId, setSelectedBranchId] = useState<string>(currentUser?.branchId || '');
  const [activeBranchProducts, setActiveBranchProducts] = useState<Product[]>([]);
  const [activeBranchTransactions, setActiveBranchTransactions] = useState<Transaction[]>([]);
  const [aiInsights, setAiInsights] = useState<{ 
    summary: string; 
    restockAdvice: string[]; 
    removalAdvice: string[]; 
    growthTips: string[];
  } | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  // Sync session to localStorage
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('supermart_session', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('supermart_session');
    }
  }, [currentUser]);

  // Initial Load
  const initApp = async () => {
    setIsInitializing(true);
    try {
      const [appConfig, branches, sellers] = await Promise.all([
        db.getConfig(),
        db.getBranches(),
        db.getSellers()
      ]);
      const fullConfig = { ...config, ...appConfig, branches, sellers };
      setConfig(fullConfig);
      
      if (!selectedBranchId && branches.length > 0) {
        setSelectedBranchId(branches[0].id);
      } else if (selectedBranchId && !branches.find(b => b.id === selectedBranchId)) {
        setSelectedBranchId(branches[0]?.id || '');
      }
    } catch (err) {
      showToast("Connection Error", "error");
    } finally {
      setTimeout(() => setIsInitializing(false), 800);
    }
  };

  useEffect(() => {
    initApp();
  }, []);

  // Fetch branch specific data when context changes
  useEffect(() => {
    if (selectedBranchId) {
      loadBranchData();
    }
  }, [selectedBranchId]);

  const loadBranchData = async () => {
    const [p, t] = await Promise.all([
      db.getProducts(selectedBranchId),
      db.getTransactions(selectedBranchId)
    ]);
    setActiveBranchProducts(p);
    setActiveBranchTransactions(t);
  };

  const stats = useMemo((): InventoryStats => ({
    totalItems: activeBranchProducts.length,
    totalValue: activeBranchProducts.reduce((acc, p) => acc + (p.price * p.quantity), 0),
    totalCostValue: activeBranchProducts.reduce((acc, p) => acc + (p.costPrice * p.quantity), 0),
    lowStockCount: activeBranchProducts.filter(p => p.quantity > 0 && p.quantity <= p.minThreshold).length,
    outOfStockCount: activeBranchProducts.filter(p => p.quantity <= 0).length,
  }), [activeBranchProducts]);

  const activeBranch = useMemo(() => 
    config.branches.find(b => b.id === selectedBranchId) || config.branches[0],
    [config.branches, selectedBranchId]
  );

  const handleAiAnalysis = async () => {
    if (activeBranchProducts.length === 0) {
      showToast("Add items to inventory first!", "info");
      return;
    }
    
    setIsAnalyzing(true);
    setAiInsights(null); // Clear old insights while loading

    try {
      const result = await getStoreStrategy(
        activeBranchProducts, 
        activeBranchTransactions, 
        stats, 
        activeBranch?.name || "Main Store"
      );
      setAiInsights(result);
      showToast("Growth Tips Updated", "success");
    } catch (e) {
      console.error("Growth Advisor Analysis Error:", e);
      showToast("Could not connect to Advisor", "error");
    } finally {
      setIsAnalyzing(false);
    }
  };

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
        const adminUser = { role: 'Admin' as UserRole, name: 'Main Admin', branchId: config.branches[0]?.id || '' };
        setCurrentUser(adminUser);
        setSelectedBranchId(adminUser.branchId);
        showToast("Logged in as Admin", "success");
      } else {
        setLoginError('Incorrect Password');
      }
    } else {
      const seller = config.sellers.find(s => s.email === loginEmail && s.password === loginPassword);
      if (seller) {
        const staffUser = { role: 'Seller' as UserRole, name: seller.name, branchId: seller.branchId };
        setCurrentUser(staffUser);
        setSelectedBranchId(staffUser.branchId);
        showToast(`Welcome back, ${seller.name}`, "success");
      } else {
        setLoginError('Invalid Email or Pin');
      }
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setCart([]);
    setAiInsights(null);
    showToast("Signed out", "info");
  };

  const handleSaveProduct = async (data: Omit<Product, 'id' | 'lastUpdated' | 'sku'>) => {
    const id = editingProduct ? editingProduct.id : Math.random().toString(36).substr(2, 9);
    const sku = editingProduct ? editingProduct.sku : (data.name.substring(0, 2).toUpperCase()) + Math.floor(1000 + Math.random() * 9000);
    const product: Product = { ...data, id, sku, lastUpdated: new Date().toISOString() };
    await db.upsertProduct(product, selectedBranchId);
    await loadBranchData();
    setIsModalOpen(false);
    setEditingProduct(null);
    showToast("Item Saved", "success");
  };

  const deleteProduct = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Delete Item?",
      message: "This will remove the item from your store records permanently.",
      onConfirm: async () => {
        await db.deleteProduct(id);
        await loadBranchData();
        setConfirmModal(null);
        showToast("Item Removed", "info");
      }
    });
  };

  const handleWipeDatabase = () => {
    setConfirmModal({
      isOpen: true,
      title: "Reset Everything?",
      message: "This will delete ALL data (stores, products, sales, and accounts). You cannot undo this.",
      onConfirm: async () => {
        setConfirmModal({
          isOpen: true,
          title: "Are you absolutely sure?",
          message: "The entire system will be wiped clean. Confirm to proceed.",
          onConfirm: async () => {
            setConfirmModal(null);
            setIsInitializing(true);
            try {
              await db.wipeAllData();
              showToast("System Reset Complete", "success");
              setCurrentUser(null);
              await initApp();
            } catch (e) {
              showToast("Reset Failed", "error");
              setIsInitializing(false);
            }
          }
        });
      }
    });
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        showToast("Image size must be under 2MB", "error");
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setConfig(prev => ({ ...prev, logoUrl: reader.result as string }));
        showToast("Logo Preview Set", "info");
      };
      reader.readAsDataURL(file);
    }
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [searchTermTransactions, setSearchTermTransactions] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);

  const addToCart = (product: Product) => {
    setCart(prev => {
      const ex = prev.find(i => i.id === product.id);
      if (ex) return prev.map(i => i.id === product.id ? { ...i, cartQuantity: i.cartQuantity + 1 } : i);
      return [...prev, { ...product, cartQuantity: 1 }];
    });
  };

  const completeCheckout = async () => {
    const total = cart.reduce((acc, i) => acc + (i.price * i.cartQuantity), 0);
    const totalCost = cart.reduce((acc, i) => acc + (i.costPrice * i.cartQuantity), 0);
    const tx: Transaction = {
      id: Math.random().toString(36).substr(2, 6).toUpperCase(),
      items: cart.map(i => ({ 
        productId: i.id, name: i.name, sku: i.sku, price: i.price, costPriceAtSale: i.costPrice, quantity: i.cartQuantity
      })),
      total, totalCost, type: 'SALE', timestamp: new Date().toISOString()
    };
    await db.addTransaction(tx, selectedBranchId);
    await loadBranchData();
    setCart([]);
    setIsBasketOpen(false);
    setReceiptToShow(tx);
    showToast("Checkout Finished", "success");
  };

  const fuse = useMemo(() => new Fuse(activeBranchProducts, { keys: ['name', 'sku'], threshold: 0.3 }), [activeBranchProducts]);
  const filteredProducts = useMemo(() => searchTerm ? fuse.search(searchTerm).map(r => r.item) : activeBranchProducts, [activeBranchProducts, searchTerm, fuse]);

  const lowStockItems = useMemo(() => 
    activeBranchProducts
      .filter(p => p.quantity <= p.minThreshold)
      .sort((a, b) => a.quantity - b.quantity)
      .slice(0, 5),
    [activeBranchProducts]
  );

  // Time-based Greeting Logic
  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  }, []);

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none opacity-10">
           <div className="absolute top-[-20%] left-[-10%] w-full h-full bg-blue-500 rounded-full blur-[200px] animate-pulse"></div>
        </div>
        
        <div className="relative z-10 flex flex-col items-center gap-12 animate-in fade-in duration-1000">
          <div className="w-24 h-24 bg-white/5 rounded-[2.5rem] flex items-center justify-center p-6 border border-white/10 shadow-2xl backdrop-blur-sm">
             <div className="text-blue-500 scale-[2.5]"><ICONS.Inventory /></div>
          </div>
          
          <div className="flex flex-col items-center gap-4">
             <div className="h-1 w-48 bg-white/5 rounded-full overflow-hidden relative">
                <div className="absolute inset-y-0 left-0 bg-gradient-to-r from-blue-600 to-indigo-600 animate-loading-bar rounded-full"></div>
             </div>
             <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] translate-x-[0.2em] animate-pulse">Starting System...</p>
          </div>
        </div>
      </div>
    );
  }

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
              <img src={config.logoUrl} className="w-20 h-20 mx-auto mb-6 rounded-2xl object-cover shadow-lg border border-slate-50" />
            ) : (
              <div className="w-20 h-20 bg-blue-600 rounded-[2rem] flex items-center justify-center mx-auto mb-6 text-white shadow-xl">
                <ICONS.Inventory />
              </div>
            )}
            <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase leading-none">{config.supermarketName}</h1>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-4">Inventory Control Center</p>
          </div>
          <div className="flex bg-slate-100 p-1.5 rounded-2xl mb-8 shadow-inner">
            {(['Seller', 'Admin'] as UserRole[]).map(r => (
              <button key={r} onClick={() => setLoginRole(r)} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${loginRole === r ? 'bg-white text-blue-600 shadow-md' : 'text-slate-400'}`}>
                {r === 'Seller' ? 'Cashier' : 'Admin'}
              </button>
            ))}
          </div>
          <form onSubmit={handleLogin} className="space-y-6">
            {loginRole === 'Seller' && (
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Email Address</label>
                <input type="email" required className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-600 focus:bg-white outline-none font-bold transition-all" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} />
              </div>
            )}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{loginRole === 'Admin' ? 'Admin Password' : 'Login Pin'}</label>
              <input type="password" required className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-600 focus:bg-white outline-none font-bold transition-all" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} />
            </div>
            {loginError && <p className="text-rose-500 text-[10px] font-black uppercase text-center animate-bounce">{loginError}</p>}
            <button type="submit" className="w-full py-5 bg-blue-600 text-white rounded-3xl font-black uppercase tracking-widest shadow-xl shadow-blue-600/30 hover:bg-blue-700 transition-all active:scale-95">Log In</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden font-['Plus_Jakarta_Sans'] animate-in fade-in duration-500">
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

      {confirmModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
           <div className="w-full max-sm bg-white rounded-[2.5rem] p-10 shadow-2xl">
              <h3 className="text-xl font-black text-slate-900 mb-4 uppercase">{confirmModal.title}</h3>
              <p className="text-sm font-bold text-slate-500 mb-10 leading-relaxed">{confirmModal.message}</p>
              <div className="flex gap-4">
                 <button onClick={() => setConfirmModal(null)} className="flex-1 py-4 bg-slate-100 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest">No, Go Back</button>
                 <button onClick={confirmModal.onConfirm} className="flex-1 py-4 bg-rose-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-rose-600/20">Yes, Confirm</button>
              </div>
           </div>
        </div>
      )}

      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-72 bg-slate-950 text-white flex flex-col transition-all duration-300 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="p-8 flex items-center justify-between border-b border-white/5 shrink-0">
          <div className="flex items-center gap-4">
            {config.logoUrl ? (
              <img src={config.logoUrl} className="w-10 h-10 rounded-xl object-cover border border-white/10" />
            ) : (
              <div className="p-3 bg-blue-600 rounded-2xl text-white"><ICONS.Inventory /></div>
            )}
            <div className="min-w-0">
              <h1 className="text-lg font-black italic tracking-tighter truncate uppercase leading-tight">{config.supermarketName}</h1>
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{activeBranch?.name}</p>
            </div>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-2 text-white/50 hover:text-white transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
        <nav className="flex-1 p-6 space-y-2 overflow-y-auto custom-scrollbar">
          {[
            { id: 'Dashboard', icon: <ICONS.Dashboard />, label: 'Overview' },
            { id: 'Inventory', icon: <ICONS.Inventory />, label: 'Inventory' },
            { id: 'Register', icon: <ICONS.Register />, label: 'Sales Counter' },
            { id: 'Transactions', icon: <ICONS.Register />, label: 'Sales History' },
            { id: 'Revenue', icon: <ICONS.Revenue />, label: 'Finance', adminOnly: true },
            { id: 'Settings', icon: <ICONS.Dashboard />, label: 'Settings', adminOnly: true }
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
              <p className="text-[8px] font-bold text-slate-500 uppercase tracking-widest mb-1 italic">Logged in as</p>
              <p className="text-sm font-black truncate uppercase">{currentUser.name}</p>
           </div>
           <button onClick={handleLogout} className="w-full py-3 bg-rose-500/10 text-rose-500 text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-rose-500 hover:text-white transition-all active:scale-95">Sign Out</button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-20 bg-white border-b border-slate-200 px-6 sm:px-10 flex items-center justify-between sticky top-0 z-30 shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2.5 bg-slate-100 text-slate-600 rounded-xl active:scale-95 transition-all">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
            </button>
            <h2 className="text-xl font-black uppercase tracking-tight hidden sm:block">
              {activeTab === 'Dashboard' ? 'Overview' : activeTab === 'Register' ? 'Sales Counter' : activeTab === 'Transactions' ? 'Sales History' : activeTab}
            </h2>
          </div>
          
          <div className="flex items-center gap-4">
            {currentUser.role === 'Admin' && (
              <div className="relative group">
                <select 
                  value={selectedBranchId}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                  className="appearance-none bg-blue-50 border-2 border-blue-100 rounded-2xl px-6 py-2.5 pr-12 text-[10px] font-black uppercase tracking-widest text-blue-700 outline-none focus:border-blue-600 shadow-sm transition-all"
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
                <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[10px] font-black w-6 h-6 flex items-center justify-center rounded-full border-2 border-white shadow-md">
                  {cart.length}
                </span>
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 sm:p-10 custom-scrollbar">
          {activeTab === 'Dashboard' && (
            <div className="space-y-10 max-w-7xl mx-auto">
              {/* Dynamic Greeting Section */}
              <div className="mb-10 animate-in fade-in slide-in-from-left duration-700">
                <h3 className="text-4xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                  {greeting}, {currentUser.name}! 
                  <span className="animate-bounce">👋</span>
                </h3>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] mt-2 italic">Here is what is happening in your store today</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title="Inventory Count" value={stats.totalItems} icon={<ICONS.Dashboard />} color="slate" />
                <StatCard title="Stock Value" value={`₦${stats.totalValue.toLocaleString()}`} icon={<ICONS.Inventory />} color="blue" />
                <StatCard title="Low Stock Items" value={stats.lowStockCount} icon={<ICONS.Alert />} color="amber" alert={stats.lowStockCount > 0} />
                <StatCard title="Sales Today" value={`₦${activeBranchTransactions.filter(t => new Date(t.timestamp).toDateString() === new Date().toDateString()).reduce((acc, t) => acc + t.total, 0).toLocaleString()}`} icon={<ICONS.Revenue />} color="emerald" />
              </div>

              {/* Intelligence Hub */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                 {/* Stock Monitor */}
                 <div className="lg:col-span-1 bg-white rounded-[3rem] p-8 border border-slate-200 shadow-sm flex flex-col">
                    <div className="mb-8">
                       <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-1">Live Stock Health</h3>
                       <p className="text-xs font-bold text-slate-500">Items needing immediate restock</p>
                    </div>
                    
                    <div className="space-y-6 flex-1">
                       {lowStockItems.length > 0 ? lowStockItems.map(item => (
                         <div key={item.id} className="group">
                            <div className="flex justify-between items-center mb-2">
                               <span className="text-[11px] font-black text-slate-900 uppercase truncate max-w-[140px]">{item.name}</span>
                               <span className="text-[10px] font-black text-amber-600">{item.quantity} Left</span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                               <div 
                                 className="h-full bg-amber-500 rounded-full transition-all duration-1000"
                                 style={{ width: `${Math.max(10, (item.quantity / (item.minThreshold || 1)) * 100)}%` }}
                               ></div>
                            </div>
                         </div>
                       )) : (
                         <div className="h-full flex flex-col items-center justify-center text-center py-10">
                            <div className="w-16 h-16 bg-emerald-50 text-emerald-500 rounded-full flex items-center justify-center mb-4">
                               <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
                            </div>
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Stock is healthy!</p>
                         </div>
                       )}
                    </div>
                    
                    <button 
                      onClick={() => setActiveTab('Inventory')}
                      className="mt-10 w-full py-4 bg-slate-50 hover:bg-slate-100 text-slate-500 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all"
                    >
                      Manage Full Inventory
                    </button>
                 </div>

                 {/* Growth Advisor Card */}
                 <div className="lg:col-span-2 bg-slate-900 rounded-[3rem] p-10 shadow-2xl relative overflow-hidden group min-h-[500px]">
                    <div className="absolute top-0 right-0 p-12 pointer-events-none opacity-5 group-hover:opacity-10 transition-opacity">
                       <svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="0.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/></svg>
                    </div>
                    
                    <div className="relative z-10 h-full flex flex-col">
                       <div className="flex items-center justify-between mb-8">
                          <div className="flex items-center gap-4">
                             <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-xl">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>
                             </div>
                             <div>
                                <h3 className="text-lg font-black text-white uppercase tracking-tight">Growth Advisor</h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest italic">Live Business Assistant</p>
                             </div>
                          </div>
                          
                          <button 
                            onClick={handleAiAnalysis} 
                            disabled={isAnalyzing}
                            className="px-6 py-3 bg-white/5 hover:bg-white/10 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border border-white/10 flex items-center gap-2 disabled:opacity-50"
                          >
                             {isAnalyzing ? <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : "Refresh Tips"}
                          </button>
                       </div>

                       <div className="flex-1 space-y-8 overflow-y-auto custom-scrollbar pr-2">
                          {isAnalyzing ? (
                             <div className="h-64 flex flex-col items-center justify-center text-center animate-pulse">
                                <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-6" />
                                <p className="text-[10px] font-black text-blue-400 uppercase tracking-[0.3em]">Advisor is studying your data...</p>
                             </div>
                          ) : aiInsights ? (
                             <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-8 pb-6">
                                <div className="p-6 bg-white/5 rounded-3xl border border-white/5">
                                   <p className="text-slate-200 text-sm leading-relaxed italic">
                                      "{aiInsights.summary}"
                                   </p>
                                </div>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                   <div className="space-y-4">
                                      <h4 className="text-[10px] font-black text-blue-400 uppercase tracking-widest border-b border-blue-400/20 pb-2 flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 bg-blue-500 rounded-full" /> What to Restock
                                      </h4>
                                      <ul className="space-y-3">
                                         {aiInsights.restockAdvice.map((item, i) => (
                                            <li key={i} className="text-xs text-slate-300 leading-relaxed pl-1">
                                               {item}
                                            </li>
                                         ))}
                                      </ul>
                                   </div>
                                   <div className="space-y-4">
                                      <h4 className="text-[10px] font-black text-rose-400 uppercase tracking-widest border-b border-rose-400/20 pb-2 flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 bg-rose-500 rounded-full" /> Slow Items
                                      </h4>
                                      <ul className="space-y-3">
                                         {aiInsights.removalAdvice.map((item, i) => (
                                            <li key={i} className="text-xs text-slate-300 leading-relaxed pl-1">
                                               {item}
                                            </li>
                                         ))}
                                      </ul>
                                   </div>
                                   <div className="md:col-span-2 space-y-4 pt-4">
                                      <h4 className="text-[10px] font-black text-emerald-400 uppercase tracking-widest border-b border-emerald-400/20 pb-2">3 Steps to Grow</h4>
                                      <ul className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                         {aiInsights.growthTips.map((tip, i) => (
                                            <li key={i} className="text-xs text-slate-300 bg-white/5 p-4 rounded-2xl border border-white/5 hover:bg-white/10 transition-colors">
                                               {tip}
                                            </li>
                                         ))}
                                      </ul>
                                   </div>
                                </div>
                             </div>
                          ) : (
                             <div className="h-64 flex flex-col items-center justify-center text-center opacity-30 border-2 border-dashed border-white/10 rounded-[3rem]">
                                <p className="text-[10px] font-black text-white uppercase tracking-[0.3em]">Click 'Refresh Tips' to wake up advisor</p>
                             </div>
                          )}
                       </div>
                    </div>
                 </div>
              </div>
            </div>
          )}

          {activeTab === 'Inventory' && (
             <div className="max-w-7xl mx-auto space-y-6">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                   <div className="relative w-full max-w-md">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><ICONS.Search /></span>
                      <input type="text" placeholder="Search Inventory..." className="w-full pl-12 pr-6 py-3 bg-white border-2 border-slate-100 rounded-2xl focus:border-blue-600 outline-none font-bold shadow-sm transition-all" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                   </div>
                   {currentUser.role === 'Admin' && (
                     <button onClick={() => { setEditingProduct(null); setIsModalOpen(true); }} className="px-8 py-3 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-blue-600/30 active:scale-95 transition-all">Add New Item</button>
                   )}
                </div>
                <div className="bg-white rounded-[2.5rem] border border-slate-200 overflow-hidden shadow-sm overflow-x-auto">
                   <table className="w-full text-left min-w-[800px]">
                      <thead className="bg-slate-50 border-b">
                         <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                            <th className="px-10 py-6">Product Name</th>
                            <th className="px-10 py-6">Item Code</th>
                            <th className="px-10 py-6 text-right">Price (₦)</th>
                            <th className="px-10 py-6 text-center">In Stock</th>
                            <th className="px-10 py-6 text-right">Actions</th>
                         </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                         {filteredProducts.map(p => (
                           <tr key={p.id} className="hover:bg-blue-50/10 transition-all group">
                              <td className="px-10 py-6 font-black text-slate-900 uppercase text-xs">{p.name}</td>
                              <td className="px-10 py-6 font-mono text-[10px] text-slate-500">{p.sku}</td>
                              <td className="px-10 py-6 text-right font-black">₦{p.price.toLocaleString()}</td>
                              <td className="px-10 py-6 text-center">
                                 <span className={`px-3 py-1 rounded-xl text-[9px] font-black ${p.quantity <= p.minThreshold ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>{p.quantity} Units</span>
                              </td>
                              <td className="px-10 py-6 text-right">
                                 <div className="flex justify-end gap-2">
                                    <button onClick={() => { setEditingProduct(p); setIsModalOpen(true); }} className="p-2.5 bg-slate-100 text-slate-400 rounded-xl hover:bg-blue-600 hover:text-white transition-all active:scale-90"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg></button>
                                    {currentUser.role === 'Admin' && <button onClick={() => deleteProduct(p.id)} className="p-2.5 bg-slate-100 text-slate-400 rounded-xl hover:bg-rose-600 hover:text-white transition-all active:scale-90"><ICONS.Trash /></button>}
                                 </div>
                              </td>
                           </tr>
                         ))}
                         {filteredProducts.length === 0 && (
                           <tr>
                             <td colSpan={5} className="py-20 text-center text-slate-300 font-black uppercase tracking-widest italic">Inventory list is empty</td>
                           </tr>
                         )}
                      </tbody>
                   </table>
                </div>
             </div>
          )}

          {activeTab === 'Register' && (
            <div className="max-w-7xl mx-auto space-y-8">
               <div className="relative max-w-2xl mx-auto">
                  <span className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400"><ICONS.Search /></span>
                  <input type="text" placeholder="Search items to sell..." className="w-full pl-16 pr-8 py-5 text-md font-bold bg-white border-2 border-transparent rounded-[2.5rem] focus:border-blue-600 focus:bg-white outline-none shadow-sm transition-all" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
               </div>
               <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                 {filteredProducts.map(p => (
                   <button key={p.id} disabled={p.quantity <= 0} onClick={() => addToCart(p)} className="p-6 bg-white border-2 border-transparent rounded-[2.5rem] text-left hover:border-blue-600 hover:shadow-xl transition-all group relative active:scale-95 shadow-sm overflow-hidden disabled:opacity-40">
                      <div className="text-xl font-black text-slate-900 mb-2 leading-none">₦{p.price.toLocaleString()}</div>
                      <h4 className="text-xs font-black text-slate-800 mb-1 leading-tight line-clamp-2 min-h-[1.5rem] uppercase">{p.name}</h4>
                      <div className={`mt-4 px-2 py-0.5 rounded-lg text-[8px] font-black w-fit ${p.quantity <= p.minThreshold ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-50'}`}>{p.quantity} In Stock</div>
                      {p.quantity <= 0 && <div className="absolute inset-0 bg-white/70 flex items-center justify-center font-black text-rose-600 uppercase tracking-widest text-[10px]">OUT OF STOCK</div>}
                   </button>
                 ))}
               </div>
            </div>
          )}

          {activeTab === 'Transactions' && (
            <div className="max-w-7xl mx-auto space-y-6">
               <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="relative w-full max-md">
                     <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><ICONS.Search /></span>
                     <input type="text" placeholder="Search receipts..." className="w-full pl-12 pr-6 py-3 bg-white border-2 border-slate-100 rounded-2xl focus:border-blue-600 outline-none font-bold shadow-sm" value={searchTermTransactions} onChange={e => setSearchTermTransactions(e.target.value)} />
                  </div>
               </div>
               <div className="bg-white rounded-[3rem] border border-slate-200 overflow-hidden shadow-sm overflow-x-auto">
                  <table className="w-full text-left min-w-[800px]">
                     <thead className="bg-slate-50 border-b">
                        <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                           <th className="px-10 py-6">Receipt ID</th>
                           <th className="px-10 py-6">Date & Time</th>
                           <th className="px-10 py-6">Total Amount</th>
                           <th className="px-10 py-6 text-right">Actions</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-100">
                        {activeBranchTransactions.filter(t => 
                          t.id.toLowerCase().includes(searchTermTransactions.toLowerCase()) ||
                          t.items.some(i => i.name.toLowerCase().includes(searchTermTransactions.toLowerCase()))
                        ).map(t => (
                          <tr key={t.id} className="hover:bg-blue-50/10 transition-colors">
                             <td className="px-10 py-6 font-black text-slate-900 text-xs">#{t.id}</td>
                             <td className="px-10 py-6 text-xs text-slate-500 font-bold">{new Date(t.timestamp).toLocaleString()}</td>
                             <td className="px-10 py-6 font-black text-blue-600">₦{t.total.toLocaleString()}</td>
                             <td className="px-10 py-6 text-right">
                                <div className="flex justify-end gap-2">
                                  <button onClick={() => setReceiptToShow(t)} title="View" className="p-2.5 bg-slate-100 text-slate-500 rounded-xl hover:bg-blue-600 hover:text-white transition-all active:scale-95">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                                  </button>
                                  <button onClick={() => { setReceiptToShow(t); setTimeout(() => window.print(), 200); }} title="Print" className="p-2.5 bg-slate-100 text-slate-500 rounded-xl hover:bg-emerald-600 hover:text-white transition-all active:scale-95">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>
                                  </button>
                                </div>
                             </td>
                          </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
            </div>
          )}

          {activeTab === 'Revenue' && currentUser.role === 'Admin' && (
             <div className="max-w-7xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                   <StatCard title="Total Revenue" value={`₦${activeBranchTransactions.reduce((acc, t) => acc + t.total, 0).toLocaleString()}`} icon={<ICONS.Revenue />} color="emerald" />
                   <StatCard title="Total Cost" value={`₦${activeBranchTransactions.reduce((acc, t) => acc + t.totalCost, 0).toLocaleString()}`} icon={<ICONS.Inventory />} color="amber" />
                   <StatCard title="Store Profit" value={`₦${(activeBranchTransactions.reduce((acc, t) => acc + t.total, 0) - activeBranchTransactions.reduce((acc, t) => acc + t.totalCost, 0)).toLocaleString()}`} icon={<ICONS.Dashboard />} color="blue" />
                   <StatCard title="Margin %" value={`${((activeBranchTransactions.reduce((acc, t) => acc + (t.total - t.totalCost), 0) / (activeBranchTransactions.reduce((acc, t) => acc + t.total, 0) || 1)) * 100).toFixed(1)}%`} icon={<ICONS.Register />} color="slate" />
                </div>
                <div className="bg-white rounded-[3rem] p-10 border border-slate-200 shadow-sm overflow-hidden">
                   <h3 className="text-xl font-black uppercase mb-8 italic">Sales Ledger</h3>
                   <div className="overflow-x-auto">
                      <table className="w-full text-left min-w-[700px]">
                         <thead className="bg-slate-50 border-b">
                            <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                               <th className="px-8 py-5">Date</th>
                               <th className="px-8 py-5">Sale Value</th>
                               <th className="px-8 py-5">Profit</th>
                               <th className="px-8 py-5 text-right">Profit %</th>
                            </tr>
                         </thead>
                         <tbody className="divide-y divide-slate-100">
                            {activeBranchTransactions.map(t => (
                              <tr key={t.id} className="text-xs hover:bg-slate-50 transition-colors">
                                 <td className="px-8 py-5 font-bold text-slate-500">{new Date(t.timestamp).toLocaleString()}</td>
                                 <td className="px-8 py-5 font-black">₦{t.total.toLocaleString()}</td>
                                 <td className="px-8 py-5 font-black text-emerald-600">₦{(t.total - t.totalCost).toLocaleString()}</td>
                                 <td className="px-8 py-5 text-right">
                                    <span className="px-3 py-1 bg-blue-50 text-blue-600 rounded-lg font-black uppercase text-[9px]">
                                      {(((t.total - t.totalCost) / (t.total || 1)) * 100).toFixed(1)}%
                                    </span>
                                 </td>
                              </tr>
                            ))}
                         </tbody>
                      </table>
                   </div>
                </div>
             </div>
          )}

          {activeTab === 'Settings' && currentUser.role === 'Admin' && (
            <div className="max-w-4xl mx-auto space-y-10 pb-40 animate-in fade-in duration-500">
               <div className="bg-white rounded-[3rem] p-10 border border-slate-200 shadow-sm">
                  <h3 className="text-2xl font-black mb-8 uppercase tracking-tight flex items-center gap-3 text-slate-500">
                    Store Network
                  </h3>
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.target as HTMLFormElement;
                    const fd = new FormData(form);
                    const branch = {
                      id: 'br_' + Math.random().toString(36).substr(2, 5),
                      name: fd.get('branchName') as string,
                      location: fd.get('branchLoc') as string,
                      createdAt: new Date().toISOString()
                    };
                    await db.addBranch(branch);
                    const branches = await db.getBranches();
                    setConfig({ ...config, branches });
                    form.reset();
                    showToast("New Branch Added", "success");
                  }} className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                    <input name="branchName" required placeholder="Store Name (e.g., Downtown)" className="px-6 py-4 bg-slate-50 border-2 rounded-2xl outline-none font-bold focus:border-blue-600 focus:bg-white transition-all" />
                    <input name="branchLoc" required placeholder="Location Address" className="px-6 py-4 bg-slate-50 border-2 rounded-2xl outline-none font-bold focus:border-blue-600 focus:bg-white transition-all" />
                    <button type="submit" className="sm:col-span-2 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all">Add Branch</button>
                  </form>
                  
                  <div className="space-y-3">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-4">Active Branches</p>
                    {config.branches.map(b => (
                      <div key={b.id} className="p-5 bg-slate-50 border border-slate-100 rounded-[2rem] flex items-center justify-between group hover:bg-white hover:border-blue-200 transition-all">
                        <div>
                          <p className="font-black text-sm text-slate-900 uppercase">{b.name}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{b.location}</p>
                        </div>
                        {config.branches.length > 1 && (
                          <button 
                            onClick={() => {
                              setConfirmModal({
                                isOpen: true,
                                title: "Remove Branch?",
                                message: `Are you sure you want to close '${b.name}'? This deletes its products and sales history.`,
                                onConfirm: async () => {
                                  await db.deleteBranch(b.id);
                                  const branches = await db.getBranches();
                                  setConfig({ ...config, branches });
                                  if (selectedBranchId === b.id) setSelectedBranchId(branches[0].id);
                                  setConfirmModal(null);
                                  showToast("Branch Removed", "info");
                                }
                              });
                            }}
                            className="p-3 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all active:scale-90"
                          >
                            <ICONS.Trash />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
               </div>

               <div className="bg-white rounded-[3rem] p-10 border border-slate-200 shadow-sm">
                  <h3 className="text-2xl font-black mb-8 uppercase tracking-tight text-slate-500">Team Members</h3>
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.target as HTMLFormElement;
                    const fd = new FormData(form);
                    const seller: Seller = {
                      id: Math.random().toString(36).substr(2, 9),
                      name: fd.get('staffName') as string,
                      email: fd.get('staffEmail') as string,
                      password: fd.get('staffPin') as string,
                      branchId: fd.get('staffBranch') as string
                    };
                    await db.addSeller(seller);
                    const sellers = await db.getSellers();
                    setConfig({ ...config, sellers });
                    form.reset();
                    showToast(`${seller.name} Added to Team`, "success");
                  }} className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                    <input name="staffName" required placeholder="Staff Full Name" className="px-6 py-4 bg-slate-50 border-2 rounded-2xl font-bold focus:border-blue-600 focus:bg-white transition-all" />
                    <input name="staffEmail" required type="email" placeholder="Work Email" className="px-6 py-4 bg-slate-50 border-2 rounded-2xl font-bold focus:border-blue-600 focus:bg-white transition-all" />
                    <input name="staffPin" required placeholder="Secure Login Pin" className="px-6 py-4 bg-slate-50 border-2 rounded-2xl font-bold focus:border-blue-600 focus:bg-white transition-all" />
                    <select name="staffBranch" required className="px-6 py-4 bg-slate-50 border-2 rounded-2xl font-bold focus:border-blue-600 focus:bg-white transition-all">
                       {config.branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <button type="submit" className="sm:col-span-2 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest active:scale-95 transition-all">Add Staff Member</button>
                  </form>
                  
                  <div className="space-y-3">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-4">Current Staff</p>
                    {config.sellers.map(s => (
                      <div key={s.id} className="p-5 bg-slate-50 border border-slate-100 rounded-[2rem] flex items-center justify-between group hover:bg-white hover:border-blue-200 transition-all">
                        <div>
                          <p className="font-black text-sm text-slate-900 uppercase">{s.name}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            {config.branches.find(b => b.id === s.branchId)?.name || 'N/A'} • {s.email}
                          </p>
                        </div>
                        <button onClick={async () => {
                          await db.deleteSeller(s.id);
                          const sellers = await db.getSellers();
                          setConfig({...config, sellers});
                          showToast("Staff Member Removed", "info");
                        }} className="p-3 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all active:scale-90">
                          <ICONS.Trash />
                        </button>
                      </div>
                    ))}
                  </div>
               </div>
               
               <div className="bg-white rounded-[3rem] p-10 border border-slate-200 shadow-sm">
                  <h3 className="text-2xl font-black mb-8 uppercase tracking-tight text-slate-500">Store Settings</h3>
                  <div className="space-y-8">
                    <div className="flex flex-col sm:flex-row items-center gap-8 p-6 bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200">
                      <div className="relative group">
                        {config.logoUrl ? (
                          <img src={config.logoUrl} className="w-32 h-32 rounded-[2rem] object-cover shadow-xl border-4 border-white" />
                        ) : (
                          <div className="w-32 h-32 bg-slate-200 rounded-[2rem] flex items-center justify-center text-slate-400">
                            <ICONS.Inventory />
                          </div>
                        )}
                        <button 
                          onClick={() => fileInputRef.current?.click()}
                          className="absolute inset-0 bg-black/40 text-white opacity-0 group-hover:opacity-100 transition-opacity rounded-[2rem] flex items-center justify-center font-black text-[10px] uppercase tracking-widest"
                        >
                          Change Logo
                        </button>
                      </div>
                      <div className="flex-1 text-center sm:text-left">
                        <p className="text-sm font-black text-slate-900 mb-1 uppercase italic">Store Logo</p>
                        <p className="text-xs text-slate-500 mb-4 font-medium uppercase tracking-tighter">Square image looks best</p>
                        <div className="flex flex-wrap justify-center sm:justify-start gap-3">
                           <button 
                            onClick={() => fileInputRef.current?.click()}
                            className="px-6 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl font-black text-[10px] uppercase tracking-widest hover:border-blue-600 hover:text-blue-600 transition-all shadow-sm active:scale-95"
                           >
                             Upload Image
                           </button>
                           {config.logoUrl && (
                             <button 
                              onClick={() => setConfig(prev => ({ ...prev, logoUrl: '' }))}
                              className="px-6 py-2.5 bg-rose-50 text-rose-500 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-100 transition-all active:scale-95"
                             >
                               Reset Logo
                             </button>
                           )}
                        </div>
                        <input type="file" ref={fileInputRef} onChange={handleLogoUpload} accept="image/*" className="hidden" />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div>
                         <label className="text-[10px] font-black text-slate-400 uppercase block mb-2">Supermarket Name</label>
                         <input value={config.supermarketName} onChange={e => setConfig({...config, supermarketName: e.target.value})} className="w-full px-5 py-3.5 bg-slate-50 border-2 rounded-xl font-bold focus:border-blue-600 outline-none transition-all" />
                      </div>
                      <div>
                         <label className="text-[10px] font-black text-slate-400 uppercase block mb-2">Admin Password</label>
                         <input type="password" value={config.adminPassword} onChange={e => setConfig({...config, adminPassword: e.target.value})} className="w-full px-5 py-3.5 bg-slate-50 border-2 rounded-xl font-bold focus:border-blue-600 outline-none transition-all" />
                      </div>
                      <button onClick={async () => {
                        await db.updateConfig(config.supermarketName, config.logoUrl, config.adminPassword);
                        showToast("Settings Updated", "success");
                      }} className="sm:col-span-2 py-5 bg-indigo-600 text-white rounded-[2rem] font-black uppercase text-[10px] tracking-widest shadow-xl shadow-indigo-600/20 active:scale-95 transition-all">Save Store Settings</button>
                    </div>
                  </div>
               </div>

               <div className="bg-rose-50/30 rounded-[3rem] p-10 border-2 border-dashed border-rose-200 shadow-sm">
                  <div className="flex items-center gap-4 mb-6">
                    <div className="p-3 bg-rose-600 text-white rounded-2xl">
                       <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
                    </div>
                    <div>
                      <h3 className="text-2xl font-black uppercase tracking-tight text-rose-600">Factory Reset</h3>
                      <p className="text-[10px] font-bold text-rose-400 uppercase tracking-widest italic">Be Careful!</p>
                    </div>
                  </div>
                  
                  <div className="p-8 bg-white/60 border border-rose-100 rounded-[2.5rem] flex flex-col sm:flex-row items-center justify-between gap-8">
                    <div className="max-w-md text-center sm:text-left">
                       <p className="font-black text-rose-950 uppercase text-sm mb-2 italic">Delete All Data</p>
                       <p className="text-xs font-bold text-rose-500 leading-relaxed uppercase tracking-tighter">This will wipe everything and reset the app. Only do this if you want to start fresh.</p>
                    </div>
                    <button onClick={handleWipeDatabase} className="w-full sm:w-auto px-10 py-5 bg-rose-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-xl shadow-rose-600/30 hover:bg-rose-700 active:scale-95 transition-all">Wipe System</button>
                  </div>
               </div>
            </div>
          )}
        </div>

        {isBasketOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300">
            <div className="w-full max-w-4xl h-full sm:max-h-[85vh] bg-white rounded-none sm:rounded-[4rem] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom sm:zoom-in-95 duration-300">
               <div className="p-6 sm:p-10 border-b flex items-center justify-between shrink-0 bg-white">
                  <div>
                    <h3 className="text-2xl sm:text-3xl font-black uppercase tracking-tighter text-slate-900 leading-none">Shopping Basket</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">{cart.length} items to checkout</p>
                  </div>
                  <button onClick={() => setIsBasketOpen(false)} className="p-4 bg-slate-50 rounded-2xl active:scale-95 transition-all hover:bg-slate-100">
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                  </button>
               </div>
               
               <div className="flex-1 p-4 sm:p-8 overflow-y-auto custom-scrollbar space-y-4 bg-slate-50/30">
                  {cart.map(item => (
                    <div key={item.id} className="p-5 sm:p-6 bg-white border border-slate-100 rounded-[2rem] flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 shadow-sm hover:shadow-md transition-shadow">
                       <div className="flex-1 min-w-0 w-full">
                          <p className="text-base sm:text-lg font-black uppercase text-slate-900 truncate leading-tight">{item.name}</p>
                          <p className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Code: {item.sku}</p>
                       </div>
                       
                       <div className="flex items-center justify-between w-full sm:w-auto gap-4">
                          <div className="flex items-center gap-2 p-1.5 bg-slate-50 rounded-2xl border border-slate-100">
                             <button onClick={() => setCart(prev => prev.map(i => i.id === item.id ? { ...i, cartQuantity: Math.max(0, i.cartQuantity - 1) } : i).filter(i => i.cartQuantity > 0))} className="w-10 h-10 flex items-center justify-center bg-white rounded-xl font-black text-slate-900 shadow-sm active:scale-90">-</button>
                             <span className="w-10 text-center font-black text-slate-900">{item.cartQuantity}</span>
                             <button onClick={() => setCart(prev => prev.map(i => i.id === item.id ? { ...i, cartQuantity: i.cartQuantity + 1 } : i))} className="w-10 h-10 flex items-center justify-center bg-white rounded-xl font-black text-slate-900 shadow-sm active:scale-90">+</button>
                          </div>
                          <div className="text-right min-w-[120px]">
                            <p className="text-[9px] font-black text-slate-400 uppercase mb-0.5 sm:hidden">Price</p>
                            <span className="font-black text-xl text-slate-900">₦{(item.price * item.cartQuantity).toLocaleString()}</span>
                          </div>
                          <button onClick={() => setCart(prev => prev.filter(i => i.id !== item.id))} className="p-3 text-slate-300 hover:text-rose-500 transition-colors active:scale-90"><ICONS.Trash /></button>
                       </div>
                    </div>
                  ))}
                  {cart.length === 0 && (
                    <div className="py-32 flex flex-col items-center justify-center text-center">
                      <p className="text-slate-400 font-black uppercase tracking-[0.2em] italic text-sm">Basket is empty</p>
                      <button onClick={() => { setIsBasketOpen(false); setActiveTab('Register'); }} className="mt-8 text-blue-600 font-black text-[10px] uppercase tracking-widest hover:underline underline-offset-8 transition-all">Return to Shop</button>
                    </div>
                  )}
               </div>
               
               <div className="p-6 sm:p-10 bg-white border-t flex flex-col sm:flex-row items-center sm:items-end justify-between gap-8 shrink-0">
                  <div className="text-center sm:text-left w-full sm:w-auto">
                    <p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1">Final Amount</p>
                    <p className="text-4xl sm:text-5xl font-black text-blue-600 tracking-tighter leading-none">₦{cart.reduce((a, i) => a + (i.price * i.cartQuantity), 0).toLocaleString()}</p>
                  </div>
                  <button onClick={completeCheckout} disabled={cart.length === 0} className="w-full sm:w-auto px-16 py-6 bg-slate-900 text-white rounded-3xl font-black uppercase tracking-widest shadow-2xl hover:bg-blue-600 active:scale-95 transition-all disabled:opacity-20 shadow-blue-600/10 flex items-center justify-center gap-3">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10"/><path d="m9 12 2 2 4-4"/></svg>
                    Finish Sale
                  </button>
               </div>
            </div>
          </div>
        )}

        {receiptToShow && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl animate-in fade-in duration-300 print-receipt-overlay">
            <div className="w-full max-w-sm bg-white rounded-[3rem] p-10 shadow-2xl print-receipt-card flex flex-col animate-in zoom-in-95 duration-300">
              <div className="text-center mb-8 border-b pb-8">
                <h3 className="text-2xl font-black uppercase tracking-tight leading-none mb-1 italic">{config.supermarketName}</h3>
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{activeBranch?.name}</p>
                <div className="mt-4 flex justify-between text-[9px] font-black text-slate-400 uppercase tracking-widest">
                  <span>No: #{receiptToShow.id}</span>
                  <span>{new Date(receiptToShow.timestamp).toLocaleDateString()}</span>
                </div>
              </div>
              <div className="space-y-4 mb-8 overflow-y-auto max-h-[300px] custom-scrollbar">
                {receiptToShow.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-[11px] font-bold text-slate-700">
                    <span className="truncate mr-4 uppercase">{item.name} x{item.quantity}</span>
                    <span className="font-black text-slate-900 shrink-0">₦{(item.price * item.quantity).toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <div className="border-t-2 border-dashed pt-6 mb-10 flex justify-between items-center shrink-0">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Grand Total</span>
                <span className="text-3xl font-black text-blue-600">₦{receiptToShow.total.toLocaleString()}</span>
              </div>
              <div className="flex flex-col gap-3 print:hidden shrink-0">
                <button onClick={() => window.print()} className="w-full py-5 bg-blue-600 text-white rounded-[2rem] font-black text-[10px] uppercase tracking-widest hover:bg-blue-700 active:scale-95 transition-all shadow-xl shadow-blue-600/20">Print Receipt</button>
                <button onClick={() => setReceiptToShow(null)} className="w-full py-5 bg-slate-900 text-white rounded-[2rem] font-black text-[10px] uppercase tracking-widest hover:bg-slate-800 active:scale-95 transition-all">Close</button>
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
  const colorMap = { emerald: 'text-emerald-600', blue: 'text-blue-600', amber: 'text-amber-600', slate: 'text-slate-900' };
  return (
    <div className={`p-8 bg-white border-2 rounded-[2.5rem] transition-all duration-500 flex flex-col justify-between ${alert ? 'border-rose-100 shadow-xl shadow-rose-600/10 animate-pulse' : 'border-slate-50 shadow-sm hover:shadow-xl group'}`}>
      <div className="flex items-center justify-between mb-8">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest truncate italic">{title}</span>
        <div className={`p-3 rounded-xl shrink-0 transition-all ${alert ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30' : 'bg-slate-50 text-slate-400 group-hover:bg-blue-600 group-hover:text-white'}`}>{icon}</div>
      </div>
      <div>
        <div className={`text-3xl font-black tracking-tighter truncate leading-tight ${alert ? 'text-rose-600' : colorMap[color as keyof typeof colorMap]}`}>{value}</div>
        {alert && <p className="mt-3 text-[8px] font-black text-rose-500 uppercase tracking-[0.2em] italic">Alert: Stock is low!</p>}
      </div>
    </div>
  );
};

export default App;
