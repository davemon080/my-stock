
import React, { useState, useEffect } from 'react';
import { Product, Category } from '../types.ts';
import { CATEGORIES } from '../constants.tsx';

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (product: Omit<Product, 'id' | 'lastUpdated'>) => void;
  initialData?: Product | null;
}

const ProductModal: React.FC<ProductModalProps> = ({ isOpen, onClose, onSave, initialData }) => {
  const [formData, setFormData] = useState<Omit<Product, 'id' | 'lastUpdated'>>({
    sku: '',
    name: '',
    category: 'Produce',
    price: 0,
    quantity: 0,
    minThreshold: 5,
    expiryDate: '',
    description: '',
    tags: []
  });

  const [tagsString, setTagsString] = useState('');

  useEffect(() => {
    if (initialData) {
      setFormData({
        sku: initialData.sku,
        name: initialData.name,
        category: initialData.category,
        price: initialData.price,
        quantity: initialData.quantity,
        minThreshold: initialData.minThreshold,
        expiryDate: initialData.expiryDate || '',
        description: initialData.description || '',
        tags: initialData.tags || []
      });
      setTagsString((initialData.tags || []).join(', '));
    } else if (isOpen) {
      setFormData({
        sku: '',
        name: '',
        category: 'Produce',
        price: 0,
        quantity: 0,
        minThreshold: 5,
        expiryDate: '',
        description: '',
        tags: []
      });
      setTagsString('');
    }
  }, [initialData, isOpen]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const processedTags = tagsString
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);
    
    onSave({
      ...formData,
      tags: processedTags
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300 overflow-y-auto">
      <div className="w-full max-w-xl p-10 my-8 bg-white rounded-[3rem] shadow-2xl relative animate-in zoom-in-95 duration-300">
        <button onClick={onClose} className="absolute top-8 right-8 text-slate-400 hover:text-slate-600 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
        
        <div className="mb-10">
          <h2 className="text-3xl font-black text-slate-900 tracking-tight">
            {initialData ? 'Update Product' : 'Add New Item'}
          </h2>
          <p className="mt-2 text-xs font-bold tracking-widest text-slate-400 uppercase">Product Catalog Master</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-8">
          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Product Name</label>
                <input 
                  type="text" 
                  required
                  className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-600 focus:bg-white outline-none font-bold transition-all placeholder:text-slate-300"
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  placeholder="e.g. Fuji Apples"
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">SKU Code</label>
                <input 
                  type="text" 
                  required
                  className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-600 focus:bg-white outline-none font-bold transition-all placeholder:text-slate-300"
                  value={formData.sku}
                  onChange={e => setFormData({...formData, sku: e.target.value.toUpperCase()})}
                  placeholder="PR-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Category</label>
                <select 
                  className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-600 focus:bg-white outline-none font-bold transition-all"
                  value={formData.category}
                  onChange={e => setFormData({...formData, category: e.target.value as Category})}
                >
                  {CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Unit Price (₦)</label>
                <input 
                  type="number" 
                  required
                  className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-600 focus:bg-white outline-none font-bold transition-all"
                  value={formData.price}
                  onChange={e => setFormData({...formData, price: parseFloat(e.target.value) || 0})}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Stock Quantity</label>
                <input 
                  type="number" 
                  required
                  className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-600 focus:bg-white outline-none font-bold transition-all"
                  value={formData.quantity}
                  onChange={e => setFormData({...formData, quantity: parseInt(e.target.value) || 0})}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Low Stock Alert</label>
                <input 
                  type="number" 
                  required
                  className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-600 focus:bg-white outline-none font-bold transition-all"
                  value={formData.minThreshold}
                  onChange={e => setFormData({...formData, minThreshold: parseInt(e.target.value) || 0})}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Product Description</label>
              <textarea 
                className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-blue-600 focus:bg-white outline-none font-bold transition-all resize-none h-32"
                value={formData.description || ''}
                onChange={e => setFormData({...formData, description: e.target.value})}
                placeholder="Details about product sourcing, quality, or usage..."
              />
            </div>
          </div>

          <div className="flex gap-4 pt-4">
            <button 
              type="button"
              onClick={onClose}
              className="flex-1 py-5 text-sm font-black text-slate-500 uppercase tracking-widest rounded-3xl hover:bg-slate-50 transition-all"
            >
              Cancel
            </button>
            <button 
              type="submit"
              className="flex-[2] py-5 text-sm font-black text-white uppercase tracking-widest bg-blue-600 shadow-xl shadow-blue-600/30 rounded-3xl hover:bg-blue-700 transition-all active:scale-95"
            >
              {initialData ? 'Save Changes' : 'Create Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProductModal;
