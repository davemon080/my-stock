
import React, { useState, useEffect } from 'react';
import { Product, Category } from '../types';
import { CATEGORIES } from '../constants';

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
    minThreshold: 0,
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
    } else {
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

  const handleSubmit = () => {
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm overflow-y-auto">
      <div className="bg-white w-full max-w-lg rounded-2xl shadow-xl p-6 my-8">
        <h2 className="text-xl font-bold text-slate-800 mb-6">
          {initialData ? 'Edit Product' : 'Add New Product'}
        </h2>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Product Name</label>
            <input 
              type="text" 
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              value={formData.name}
              onChange={e => setFormData({...formData, name: e.target.value})}
              placeholder="e.g. Fuji Apples"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">SKU</label>
              <input 
                type="text" 
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                value={formData.sku}
                onChange={e => setFormData({...formData, sku: e.target.value})}
                placeholder="SKU-123"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
              <select 
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                value={formData.category}
                onChange={e => setFormData({...formData, category: e.target.value as Category})}
              >
                {CATEGORIES.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Price (₦)</label>
              <input 
                type="number" 
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                value={formData.price}
                onChange={e => setFormData({...formData, price: parseFloat(e.target.value)})}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Quantity</label>
              <input 
                type="number" 
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                value={formData.quantity}
                onChange={e => setFormData({...formData, quantity: parseInt(e.target.value)})}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Min. Alert</label>
              <input 
                type="number" 
                className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
                value={formData.minThreshold}
                onChange={e => setFormData({...formData, minThreshold: parseInt(e.target.value)})}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea 
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none resize-none h-24"
              value={formData.description}
              onChange={e => setFormData({...formData, description: e.target.value})}
              placeholder="Enter product details..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Tags (comma separated)</label>
            <input 
              type="text" 
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              value={tagsString}
              onChange={e => setTagsString(e.target.value)}
              placeholder="e.g. organic, fresh, dairy"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Expiry Date (Optional)</label>
            <input 
              type="date" 
              className="w-full px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none"
              value={formData.expiryDate}
              onChange={e => setFormData({...formData, expiryDate: e.target.value})}
            />
          </div>
        </div>

        <div className="mt-8 flex gap-3 justify-end">
          <button 
            onClick={onClose}
            className="px-6 py-2 text-slate-600 font-medium hover:bg-slate-50 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit}
            className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-lg shadow-blue-600/20"
          >
            {initialData ? 'Update Product' : 'Save Product'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductModal;
