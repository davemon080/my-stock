
import React, { useState, useEffect } from 'react';
import { Product } from '../types.ts';

interface ProductModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (product: Omit<Product, 'id' | 'lastUpdated' | 'sku'>) => void;
  initialData?: Product | null;
}

const ProductModal: React.FC<ProductModalProps> = ({ isOpen, onClose, onSave, initialData }) => {
  const [formData, setFormData] = useState<Omit<Product, 'id' | 'lastUpdated' | 'sku'>>({
    name: '',
    price: 0,
    costPrice: 0,
    quantity: 0,
    minThreshold: 5,
    expiryDate: '',
    tags: []
  });

  const [tagsString, setTagsString] = useState('');

  useEffect(() => {
    if (initialData) {
      setFormData({
        name: initialData.name,
        price: initialData.price,
        costPrice: initialData.costPrice || 0,
        quantity: initialData.quantity,
        minThreshold: initialData.minThreshold,
        expiryDate: initialData.expiryDate || '',
        tags: initialData.tags || []
      });
      setTagsString((initialData.tags || []).join(', '));
    } else if (isOpen) {
      setFormData({
        name: '',
        price: 0,
        costPrice: 0,
        quantity: 0,
        minThreshold: 5,
        expiryDate: '',
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
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-300 overflow-y-auto">
      <div className="w-full max-w-xl p-6 sm:p-10 bg-white rounded-none sm:rounded-[3rem] shadow-2xl relative animate-in slide-in-from-bottom sm:zoom-in-95 duration-300 min-h-screen sm:min-h-0 overflow-y-auto">
        <button onClick={onClose} className="absolute top-6 right-6 sm:top-8 sm:right-8 text-slate-400 hover:text-slate-600 transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
        
        <div className="mb-8 sm:mb-10 pt-4 sm:pt-0">
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
            {initialData ? 'Edit Product' : 'Add Product'}
          </h2>
          <p className="mt-1 sm:mt-2 text-[10px] font-bold tracking-widest text-slate-400 uppercase">Inventory Master File</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6 sm:space-y-8 pb-10 sm:pb-0">
          <div className="space-y-4 sm:space-y-6">
            <div className="space-y-1 sm:space-y-2">
              <label className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Product Name</label>
              <input 
                type="text" 
                required
                className="w-full px-5 py-3.5 sm:px-6 sm:py-4 bg-slate-50 border-2 border-slate-100 rounded-xl sm:rounded-2xl focus:border-blue-600 focus:bg-white outline-none font-bold transition-all placeholder:text-slate-300 text-sm"
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                placeholder="e.g. Fuji Apples"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              <div className="space-y-1 sm:space-y-2">
                <label className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Cost Price (₦)</label>
                <input 
                  type="number" 
                  required
                  className="w-full px-5 py-3.5 sm:px-6 sm:py-4 bg-slate-50 border-2 border-slate-100 rounded-xl sm:rounded-2xl focus:border-blue-600 focus:bg-white outline-none font-bold transition-all text-sm"
                  value={formData.costPrice}
                  onChange={e => setFormData({...formData, costPrice: parseFloat(e.target.value) || 0})}
                />
              </div>
              <div className="space-y-1 sm:space-y-2">
                <label className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Selling Price (₦)</label>
                <input 
                  type="number" 
                  required
                  className="w-full px-5 py-3.5 sm:px-6 sm:py-4 bg-slate-50 border-2 border-slate-100 rounded-xl sm:rounded-2xl focus:border-blue-600 focus:bg-white outline-none font-bold transition-all text-sm"
                  value={formData.price}
                  onChange={e => setFormData({...formData, price: parseFloat(e.target.value) || 0})}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 sm:gap-6">
              <div className="space-y-1 sm:space-y-2">
                <label className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Stock Qty</label>
                <input 
                  type="number" 
                  required
                  className="w-full px-5 py-3.5 sm:px-6 sm:py-4 bg-slate-50 border-2 border-slate-100 rounded-xl sm:rounded-2xl focus:border-blue-600 focus:bg-white outline-none font-bold transition-all text-sm"
                  value={formData.quantity}
                  onChange={e => setFormData({...formData, quantity: parseInt(e.target.value) || 0})}
                />
              </div>
              <div className="space-y-1 sm:space-y-2">
                <label className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Alert Threshold</label>
                <input 
                  type="number" 
                  required
                  className="w-full px-5 py-3.5 sm:px-6 sm:py-4 bg-slate-50 border-2 border-slate-100 rounded-xl sm:rounded-2xl focus:border-blue-600 focus:bg-white outline-none font-bold transition-all text-sm"
                  value={formData.minThreshold}
                  onChange={e => setFormData({...formData, minThreshold: parseInt(e.target.value) || 0})}
                />
              </div>
            </div>

            <div className="space-y-1 sm:space-y-2">
              <label className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Tags (Comma split)</label>
              <input 
                type="text" 
                className="w-full px-5 py-3.5 sm:px-6 sm:py-4 bg-slate-50 border-2 border-slate-100 rounded-xl sm:rounded-2xl focus:border-blue-600 focus:bg-white outline-none font-bold transition-all text-sm"
                value={tagsString}
                onChange={e => setTagsString(e.target.value)}
                placeholder="organic, fruit, bulk"
              />
            </div>
          </div>

          <div className="flex flex-col-reverse sm:flex-row gap-3 sm:gap-4 pt-4">
            <button 
              type="button"
              onClick={onClose}
              className="flex-1 py-4 sm:py-5 text-[10px] sm:text-sm font-black text-slate-500 uppercase tracking-widest rounded-xl sm:rounded-3xl hover:bg-slate-50 transition-all border sm:border-0 border-slate-100"
            >
              Cancel
            </button>
            <button 
              type="submit"
              className="flex-[2] py-4 sm:py-5 text-[10px] sm:text-sm font-black text-white uppercase tracking-widest bg-blue-600 shadow-xl shadow-blue-600/30 rounded-xl sm:rounded-3xl hover:bg-blue-700 transition-all active:scale-95"
            >
              {initialData ? 'Update Item' : 'Create Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProductModal;
