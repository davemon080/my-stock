
import React, { useState, useMemo, useEffect } from 'react';
import { Product, UserRole, InventoryStats, Category } from './types.ts';
import { INITIAL_PRODUCTS, CATEGORIES, ICONS } from './constants.tsx';
import Fuse from 'fuse.js';
import ProductModal from './components/ProductModal.tsx';
import { getInventoryInsights } from './services/geminiService.ts';

const App: React.FC = () => {
  const [role, setRole] = useState<UserRole>('Admin');
  const [activeTab, setActiveTab] = useState<'Dashboard' | 'Inventory' | 'Register'>('Dashboard');
  const [products, setProducts] = useState<Product[]>(() => {
    const saved = localStorage.getItem('sm_inventory_v1');
    return saved ? JSON.parse(saved) : INITIAL_PRODUCTS;
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  
  // AI Insights state
  const [insights, setInsights] = useState<{insight: string, recommendations: string[]}>({
    insight: 'Waiting for inventory data to analyze...',
    recommendations: []
  });
  const [loadingInsights, setLoadingInsights] = useState(false);

  useEffect(() => {
    localStorage.setItem('sm_inventory_v1', JSON.stringify(products));
  }, [products]);

  // Refetch insights whenever products change while on the Dashboard
  useEffect(() => {
    if (products.length > 0 && activeTab === 'Dashboard') {
      const fetchInsights = async () => {
        setLoadingInsights(true);
        try {
          const data = await getInventoryInsights(products);
          setInsights(data);
        } catch (e) {
          console.error("Failed to fetch insights:", e);
        } finally {
          setLoadingInsights(false);
        }
      };
      fetchInsights();
    }
  }, [products, activeTab]);

  const stats = useMemo((): InventoryStats => {
    return {
      totalItems: products.length,
      totalValue: products.reduce((acc, p) => acc + (p.price * p.quantity), 0),
      lowStockCount: products.filter(p => p.quantity > 0 && p.quantity <= p.minThreshold).length,
      outOfStockCount: products.filter(p => p.quantity <= 0).length,
    };
  }, [products]);

  const fuse = useMemo(() => new Fuse(products, { keys: ['name', 'sku'], threshold: 0.3 }), [products]);
  
  const filteredProducts = useMemo(() => {
    if (!searchTerm) return products;
    return fuse.search(searchTerm).map(r => r.item);
  }, [products, searchTerm, fuse]);

  const toggleStock = (id: string, delta: number) => {
    setProducts(prev => prev.map(p => 
      p.id === id ? { ...p, quantity: Math.max(0, p.quantity + delta), lastUpdated: new Date().toISOString() } : p
    ));
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
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 text-white flex flex-col shadow-2xl z-20">
        <div className="p-6 flex items-center gap-3 border-b border-white/5">
          <div className="bg-blue-500 p-2 rounded-lg">
            <ICONS.Inventory />
          </div>
          <h1 className="font-bold text-lg tracking-tight">SuperMart Pro</h1>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          {[
            { id: 'Dashboard', icon: <ICONS.Dashboard />, label: 'Analytics' },
            { id: 'Inventory', icon: <ICONS.Inventory />, label: 'Stock Manager' },
            { id: 'Register', icon: <ICONS.Register />, label: 'Quick Register' }
          ].map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id as any)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                activeTab === item.id ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`}
            >
              {item.icon}
              <span className="text-sm font-semibold">{item.label}</span>
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-white/5">
          <div className="bg-slate-800 p-3 rounded-xl flex items-center justify-between">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{role}</span>
            <button 
              onClick={() => setRole(role === 'Admin' ? 'Seller' : 'Admin')}
              className="text-[10px] bg-slate-700 px-2 py-1 rounded-md hover:bg-slate-600 transition-colors"
            >
              Switch Mode
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 px-8 flex items-center justify-between shrink-0">
          <h2 className="text-xl font-bold text-slate-800">{activeTab}</h2>
          <div className="flex items-center gap-4">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><ICONS.Search /></span>
              <input 
                type="text" 
                placeholder="Search stock..." 
                className="pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none w-64 transition-all focus:w-80"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            {role === 'Admin' && (
              <button 
                onClick={() => { setEditingProduct(null); setIsModalOpen(true); }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-bold shadow-lg shadow-blue-600/30 hover:bg-blue-700 transition-all"
              >
                <ICONS.Plus /> Add Product
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
          {activeTab === 'Dashboard' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
              <StatCard title="Total Value" value={`₦${stats.totalValue.toLocaleString()}`} color="blue" />
              <StatCard title="Unique SKUs" value={stats.totalItems} color="slate" />
              <StatCard title="Low Stock" value={stats.lowStockCount} color="amber" alert={stats.lowStockCount > 0} />
              <StatCard title="Out of Stock" value={stats.outOfStockCount} color="rose" alert={stats.outOfStockCount > 0} />
              
              <div className="col-span-full bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
                <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                  <span className="bg-blue-100 text-blue-600 p-1.5 rounded-lg inline-flex"><ICONS.Dashboard /></span>
                  Gemini Inventory Insights
                </h3>
                
                {loadingInsights ? (
                  <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                    <div className="w-10 h-10 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin mb-4"></div>
                    <p className="text-sm font-medium">Generating smart recommendations...</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <div className="lg:col-span-1">
                      <div className="bg-blue-50/50 p-5 rounded-2xl border border-blue-100 h-full">
                        <span className="text-[10px] font-bold text-blue-500 uppercase tracking-widest block mb-2">Inventory Health</span>
                        <p className="text-sm text-slate-700 leading-relaxed italic">
                          "{insights.insight}"
                        </p>
                      </div>
                    </div>
                    <div className="lg:col-span-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-4">Action Plan</span>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {insights.recommendations.map((rec, i) => (
                          <div key={i} className="flex items-start gap-4 p-4 bg-white border border-slate-100 rounded-xl hover:border-blue-200 hover:bg-slate-50 transition-all group">
                            <div className="mt-0.5 w-6 h-6 flex items-center justify-center bg-blue-100 text-blue-600 rounded-full text-[10px] font-bold shrink-0 group-hover:scale-110 transition-transform">
                              {i + 1}
                            </div>
                            <span className="text-sm text-slate-600 leading-snug">{rec}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {(activeTab === 'Inventory' || activeTab === 'Register') && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-in fade-in zoom-in-95 duration-300">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr className="text-slate-500 text-[10px] font-bold uppercase tracking-wider">
                      <th className="px-6 py-4">Product Details</th>
                      <th className="px-6 py-4">Category</th>
                      <th className="px-6 py-4">Price</th>
                      <th className="px-6 py-4">Stock Level</th>
                      <th className="px-6 py-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredProducts.map(p => (
                      <tr key={p.id} className="hover:bg-slate-50/50 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="font-bold text-slate-800">{p.name}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{p.sku}</div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-600 font-medium">{p.category}</td>
                        <td className="px-6 py-4 text-sm text-slate-900 font-bold">₦{p.price.toLocaleString()}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-1 rounded-md text-[10px] font-bold ${
                              p.quantity <= 0 ? 'bg-rose-100 text-rose-600' : 
                              p.quantity <= p.minThreshold ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'
                            }`}>
                              {p.quantity} Units
                            </span>
                            {p.quantity <= p.minThreshold && <span className="text-amber-500 animate-pulse"><ICONS.Alert /></span>}
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={() => toggleStock(p.id, -1)}
                              className="w-8 h-8 flex items-center justify-center bg-slate-100 rounded-lg hover:bg-rose-100 hover:text-rose-600 transition-all text-slate-400"
                            > - </button>
                            <button 
                              onClick={() => toggleStock(p.id, 1)}
                              className="w-8 h-8 flex items-center justify-center bg-slate-100 rounded-lg hover:bg-emerald-100 hover:text-emerald-600 transition-all text-slate-400"
                            > + </button>
                            {role === 'Admin' && (
                              <button 
                                onClick={() => { setEditingProduct(p); setIsModalOpen(true); }}
                                className="ml-4 text-xs font-bold text-blue-600 hover:underline"
                              >
                                Edit
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                    {filteredProducts.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-20 text-center text-slate-400 text-sm italic">
                          No matching products found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Shared Modal Component */}
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
  const borderColors: Record<string, string> = {
    blue: 'border-blue-100',
    slate: 'border-slate-100',
    amber: 'border-amber-100',
    rose: 'border-rose-100',
  };

  return (
    <div className={`bg-white p-6 rounded-2xl border-2 transition-all ${alert ? 'border-rose-100 shadow-rose-100/50 shadow-lg animate-pulse' : `${borderColors[color] || 'border-slate-100'} shadow-sm`}`}>
      <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">{title}</div>
      <div className={`text-2xl font-black ${alert ? 'text-rose-600' : 'text-slate-800'}`}>{value}</div>
      {alert && <div className="text-[10px] font-bold text-rose-500 mt-2 flex items-center gap-1"><ICONS.Alert /> ACTION REQUIRED</div>}
    </div>
  );
};

export default App;