
import React, { useState, useMemo, useEffect } from 'react';
import { Product, UserRole, InventoryStats, Transaction, AppConfig, Seller, Branch } from './types.ts';
import { ICONS } from './constants.tsx';
import Fuse from 'fuse.js';
import ProductModal from './components/ProductModal.tsx';
import { db } from './services/dbService.ts';

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
  const [isInitializing, setIsInitializing] = useState(true);
  const [currentUser, setCurrentUser] = useState<{ role: UserRole; name: string; branchId: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'Dashboard' | 'Inventory' | 'Register' | 'Transactions' | 'Revenue' | 'Settings'>('Dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isBasketOpen, setIsBasketOpen] = useState(false);
  const [receiptToShow, setReceiptToShow] = useState<Transaction | null>(null);
  const [revenueFilter, setRevenueFilter] = useState<DateFilter>('All');
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void } | null>(null);

  // Database States
  const [config, setConfig] = useState<AppConfig>({
    supermarketName: 'SUPERMART PRO',
    logoUrl: '',
    adminPassword: 'admin',
    sellers: [],
    branches: []
  });
  const [selectedBranchId, setSelectedBranchId] = useState<string>('');
  const [activeBranchProducts, setActiveBranchProducts] = useState<Product[]>([]);
  const [activeBranchTransactions, setActiveBranchTransactions] = useState<Transaction[]>([]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  // Initial Load
  useEffect(() => {
    const init = async () => {
      try {
        const [appConfig, branches, sellers] = await Promise.all([
          db.getConfig(),
          db.getBranches(),
          db.getSellers()
        ]);

        const fullConfig = { ...config, ...appConfig, branches, sellers };
        setConfig(fullConfig);
        
        if (branches.length > 0) {
          setSelectedBranchId(branches[0].id);
        }
      } catch (err) {
        showToast("Database connection failed", "error");
      } finally {
        setIsInitializing(false);
      }
    };
    init();
  }, []);

  // Fetch branch specific data when context changes
  useEffect(() => {
    if (selectedBranchId) {
      const loadBranchData = async () => {
        const [p, t] = await Promise.all([
          db.getProducts(selectedBranchId),
          db.getTransactions(selectedBranchId)
        ]);
        setActiveBranchProducts(p);
        setActiveBranchTransactions(t);
      };
      loadBranchData();
    }
  }, [selectedBranchId]);

  const activeBranch = useMemo(() => 
    config.branches.find(b => b.id === selectedBranchId) || config.branches[0],
    [config.branches, selectedBranchId]
  );

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
        setCurrentUser({ role: 'Admin', name: 'Super Admin', branchId: config.branches[0]?.id });
        showToast("Admin Terminal Unlocked", "success");
      } else {
        setLoginError('Invalid Pin');
      }
    } else {
      const seller = config.sellers.find(s => s.email === loginEmail && s.password === loginPassword);
      if (seller) {
        setCurrentUser({ role: 'Seller', name: seller.name, branchId: seller.branchId });
        setSelectedBranchId(seller.branchId);
        showToast(`Welcome ${seller.name}`, "success");
      } else {
        setLoginError('Invalid Credentials');
      }
    }
  };

  const handleSaveProduct = async (data: Omit<Product, 'id' | 'lastUpdated' | 'sku'>) => {
    const id = editingProduct ? editingProduct.id : Math.random().toString(36).substr(2, 9);
    const sku = editingProduct ? editingProduct.sku : (data.name.substring(0, 2).toUpperCase()) + Math.floor(1000 + Math.random() * 9000);
    const product: Product = { ...data, id, sku, lastUpdated: new Date().toISOString() };

    await db.upsertProduct(product, selectedBranchId);
    const updated = await db.getProducts(selectedBranchId);
    setActiveBranchProducts(updated);
    setIsModalOpen(false);
    setEditingProduct(null);
    showToast("Inventory Updated", "success");
  };

  const deleteProduct = (id: string) => {
    setConfirmModal({
      isOpen: true,
      title: "Confirm Deletion",
      message: "Are you sure you want to remove this SKU?",
      onConfirm: async () => {
        await db.deleteProduct(id);
        const updated = await db.getProducts(selectedBranchId);
        setActiveBranchProducts(updated);
        setConfirmModal(null);
        showToast("Product Removed", "info");
      }
    });
  };

  // Register Operations
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
    const [p, t] = await Promise.all([
      db.getProducts(selectedBranchId),
      db.getTransactions(selectedBranchId)
    ]);
    setActiveBranchProducts(p);
    setActiveBranchTransactions(t);
    setCart([]);
    setIsBasketOpen(false);
    setReceiptToShow(tx);
    showToast("Transaction Settled", "success");
  };

  const stats = useMemo((): InventoryStats => ({
    totalItems: activeBranchProducts.length,
    totalValue: activeBranchProducts.reduce((acc, p) => acc + (p.price * p.quantity), 0),
    totalCostValue: activeBranchProducts.reduce((acc, p) => acc + (p.costPrice * p.quantity), 0),
    lowStockCount: activeBranchProducts.filter(p => p.quantity > 0 && p.quantity <= p.minThreshold).length,
    outOfStockCount: activeBranchProducts.filter(p => p.quantity <= 0).length,
  }), [activeBranchProducts]);

  const fuse = useMemo(() => new Fuse(activeBranchProducts, { keys: ['name', 'sku'], threshold: 0.3 }), [activeBranchProducts]);
  const filteredProducts = useMemo(() => searchTerm ? fuse.search(searchTerm).map(r => r.item) : activeBranchProducts, [activeBranchProducts, searchTerm, fuse]);

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center flex-col gap-6">
        <div className="loader-ring"></div>
        <p className="text-slate-500 font-black uppercase text-[10px] tracking-widest animate-pulse">Establishing Secure Database Link...</p>
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
              <img src={config.logoUrl} className="w-20 h-20 mx-auto mb-6 rounded-2xl object-cover shadow-lg" />
            ) : (
              <div className="w-20 h-20 bg-blue-600 rounded-[2rem] flex items-center justify-center mx-auto mb-6 text-white shadow-xl">
                <ICONS.Inventory />
              </div>
            )}
            <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase leading-none">{config.supermarketName}</h1>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-4">Database Persistence Enabled</p>
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
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Staff Email</label>
                <input type="email" required className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-600 outline-none font-bold" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} />
              </div>
            )}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Access Pin</label>
              <input type="password" required className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-600 outline-none font-bold" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} />
            </div>
            {loginError && <p className="text-rose-500 text-[10px] font-black uppercase text-center animate-bounce">{loginError}</p>}
            <button type="submit" className="w-full py-5 bg-blue-600 text-white rounded-3xl font-black uppercase tracking-widest shadow-xl hover:bg-blue-700 transition-all">Authenticate</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden font-['Plus_Jakarta_Sans']">
      {/* Toast Container */}
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

      {/* Confirmation Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
           <div className="w-full max-w-sm bg-white rounded-[2.5rem] p-10 shadow-2xl">
              <h3 className="text-xl font-black text-slate-900 mb-4 uppercase">{confirmModal.title}</h3>
              <p className="text-sm font-bold text-slate-500 mb-10">{confirmModal.message}</p>
              <div className="flex gap-4">
                 <button onClick={() => setConfirmModal(null)} className="flex-1 py-4 bg-slate-100 rounded-2xl font-black text-[10px] uppercase">Cancel</button>
                 <button onClick={confirmModal.onConfirm} className="flex-1 py-4 bg-rose-600 text-white rounded-2xl font-black text-[10px] uppercase">Confirm</button>
              </div>
           </div>
        </div>
      )}

      {/* Sidebar Navigation */}
      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-72 bg-slate-950 text-white flex flex-col transition-all duration-300 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="p-8 flex items-center justify-between border-b border-white/5">
          <div className="flex items-center gap-4">
            {config.logoUrl ? (
              <img src={config.logoUrl} className="w-10 h-10 rounded-xl object-cover" />
            ) : (
              <div className="p-3 bg-blue-600 rounded-2xl text-white"><ICONS.Inventory /></div>
            )}
            <div className="min-w-0">
              <h1 className="text-lg font-black italic truncate uppercase leading-tight">{config.supermarketName}</h1>
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">{activeBranch?.name || 'Loading...'}</p>
            </div>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-2 text-white/50 hover:text-white transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
        <nav className="flex-1 p-6 space-y-2 overflow-y-auto">
          {[
            { id: 'Dashboard', icon: <ICONS.Dashboard />, label: 'Analytics' },
            { id: 'Inventory', icon: <ICONS.Inventory />, label: 'Stock Manager' },
            { id: 'Register', icon: <ICONS.Register />, label: 'Cashier Hub' },
            { id: 'Transactions', icon: <ICONS.Register />, label: 'Receipt Logs' },
            { id: 'Revenue', icon: <ICONS.Revenue />, label: 'Financials', adminOnly: true },
            { id: 'Settings', icon: <ICONS.Dashboard />, label: 'System Control', adminOnly: true }
          ].map(item => (
            (!item.adminOnly || currentUser.role === 'Admin') && (
              <button key={item.id} onClick={() => { setActiveTab(item.id as any); setIsSidebarOpen(false); }} className={`w-full flex items-center gap-4 px-6 py-4 rounded-2xl transition-all font-bold text-sm ${activeTab === item.id ? 'bg-blue-600 text-white shadow-xl' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
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
           <button onClick={() => setCurrentUser(null)} className="w-full py-3 bg-rose-500/10 text-rose-500 text-[10px] font-black uppercase rounded-2xl hover:bg-rose-500 hover:text-white transition-all">Logout</button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-20 bg-white border-b border-slate-200 px-6 sm:px-10 flex items-center justify-between sticky top-0 z-30 shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2.5 bg-slate-100 text-slate-600 rounded-xl">
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
                  className="appearance-none bg-blue-50 border-2 border-blue-100 rounded-2xl px-6 py-2.5 pr-12 text-[10px] font-black uppercase text-blue-700 outline-none focus:border-blue-600"
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
              <button onClick={() => setIsBasketOpen(true)} className="relative p-3 bg-slate-900 text-white rounded-2xl shadow-lg">
                <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/></svg>
                <span className="absolute -top-1.5 -right-1.5 bg-rose-500 text-white text-[10px] font-black w-6 h-6 flex items-center justify-center rounded-full border-2 border-white">{cart.length}</span>
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6 sm:p-10 custom-scrollbar">
          {activeTab === 'Dashboard' && (
            <div className="space-y-10 max-w-7xl mx-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard title="Total SKUs" value={stats.totalItems} icon={<ICONS.Dashboard />} color="slate" />
                <StatCard title="Asset Value" value={`₦${stats.totalValue.toLocaleString()}`} icon={<ICONS.Inventory />} color="blue" />
                <StatCard title="Critical Stock" value={stats.lowStockCount} icon={<ICONS.Alert />} color="amber" alert={stats.lowStockCount > 0} />
                <StatCard title="Recent Revenue" value={`₦${activeBranchTransactions.slice(0, 5).reduce((acc, t) => acc + t.total, 0).toLocaleString()}`} icon={<ICONS.Revenue />} color="emerald" />
              </div>
              <div className="bg-white rounded-[3rem] p-10 border border-slate-200 shadow-sm">
                <h3 className="text-xl font-black mb-8 uppercase flex items-center gap-3">Operational Status: {activeBranch?.name}</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                   {['Database synchronization active', 'Real-time sales tracking', 'Cloud inventory link up'].map((rec, i) => (
                     <div key={i} className="p-6 bg-slate-50 border border-slate-100 rounded-3xl flex items-center gap-4">
                        <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center font-black">{i+1}</div>
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
                      <input type="text" placeholder="Filter stock..." className="w-full pl-12 pr-6 py-3 bg-white border-2 border-slate-100 rounded-2xl outline-none font-bold shadow-sm" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                   </div>
                   {currentUser.role === 'Admin' && (
                     <button onClick={() => { setEditingProduct(null); setIsModalOpen(true); }} className="px-8 py-3 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl">Add Product</button>
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
                  <input type="text" placeholder="Search catalog..." className="w-full pl-16 pr-8 py-5 text-md font-bold bg-white border-2 border-transparent rounded-[2.5rem] focus:border-blue-600 outline-none shadow-sm" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
               </div>
               <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                 {filteredProducts.map(p => (
                   <button key={p.id} disabled={p.quantity <= 0} onClick={() => addToCart(p)} className="p-6 bg-white border-2 border-transparent rounded-[2.5rem] text-left hover:border-blue-600 transition-all relative shadow-sm overflow-hidden disabled:opacity-50">
                      <div className="text-xl font-black text-slate-900 mb-2">₦{p.price.toLocaleString()}</div>
                      <h4 className="text-xs font-black text-slate-800 line-clamp-2 uppercase">{p.name}</h4>
                      <div className={`mt-4 px-2 py-0.5 rounded-lg text-[8px] font-black w-fit ${p.quantity <= p.minThreshold ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'}`}>{p.quantity} In Stock</div>
                   </button>
                 ))}
               </div>
            </div>
          )}

          {activeTab === 'Transactions' && (
            <div className="max-w-7xl mx-auto space-y-6">
               <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div className="relative w-full max-w-md">
                     <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><ICONS.Search /></span>
                     <input type="text" placeholder="Search logs..." className="w-full pl-12 pr-6 py-3 bg-white border-2 border-slate-100 rounded-2xl outline-none font-bold shadow-sm" value={searchTermTransactions} onChange={e => setSearchTermTransactions(e.target.value)} />
                  </div>
               </div>
               <div className="bg-white rounded-[3rem] border border-slate-200 overflow-hidden shadow-sm overflow-x-auto">
                  <table className="w-full text-left min-w-[800px]">
                     <thead className="bg-slate-50 border-b">
                        <tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                           <th className="px-10 py-6">Ref ID</th>
                           <th className="px-10 py-6">Timestamp</th>
                           <th className="px-10 py-6">Total Value</th>
                           <th className="px-10 py-6 text-right">Print</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-100">
                        {activeBranchTransactions.filter(t => t.id.toLowerCase().includes(searchTermTransactions.toLowerCase())).map(t => (
                          <tr key={t.id} className="hover:bg-blue-50/10">
                             <td className="px-10 py-6 font-black text-slate-900">#{t.id}</td>
                             <td className="px-10 py-6 text-xs text-slate-500 font-bold">{new Date(t.timestamp).toLocaleString()}</td>
                             <td className="px-10 py-6 font-black text-blue-600">₦{t.total.toLocaleString()}</td>
                             <td className="px-10 py-6 text-right">
                                <button onClick={() => { setReceiptToShow(t); setTimeout(() => window.print(), 100); }} className="p-2.5 bg-slate-100 text-slate-500 rounded-xl hover:bg-emerald-600 hover:text-white transition-all">
                                  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>
                                </button>
                             </td>
                          </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
            </div>
          )}

          {activeTab === 'Settings' && currentUser.role === 'Admin' && (
            <div className="max-w-4xl mx-auto space-y-10 pb-20">
               <div className="bg-white rounded-[3rem] p-10 border border-slate-200 shadow-sm">
                  <h3 className="text-2xl font-black mb-8 uppercase tracking-tight">Branch Deployment</h3>
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
                    showToast("New Branch Online", "success");
                  }} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <input name="branchName" required placeholder="Branch Name" className="px-6 py-4 bg-slate-50 border-2 rounded-2xl outline-none font-bold focus:border-blue-600" />
                    <input name="branchLoc" required placeholder="Location" className="px-6 py-4 bg-slate-50 border-2 rounded-2xl outline-none font-bold focus:border-blue-600" />
                    <button type="submit" className="sm:col-span-2 py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px]">Provision Branch</button>
                  </form>
               </div>
               
               <div className="bg-white rounded-[3rem] p-10 border border-slate-200 shadow-sm">
                  <h3 className="text-2xl font-black mb-8 uppercase tracking-tight text-slate-400">Branding & Security</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    <div>
                       <label className="text-[10px] font-black text-slate-400 uppercase block mb-2">Store Name</label>
                       <input value={config.supermarketName} onChange={e => setConfig({...config, supermarketName: e.target.value})} className="w-full px-5 py-3.5 bg-slate-50 border-2 rounded-xl font-bold" />
                    </div>
                    <div>
                       <label className="text-[10px] font-black text-slate-400 uppercase block mb-2">Admin Master Pin</label>
                       <input type="password" value={config.adminPassword} onChange={e => setConfig({...config, adminPassword: e.target.value})} className="w-full px-5 py-3.5 bg-slate-50 border-2 rounded-xl font-bold" />
                    </div>
                    <button onClick={async () => {
                      await db.updateConfig(config.supermarketName, config.logoUrl, config.adminPassword);
                      showToast("Configuration Saved", "success");
                    }} className="sm:col-span-2 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-[10px] shadow-lg">Save Global Configuration</button>
                  </div>
               </div>
            </div>
          )}
        </div>

        {/* Overlays */}
        {isBasketOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-md">
            <div className="w-full max-w-4xl h-full sm:max-h-[850px] bg-white rounded-none sm:rounded-[4rem] shadow-2xl flex flex-col overflow-hidden">
               <div className="p-8 sm:p-12 border-b flex items-center justify-between">
                  <h3 className="text-2xl font-black uppercase">Active Basket</h3>
                  <button onClick={() => setIsBasketOpen(false)} className="p-4 bg-slate-50 rounded-2xl"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
               </div>
               <div className="flex-1 p-8 overflow-y-auto space-y-4">
                  {cart.map(item => (
                    <div key={item.id} className="p-6 bg-slate-50 border rounded-[2.5rem] flex items-center gap-6">
                       <div className="flex-1">
                          <p className="text-lg font-black uppercase">{item.name}</p>
                          <p className="text-[10px] font-bold text-slate-400">REF: {item.sku}</p>
                       </div>
                       <div className="flex items-center gap-3 p-2 bg-white rounded-2xl border">
                          <button onClick={() => { 
                            setCart(prev => prev.map(i => i.id === item.id ? { ...i, cartQuantity: Math.max(0, i.cartQuantity - 1) } : i).filter(i => i.cartQuantity > 0));
                          }} className="w-8 h-8 font-black">-</button>
                          <span className="font-black">{item.cartQuantity}</span>
                          <button onClick={() => {
                            setCart(prev => prev.map(i => i.id === item.id ? { ...i, cartQuantity: i.cartQuantity + 1 } : i));
                          }} className="w-8 h-8 font-black">+</button>
                       </div>
                       <div className="text-right font-black text-xl">₦{(item.price * item.cartQuantity).toLocaleString()}</div>
                    </div>
                  ))}
               </div>
               <div className="p-12 bg-slate-50 border-t flex flex-col sm:flex-row items-end justify-between gap-10">
                  <div>
                    <p className="text-[11px] font-black text-slate-400 uppercase mb-2">Checkout Value</p>
                    <p className="text-5xl font-black text-blue-600 tracking-tighter">₦{cart.reduce((a, i) => a + (i.price * i.cartQuantity), 0).toLocaleString()}</p>
                  </div>
                  <button onClick={completeCheckout} disabled={cart.length === 0} className="w-full sm:w-auto px-16 py-6 bg-slate-900 text-white rounded-[2rem] font-black uppercase shadow-2xl disabled:opacity-20">Process Sale</button>
               </div>
            </div>
          </div>
        )}

        {receiptToShow && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl print-receipt-overlay">
            <div className="w-full max-w-sm bg-white rounded-[3rem] p-10 shadow-2xl print-receipt-card">
              <div className="text-center mb-8 border-b pb-8">
                <h3 className="text-2xl font-black uppercase">{config.supermarketName}</h3>
                <p className="text-[10px] font-black text-slate-500 uppercase">{activeBranch?.name}</p>
              </div>
              <div className="space-y-4 mb-8">
                {receiptToShow.items.map((item, idx) => (
                  <div key={idx} className="flex justify-between text-xs font-bold">
                    <span>{item.name} x{item.quantity}</span>
                    <span>₦{(item.price * item.quantity).toLocaleString()}</span>
                  </div>
                ))}
              </div>
              <div className="border-t-2 border-dashed pt-6 mb-10 flex justify-between items-center">
                <span className="text-[10px] font-black text-slate-400 uppercase">Total</span>
                <span className="text-3xl font-black text-blue-600">₦{receiptToShow.total.toLocaleString()}</span>
              </div>
              <div className="flex flex-col gap-3 print:hidden">
                <button onClick={() => window.print()} className="w-full py-4 bg-blue-600 text-white rounded-[2rem] font-black text-[10px] uppercase">Print Receipt</button>
                <button onClick={() => setReceiptToShow(null)} className="w-full py-4 bg-slate-900 text-white rounded-[2rem] font-black text-[10px] uppercase">Close</button>
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
    <div className={`p-8 bg-white border-2 rounded-[2.5rem] transition-all flex flex-col justify-between ${alert ? 'border-rose-100 shadow-xl' : 'border-slate-50 shadow-sm hover:shadow-xl group'}`}>
      <div className="flex items-center justify-between mb-8">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{title}</span>
        <div className={`p-3 rounded-xl ${alert ? 'bg-rose-500 text-white' : 'bg-slate-50 text-slate-400 group-hover:bg-blue-600 group-hover:text-white'}`}>{icon}</div>
      </div>
      <div>
        <div className={`text-3xl font-black tracking-tighter ${alert ? 'text-rose-600' : colorMap[color as keyof typeof colorMap]}`}>{value}</div>
        {alert && <p className="mt-3 text-[8px] font-black text-rose-500 uppercase tracking-[0.2em] animate-pulse">Critical Alert</p>}
      </div>
    </div>
  );
};

export default App;
