
import React, { useState, useMemo, useEffect } from 'react';
import { Product, InventoryStats, AIResponse, UserRole } from './types';
import { INITIAL_PRODUCTS, CATEGORIES, ICONS } from './constants';
import DashboardCard from './components/DashboardCard';
import ProductModal from './components/ProductModal';
import { getInventoryInsights } from './services/geminiService';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import Fuse from 'fuse.js';

const App: React.FC = () => {
  const [role, setRole] = useState<UserRole>('Admin');
  const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [aiInsight, setAiInsight] = useState<AIResponse | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  // Persistence (Simulation)
  useEffect(() => {
    const saved = localStorage.getItem('sm_inventory_v2');
    if (saved) {
      setProducts(JSON.parse(saved));
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('sm_inventory_v2', JSON.stringify(products));
  }, [products]);

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
      keys: [
        { name: 'name', weight: 1.0 },
        { name: 'sku', weight: 0.8 },
        { name: 'description', weight: 0.5 },
        { name: 'tags', weight: 0.7 }
      ],
      threshold: 0.3,
      distance: 100,
      ignoreLocation: true
    });
  }, [products]);

  const filteredProducts = useMemo(() => {
    let result = products;
    if (searchTerm.trim()) {
      result = fuse.search(searchTerm).map(item => item.item);
    }
    if (selectedCategory !== 'All') {
      result = result.filter(p => p.category === selectedCategory);
    }
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

  const updateQuantity = (id: string, delta: number) => {
    setProducts(prev => prev.map(p => {
      if (p.id === id) {
        const newQty = Math.max(0, p.quantity + delta);
        return { ...p, quantity: newQty, lastUpdated: new Date().toISOString() };
      }
      return p;
    }));
  };

  const handleDelete = (id: string) => {
    if (confirm('Are you sure you want to delete this product?')) {
      setProducts(prev => prev.filter(p => p.id !== id));
    }
  };

  const generateAIReport = async () => {
    setIsAiLoading(true);
    const result = await getInventoryInsights(products);
    setAiInsight(result);
    setIsAiLoading(false);
  };

  const isAdmin = role === 'Admin';

  return (
    <div className={`min-h-screen pb-12 transition-colors duration-300 ${isAdmin ? 'bg-slate-50' : 'bg-emerald-50/30'}`}>
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-white transition-colors duration-300 ${isAdmin ? 'bg-blue-600' : 'bg-emerald-600'}`}>
              <ICONS.Box />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800 tracking-tight leading-none">SuperMart Pro</h1>
              <p className={`text-[10px] font-bold uppercase tracking-widest mt-1 ${isAdmin ? 'text-blue-500' : 'text-emerald-500'}`}>
                {role} Panel
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            {/* Role Switcher */}
            <div className="bg-slate-100 p-1 rounded-lg flex items-center">
              <button 
                onClick={() => setRole('Admin')}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${role === 'Admin' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Admin
              </button>
              <button 
                onClick={() => setRole('Seller')}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${role === 'Seller' ? 'bg-white text-emerald-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Seller
              </button>
            </div>

            {isAdmin && (
              <>
                <button 
                  onClick={generateAIReport}
                  disabled={isAiLoading}
                  className="hidden md:flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-600 rounded-lg font-medium hover:bg-indigo-100 transition-all disabled:opacity-50"
                >
                  <ICONS.Sparkles />
                  {isAiLoading ? 'Analyzing...' : 'AI Insights'}
                </button>
                <button 
                  onClick={() => { setEditingProduct(null); setIsModalOpen(true); }}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-all shadow-lg shadow-blue-600/20"
                >
                  <ICONS.Plus />
                  <span className="hidden sm:inline">Add Product</span>
                </button>
              </>
            )}
            
            {!isAdmin && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 px-3 py-2 bg-emerald-100 text-emerald-700 rounded-lg text-xs font-bold">
                  <ICONS.Users />
                  Seller Mode
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 mt-8">
        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          <DashboardCard 
            title="Total Products" 
            value={stats.totalItems} 
            icon={<ICONS.Box />} 
            color={isAdmin ? "blue" : "green"}
          />
          {isAdmin ? (
            <DashboardCard 
              title="Inventory Value" 
              value={`₦${stats.totalValue.toLocaleString()}`} 
              icon={<span className="font-bold text-lg">₦</span>} 
              color="green"
              trend="+12% this week"
            />
          ) : (
            <DashboardCard 
              title="Out of Stock" 
              value={stats.outOfStockCount} 
              icon={<ICONS.Alert />} 
              color="red"
            />
          )}
          <DashboardCard 
            title="Low Stock" 
            value={stats.lowStockCount} 
            icon={<ICONS.Alert />} 
            color="amber"
          />
          <DashboardCard 
            title="Expiring Soon" 
            value={stats.expiringSoonCount} 
            icon={<ICONS.Alert />} 
            color="red"
          />
        </div>

        {/* AI Insight Section (Admin Only) */}
        {isAdmin && aiInsight && (
          <div className="mt-8 p-6 bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-100 rounded-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 scale-150"> <ICONS.Sparkles /> </div>
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-4 text-indigo-900 font-bold">
                <ICONS.Sparkles /> <h2>AI Inventory Analysis</h2>
              </div>
              <p className="text-indigo-800 mb-4 max-w-3xl leading-relaxed">{aiInsight.insight}</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {aiInsight.recommendations.map((rec, idx) => (
                  <div key={idx} className="text-sm text-indigo-700 bg-white/60 p-3 rounded-xl border border-indigo-100 flex gap-2">
                    <span className="text-indigo-400 font-bold">•</span> {rec}
                  </div>
                ))}
              </div>
              <button onClick={() => setAiInsight(null)} className="mt-6 text-[10px] font-bold uppercase text-indigo-400 hover:text-indigo-600 tracking-widest">
                Dismiss Insights
              </button>
            </div>
          </div>
        )}

        <div className="mt-8 flex flex-col lg:flex-row gap-8">
          {/* Main List Section */}
          <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row gap-4 items-center justify-between">
              <h2 className="text-lg font-bold text-slate-800">Inventory Status</h2>
              <div className="flex items-center gap-3 w-full md:w-auto">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"><ICONS.Search /></span>
                  <input 
                    type="text" 
                    placeholder="Search inventory..."
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                  />
                </div>
                <select 
                  className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  value={selectedCategory}
                  onChange={e => setSelectedCategory(e.target.value)}
                >
                  <option value="All">All Categories</option>
                  {CATEGORIES.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50/50 text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                    <th className="px-6 py-4">Product</th>
                    <th className="px-6 py-4">Category</th>
                    <th className="px-6 py-4">Quantity</th>
                    <th className="px-6 py-4">Price</th>
                    <th className="px-6 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProducts.map(product => (
                    <tr key={product.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-800">{product.name}</span>
                          <span className="text-[10px] font-mono text-slate-400 uppercase">{product.sku}</span>
                          <div className="flex gap-1 mt-1">
                            {product.tags?.map(t => <span key={t} className="px-1.5 py-0.5 bg-slate-100 text-slate-500 rounded text-[9px] font-bold">{t}</span>)}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className="px-2 py-1 bg-slate-100 text-slate-500 rounded-lg text-xs font-bold">{product.category}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-bold ${product.quantity <= 0 ? 'text-red-600' : product.quantity <= product.minThreshold ? 'text-amber-600' : 'text-slate-700'}`}>
                            {product.quantity}
                          </span>
                          {product.quantity <= product.minThreshold && (
                            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm font-bold text-slate-600">
                        ₦{product.price.toLocaleString()}
                      </td>
                      <td className="px-6 py-4 text-right">
                        {isAdmin ? (
                          <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => { setEditingProduct(product); setIsModalOpen(true); }} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg">Edit</button>
                            <button onClick={() => handleDelete(product.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg"><ICONS.Trash /></button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            <button 
                              onClick={() => updateQuantity(product.id, -1)}
                              disabled={product.quantity <= 0}
                              className="flex items-center gap-1 px-3 py-1.5 bg-white border border-slate-200 text-slate-600 rounded-lg text-xs font-bold hover:bg-slate-50 disabled:opacity-50 transition-colors"
                            >
                              <ICONS.Minus /> Sell
                            </button>
                            <button 
                              onClick={() => updateQuantity(product.id, 1)}
                              className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700 transition-colors"
                            >
                              <ICONS.Plus /> Restock
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Side Panel */}
          <div className="w-full lg:w-80 space-y-6">
             <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Stock Distribution</h3>
                <div className="h-64">
                   <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chartData} layout="vertical">
                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                        <XAxis type="number" hide />
                        <YAxis dataKey="name" type="category" width={80} style={{ fontSize: '10px', fontWeight: 'bold' }} />
                        <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }} />
                        <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                          {chartData.map((e, i) => <Cell key={i} fill={isAdmin ? '#3b82f6' : '#10b981'} />)}
                        </Bar>
                      </BarChart>
                   </ResponsiveContainer>
                </div>
             </div>
             
             {isAdmin && (
               <div className="bg-slate-900 p-6 rounded-2xl text-white relative overflow-hidden shadow-xl">
                 <div className="absolute top-0 right-0 p-4 opacity-10 scale-150 rotate-12"><ICONS.Box /></div>
                 <h3 className="text-lg font-bold mb-1">Reports</h3>
                 <p className="text-slate-400 text-xs mb-6 leading-relaxed">Download current inventory state as a CSV for bookkeeping.</p>
                 <button className="w-full py-2.5 bg-white text-slate-900 rounded-xl text-sm font-bold hover:bg-slate-100 transition-colors">
                   Export Inventory
                 </button>
               </div>
             )}
          </div>
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
