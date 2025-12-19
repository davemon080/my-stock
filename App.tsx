
import React, { useState, useMemo, useEffect } from 'react';
import { Product, InventoryStats, AIResponse, UserRole, Transaction } from './types.ts';
import { INITIAL_PRODUCTS, CATEGORIES, ICONS } from './constants.tsx';
import DashboardCard from './components/DashboardCard.tsx';
import ProductModal from './components/ProductModal.tsx';
import { getInventoryInsights } from './services/geminiService.ts';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import Fuse from 'fuse.js';

interface SidebarLinkProps {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  onClick: () => void;
}

const SidebarLink: React.FC<SidebarLinkProps> = ({ icon, label, active, onClick }) => (
  <button 
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 ${active ? 'bg-white/10 text-white font-bold' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
  >
    <span className={`transition-transform duration-300 ${active ? 'scale-110' : ''}`}>{icon}</span>
    <span className="text-sm">{label}</span>
  </button>
);

const App: React.FC = () => {
  const [role, setRole] = useState<UserRole>('Admin');
  const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [aiInsight, setAiInsight] = useState<AIResponse | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'Dashboard' | 'Inventory' | 'Transactions' | 'Settings'>('Dashboard');

  // Persistence
  useEffect(() => {
    try {
      const savedProducts = localStorage.getItem('sm_products_v3');
      const savedTransactions = localStorage.getItem('sm_transactions_v3');
      if (savedProducts) setProducts(JSON.parse(savedProducts));
      if (savedTransactions) setTransactions(JSON.parse(savedTransactions));
    } catch (e) {
      console.warn("Could not load from localStorage", e);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('sm_products_v3', JSON.stringify(products));
    localStorage.setItem('sm_transactions_v3', JSON.stringify(transactions));
  }, [products, transactions]);

  const stats = useMemo((): InventoryStats => {
    const today = new Date();
    const nextWeek = new Date();
    nextWeek.setDate(today.getDate() + 7);

    return {
      totalItems: products.length,
      totalValue: products.reduce((acc, p) => acc + (p.price * p.quantity), 0),
      lowStockCount: products.filter(p => p.quantity > 0 && p.quantity <= p.minThreshold).length,
      expiringSoonCount: products.filter(p => {
        if (!p.expiryDate) return false;
        const expiry = new Date(p.expiryDate);
        return expiry <= nextWeek && expiry >= today;
      }).length,
      outOfStockCount: products.filter(p => p.quantity <= 0).length
    };
  }, [products]);

  const chartData = useMemo(() => {
    return CATEGORIES.map(cat => ({
      name: cat,
      count: products.filter(p => p.category === cat).length
    })).filter(d => d.count > 0);
  }, [products]);

  const fuse = useMemo(() => {
    return new Fuse(products, {
      keys: ['name', 'sku', 'description', 'tags'],
      threshold: 0.3,
    });
  }, [products]);

  const filteredProducts = useMemo(() => {
    let result = products;
    if (searchTerm.trim()) result = fuse.search(searchTerm).map(i => i.item);
    if (selectedCategory !== 'All') result = result.filter(p => p.category === selectedCategory);
    return result;
  }, [products, searchTerm, selectedCategory, fuse]);

  const handleSaveProduct = (data: Omit<Product, 'id' | 'lastUpdated'>) => {
    if (editingProduct) {
      setProducts(prev => prev.map(p => 
        p.id === editingProduct.id 
          ? { ...data, id: p.id, lastUpdated: new Date().toISOString() } 
          : p
      ));
    } else {
      const newProduct: Product = {
        ...data,
        id: Math.random().toString(36).substr(2, 9),
        lastUpdated: new Date().toISOString()
      };
      setProducts(prev => [...prev, newProduct]);
    }
    setIsModalOpen(false);
    setEditingProduct(null);
  };

  const processTransaction = (id: string, type: 'SALE' | 'RESTOCK', qty: number) => {
    const product = products.find(p => p.id === id);
    if (!product) return;

    if (type === 'SALE' && product.quantity < qty) {
      alert("Insufficient stock!");
      return;
    }

    const delta = type === 'SALE' ? -qty : qty;
    
    setProducts(prev => prev.map(p => 
      p.id === id 
        ? { ...p, quantity: p.quantity + delta, lastUpdated: new Date().toISOString() } 
        : p
    ));

    const newTransaction: Transaction = {
      id: Math.random().toString(36).substr(2, 9),
      productId: id,
      productName: product.name,
      type,
      quantity: qty,
      price: product.price * qty,
      timestamp: new Date().toISOString()
    };
    setTransactions(prev => [newTransaction, ...prev].slice(0, 100));
  };

  const generateAIReport = async () => {
    setIsAiLoading(true);
    try {
      const result = await getInventoryInsights(products);
      setAiInsight(result);
    } catch (err) {
      console.error("AI Generation Error:", err);
    } finally {
      setIsAiLoading(false);
    }
  };

  const isAdmin = role === 'Admin';

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden">
      {/* Sidebar Navigation */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col hidden lg:flex">
        <div className="p-6 border-b border-slate-800 flex items-center gap-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isAdmin ? 'bg-blue-600' : 'bg-emerald-600'}`}>
            <ICONS.Box />
          </div>
          <span className="font-bold text-lg tracking-tight">SuperMart Pro</span>
        </div>

        <nav className="flex-1 p-4 space-y-2 mt-4">
          <SidebarLink icon={<ICONS.Layout />} label="Dashboard" active={activeTab === 'Dashboard'} onClick={() => setActiveTab('Dashboard')} />
          <SidebarLink icon={<ICONS.List />} label="Inventory" active={activeTab === 'Inventory'} onClick={() => setActiveTab('Inventory')} />
          {!isAdmin && <SidebarLink icon={<ICONS.History />} label="Quick Entry" active={activeTab === 'Transactions'} onClick={() => setActiveTab('Transactions')} />}
          <SidebarLink icon={<ICONS.Activity />} label="Analytics" active={activeTab === 'Settings'} onClick={() => setActiveTab('Settings')} />
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="bg-slate-800/50 p-3 rounded-xl">
             <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{role} Mode</span>
             </div>
             <div className="flex gap-2">
                <button 
                  onClick={() => setRole('Admin')}
                  className={`flex-1 py-1.5 rounded-md text-[10px] font-bold transition-all ${isAdmin ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                >Admin</button>
                <button 
                  onClick={() => setRole('Seller')}
                  className={`flex-1 py-1.5 rounded-md text-[10px] font-bold transition-all ${!isAdmin ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                >Seller</button>
             </div>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
          <h2 className="text-xl font-bold text-slate-800">{activeTab}</h2>
          <div className="flex items-center gap-4">
            <div className="relative group">
               <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><ICONS.Search /></span>
               <input 
                 type="text" 
                 placeholder="Search anything..." 
                 className="pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none w-64 transition-all"
                 value={searchTerm}
                 onChange={e => setSearchTerm(e.target.value)}
               />
            </div>
            {isAdmin && (
               <button 
                 onClick={() => { setEditingProduct(null); setIsModalOpen(true); }}
                 className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold shadow-lg shadow-blue-600/20 hover:bg-blue-700 transition-all"
               >
                 <ICONS.Plus /> New Product
               </button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {activeTab === 'Dashboard' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <DashboardCard title="Total Inventory" value={stats.totalItems} icon={<ICONS.Box />} color="blue" />
                <DashboardCard title="Revenue (Est)" value={`₦${stats.totalValue.toLocaleString()}`} icon={<span className="font-bold">₦</span>} color="green" trend="+8.4%" />
                <DashboardCard title="Low Stock Items" value={stats.lowStockCount} icon={<ICONS.Alert />} color="amber" />
                <DashboardCard title="Out of Stock" value={stats.outOfStockCount} icon={<ICONS.Alert />} color="red" />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="font-bold text-slate-800">Inventory Mix</h3>
                  </div>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10 }} />
                        <Tooltip 
                          cursor={{ fill: '#f8fafc' }} 
                          contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} 
                        />
                        <Bar dataKey="count" radius={[6, 6, 0, 0]} barSize={40}>
                          {chartData.map((e, i) => <Cell key={i} fill={isAdmin ? '#3b82f6' : '#10b981'} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="space-y-6">
                  {isAdmin ? (
                    <div className="bg-indigo-600 rounded-2xl p-6 text-white shadow-xl relative overflow-hidden">
                       <div className="absolute top-0 right-0 p-4 opacity-10 scale-150 rotate-12"><ICONS.Sparkles /></div>
                       <h3 className="font-bold text-lg mb-2">AI Insights</h3>
                       <p className="text-indigo-100 text-sm mb-6 leading-relaxed">
                         {aiInsight ? aiInsight.insight : "Run an AI report to analyze your inventory trends and reorder points."}
                       </p>
                       <button 
                         onClick={generateAIReport}
                         disabled={isAiLoading}
                         className="w-full py-2.5 bg-white text-indigo-600 rounded-xl text-xs font-bold hover:bg-indigo-50 transition-all shadow-lg"
                       >
                         {isAiLoading ? "Processing..." : "Generate AI Report"}
                       </button>
                    </div>
                  ) : (
                    <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                      <h3 className="font-bold text-slate-800 mb-4">Recent Activity</h3>
                      <div className="space-y-4">
                        {transactions.slice(0, 5).map(t => (
                          <div key={t.id} className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <div className={`p-2 rounded-lg ${t.type === 'SALE' ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                {t.type === 'SALE' ? '↓' : '↑'}
                              </div>
                              <div>
                                <p className="font-bold text-slate-800">{t.productName}</p>
                                <p className="text-slate-400">{new Date(t.timestamp).toLocaleTimeString()}</p>
                              </div>
                            </div>
                            <span className="font-mono font-bold text-slate-500">{t.type === 'SALE' ? '-' : '+'}{t.quantity}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'Inventory' && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in zoom-in-95 duration-300">
               <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <select 
                      className="bg-white border border-slate-200 rounded-lg px-3 py-1.5 text-xs font-bold focus:ring-2 focus:ring-blue-500 outline-none"
                      value={selectedCategory}
                      onChange={e => setSelectedCategory(e.target.value)}
                    >
                      <option value="All">All Categories</option>
                      {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                    </select>
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{filteredProducts.length} Items Listed</span>
               </div>
               
               <div className="overflow-x-auto">
                 <table className="w-full text-left text-sm border-collapse">
                   <thead>
                     <tr className="bg-slate-50/50 text-slate-400 text-[10px] font-bold uppercase tracking-wider border-b border-slate-100">
                       <th className="px-6 py-4">Item Details</th>
                       <th className="px-6 py-4">SKU</th>
                       <th className="px-6 py-4">Category</th>
                       <th className="px-6 py-4">Stock</th>
                       <th className="px-6 py-4">Price</th>
                       <th className="px-6 py-4 text-right">Actions</th>
                     </tr>
                   </thead>
                   <tbody className="divide-y divide-slate-100">
                     {filteredProducts.map(p => (
                       <tr key={p.id} className="hover:bg-slate-50/50 transition-colors group">
                         <td className="px-6 py-4">
                            <p className="font-bold text-slate-800">{p.name}</p>
                            <p className="text-[10px] text-slate-400 line-clamp-1 max-w-xs">{p.description}</p>
                         </td>
                         <td className="px-6 py-4 font-mono text-[10px] font-bold text-slate-400">{p.sku}</td>
                         <td className="px-6 py-4">
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded text-[10px] font-bold uppercase">{p.category}</span>
                         </td>
                         <td className="px-6 py-4">
                            <div className="flex items-center gap-2">
                               <div className={`w-2 h-2 rounded-full ${p.quantity <= p.minThreshold ? 'bg-red-500 animate-pulse' : 'bg-green-500'}`}></div>
                               <span className="font-bold">{p.quantity}</span>
                            </div>
                         </td>
                         <td className="px-6 py-4 font-bold text-slate-600">₦{p.price.toLocaleString()}</td>
                         <td className="px-6 py-4 text-right">
                            <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                               {isAdmin ? (
                                 <>
                                   <button onClick={() => { setEditingProduct(p); setIsModalOpen(true); }} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg">Edit</button>
                                   <button onClick={() => { if(confirm('Delete?')) setProducts(prev => prev.filter(i => i.id !== p.id)) }} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg"><ICONS.Trash /></button>
                                 </>
                               ) : (
                                 <div className="flex gap-1">
                                    <button onClick={() => processTransaction(p.id, 'SALE', 1)} className="px-3 py-1 bg-white border border-slate-200 rounded text-[10px] font-bold hover:bg-red-50 hover:text-red-600 transition-all">SELL</button>
                                    <button onClick={() => processTransaction(p.id, 'RESTOCK', 10)} className="px-3 py-1 bg-emerald-600 text-white rounded text-[10px] font-bold hover:bg-emerald-700 transition-all">RESTOCK</button>
                                 </div>
                               )}
                            </div>
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
            </div>
          )}

          {activeTab === 'Transactions' && !isAdmin && (
             <div className="bg-white rounded-2xl border border-slate-200 shadow-md p-6 h-full flex flex-col animate-in fade-in slide-in-from-right-4 duration-500">
                <div className="flex items-center justify-between mb-8">
                  <div>
                    <h3 className="text-xl font-bold text-slate-800">Quick Excel-Style Manager</h3>
                    <p className="text-sm text-slate-400">Perform bulk stock updates and sales recorded instantly.</p>
                  </div>
                  <div className="bg-emerald-50 px-4 py-2 rounded-xl flex items-center gap-2 text-emerald-600 font-bold text-xs">
                     <ICONS.History /> Real-time Batch Sync Active
                  </div>
                </div>

                <div className="flex-1 overflow-auto bg-slate-50 border border-slate-200 rounded-xl">
                   <table className="w-full text-xs table-fixed">
                     <thead className="sticky top-0 bg-white shadow-sm z-10">
                        <tr className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">
                           <th className="w-12 px-4 py-3 text-center">ID</th>
                           <th className="w-48 px-4 py-3">Item Name</th>
                           <th className="w-24 px-4 py-3">Stock Level</th>
                           <th className="w-48 px-4 py-3">Quick Actions</th>
                           <th className="w-32 px-4 py-3">Sale Record</th>
                           <th className="px-4 py-3">Update Status</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-200">
                        {filteredProducts.map((p, idx) => (
                          <tr key={p.id} className="hover:bg-white transition-all group">
                            <td className="px-4 py-3 text-center font-mono text-slate-300">{idx + 1}</td>
                            <td className="px-4 py-3 font-bold text-slate-700 truncate">{p.name}</td>
                            <td className={`px-4 py-3 font-bold ${p.quantity <= p.minThreshold ? 'text-red-600' : 'text-slate-500'}`}>{p.quantity}</td>
                            <td className="px-4 py-3">
                               <div className="flex items-center gap-2">
                                  <button onClick={() => processTransaction(p.id, 'RESTOCK', 1)} className="w-8 h-8 rounded border border-slate-200 flex items-center justify-center hover:bg-blue-50 transition-colors">+1</button>
                                  <button onClick={() => processTransaction(p.id, 'RESTOCK', 10)} className="px-2 h-8 rounded border border-slate-200 flex items-center justify-center font-bold hover:bg-blue-50 transition-colors">+10</button>
                                  <button onClick={() => processTransaction(p.id, 'RESTOCK', 50)} className="px-2 h-8 rounded border border-slate-200 flex items-center justify-center font-bold hover:bg-blue-50 transition-colors">+50</button>
                               </div>
                            </td>
                            <td className="px-4 py-3">
                               <div className="flex items-center gap-1">
                                  <button 
                                    onClick={() => processTransaction(p.id, 'SALE', 1)} 
                                    disabled={p.quantity < 1}
                                    className="px-4 py-2 bg-slate-900 text-white rounded text-[10px] font-bold hover:bg-red-600 disabled:opacity-50 transition-all uppercase"
                                  >Record 1 Sale</button>
                               </div>
                            </td>
                            <td className="px-4 py-3">
                               <div className="flex items-center gap-2">
                                  <div className="flex-1 bg-slate-200 h-1.5 rounded-full overflow-hidden">
                                     <div 
                                       className={`h-full transition-all duration-500 ${p.quantity <= p.minThreshold ? 'bg-red-500' : 'bg-emerald-500'}`} 
                                       style={{ width: `${Math.min(100, (p.quantity / (p.minThreshold * 5)) * 100)}%` }}
                                     ></div>
                                  </div>
                                  <span className="text-[9px] font-bold text-slate-400">{Math.round(Math.min(100, (p.quantity / (p.minThreshold * 5)) * 100))}%</span>
                               </div>
                            </td>
                          </tr>
                        ))}
                     </tbody>
                   </table>
                </div>
             </div>
          )}

          {activeTab === 'Settings' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-in fade-in slide-in-from-top-4 duration-500">
               <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm">
                  <h3 className="font-bold text-slate-800 mb-6">Profile Settings</h3>
                  <div className="space-y-4">
                     <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-100">
                        <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white ${isAdmin ? 'bg-blue-600' : 'bg-emerald-600'}`}>
                           {role[0]}
                        </div>
                        <div>
                           <p className="font-bold text-slate-800">Branch User</p>
                           <p className="text-xs text-slate-400">{role} Account</p>
                        </div>
                     </div>
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

export default App;
