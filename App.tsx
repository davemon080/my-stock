
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Product, UserRole, InventoryStats, Transaction, AppConfig, Seller, Branch, Notification, ApprovalRequest } from './types.ts';
import { ICONS } from './constants.tsx';
import Fuse from 'fuse.js';
import ProductModal from './components/ProductModal.tsx';
import { db } from './services/dbService.ts';

// High-speed direct camera access
declare const Html5Qrcode: any;

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
  const [isGlobalLoading, setIsGlobalLoading] = useState(false);
  const [isSwitchingBranch, setIsSwitchingBranch] = useState(false);
  
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('supermart_theme');
    return (saved as 'light' | 'dark') || 'light';
  });

  const [currentUser, setCurrentUser] = useState<{ role: UserRole; name: string; branchId: string } | null>(() => {
    const savedSession = localStorage.getItem('supermart_session');
    try {
      return savedSession ? JSON.parse(savedSession) : null;
    } catch {
      return null;
    }
  });

  const [loginRole, setLoginRole] = useState<UserRole>('Seller');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginStep, setLoginStep] = useState<'credentials' | 'verification'>('credentials');
  const [verificationCode, setVerificationCode] = useState('');
  const [loginError, setLoginError] = useState('');

  const [activeTab, setActiveTab] = useState<'Dashboard' | 'Inventory' | 'Register' | 'Transactions' | 'Revenue' | 'Settings' | 'Approvals' | 'Barcodes'>('Dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isBasketOpen, setIsBasketOpen] = useState(false);
  const [isNotificationsOpen, setIsNotificationsOpen] = useState(false);
  const [receiptToShow, setReceiptToShow] = useState<Transaction | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmModal, setConfirmModal] = useState<{ isOpen: boolean; title: string; message: string; onConfirm: () => void; isDangerous?: boolean } | null>(null);

  // Industrial Scanning State
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [cameraFacingMode, setCameraFacingMode] = useState<'environment' | 'user'>('environment');
  const html5QrCodeRef = useRef<any>(null);
  const lastScannedRef = useRef<{ code: string; time: number } | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

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
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [pendingApprovals, setPendingApprovals] = useState<ApprovalRequest[]>([]);
  
  const [branchCarts, setBranchCarts] = useState<Record<string, CartItem[]>>(() => {
    const saved = localStorage.getItem('supermart_carts');
    try {
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const [txStartDate, setTxStartDate] = useState('');
  const [txEndDate, setTxEndDate] = useState('');
  const [revStartDate, setRevStartDate] = useState('');
  const [revEndDate, setRevEndDate] = useState('');

  const cart = useMemo(() => branchCarts[selectedBranchId] || [], [branchCarts, selectedBranchId]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  const playBeep = () => {
    try {
      if (!audioContextRef.current) {
        audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume();
      }
      const ctx = audioContextRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1050, ctx.currentTime);
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.01);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.1);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch (e) {
      console.warn('Audio beep unavailable', e);
    }
  };

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('supermart_theme', theme);
  }, [theme]);

  useEffect(() => {
    if (currentUser) {
      localStorage.setItem('supermart_session', JSON.stringify(currentUser));
    } else {
      localStorage.removeItem('supermart_session');
    }
  }, [currentUser]);

  useEffect(() => {
    localStorage.setItem('supermart_carts', JSON.stringify(branchCarts));
  }, [branchCarts]);

  const initApp = async () => {
    try {
      const [appConfig, branches, sellers] = await Promise.all([
        db.getConfig(),
        db.getBranches(),
        db.getSellers()
      ]);
      const fullConfig = { ...config, ...appConfig, branches, sellers };
      setConfig(fullConfig);
      
      if (!selectedBranchId) {
        if (currentUser?.branchId) {
          setSelectedBranchId(currentUser.branchId);
        } else if (branches.length > 0) {
          setSelectedBranchId(branches[0].id);
        }
      }
    } catch (err) {
      showToast("Store data offline", "error");
    } finally {
      setIsInitializing(false);
    }
  };

  useEffect(() => {
    initApp();
  }, []);

  useEffect(() => {
    if (selectedBranchId && currentUser) {
      loadBranchData();
    }
  }, [selectedBranchId, currentUser?.role]);

  const loadBranchData = async () => {
    if (!selectedBranchId) return;
    const [p, t, n, a] = await Promise.all([
      db.getProducts(selectedBranchId),
      db.getTransactions(selectedBranchId),
      db.getNotifications(selectedBranchId),
      db.getApprovals(selectedBranchId)
    ]);
    setActiveBranchProducts(p);
    setActiveBranchTransactions(t);
    setNotifications(n);
    setPendingApprovals(a);
  };

  const handleBranchSwitch = async (branchId: string) => {
    setIsGlobalLoading(true);
    setSelectedBranchId(branchId);
    if (currentUser) {
      setCurrentUser({ ...currentUser, branchId });
    }
    await loadBranchData();
    setIsGlobalLoading(false);
    showToast(`Switched to ${config.branches.find(b => b.id === branchId)?.name}`, 'info');
  };

  const stats = useMemo((): InventoryStats => ({
    totalItems: activeBranchProducts.length,
    totalValue: activeBranchProducts.reduce((acc, p) => acc + (p.price * p.quantity), 0),
    totalCostValue: activeBranchProducts.reduce((acc, p) => acc + (p.costPrice * p.quantity), 0),
    lowStockCount: activeBranchProducts.filter(p => p.quantity > 0 && p.quantity <= p.minThreshold).length,
    outOfStockCount: activeBranchProducts.filter(p => p.quantity <= 0).length,
  }), [activeBranchProducts]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setIsGlobalLoading(true);
    if (loginRole === 'Admin') {
      if (loginPassword === config.adminPassword) {
        const adminUser = { role: 'Admin' as UserRole, name: 'Manager', branchId: config.branches[0]?.id || '' };
        setCurrentUser(adminUser);
        setSelectedBranchId(adminUser.branchId);
        showToast(`Access granted`, "success");
      } else {
        setLoginError('Invalid Manager Password');
      }
      setIsGlobalLoading(false);
    } else {
      if (loginStep === 'credentials') {
        const seller = config.sellers.find(s => s.email === loginEmail && s.password === loginPassword);
        if (seller) {
          setLoginStep('verification');
          showToast("Code: 1234", "info");
        } else {
          setLoginError('Invalid Email or Pin');
        }
        setIsGlobalLoading(false);
      } else {
        if (verificationCode === '1234') {
          const seller = config.sellers.find(s => s.email === loginEmail);
          const staffUser = { role: 'Seller' as UserRole, name: seller!.name, branchId: seller!.branchId };
          setCurrentUser(staffUser);
          setSelectedBranchId(staffUser.branchId);
          showToast(`Hi ${seller!.name}`, "success");
          setLoginStep('credentials');
          setVerificationCode('');
        } else {
          setLoginError('Incorrect Code');
        }
        setIsGlobalLoading(false);
      }
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    showToast("Session ended", "info");
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsGlobalLoading(true);
      const reader = new FileReader();
      reader.onloadend = async () => {
        const logoUrl = reader.result as string;
        setConfig(prev => ({ ...prev, logoUrl }));
        await db.updateConfig(config.supermarketName, logoUrl, config.adminPassword);
        showToast("Branding updated", "success");
        setIsGlobalLoading(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const addToCart = (product: Product) => {
    if (product.quantity <= 0) {
      showToast(`${product.name} sold out!`, "error");
      return;
    }
    setBranchCarts(prev => {
      const currentBranchCart = prev[selectedBranchId] || [];
      const existing = currentBranchCart.find(i => i.id === product.id);
      let updatedCart: CartItem[];
      if (existing) {
        if (existing.cartQuantity >= product.quantity) {
          showToast(`Stock limit reached`, "info");
          return prev;
        }
        updatedCart = currentBranchCart.map(i => i.id === product.id ? { ...i, cartQuantity: i.cartQuantity + 1 } : i);
      } else {
        updatedCart = [...currentBranchCart, { ...product, cartQuantity: 1 }];
      }
      return { ...prev, [selectedBranchId]: updatedCart };
    });
  };

  const handleCartQuantityChange = (productId: string, val: string) => {
    const num = parseInt(val) || 0;
    const real = activeBranchProducts.find(p => p.id === productId);
    if (!real) return;
    let targetNum = Math.max(0, num);
    if (targetNum > real.quantity) targetNum = real.quantity;
    const currentBranchCart = branchCarts[selectedBranchId] || [];
    const updated = currentBranchCart.map(i => i.id === productId ? { ...i, cartQuantity: targetNum } : i).filter(i => i.cartQuantity > 0);
    setBranchCarts(prev => ({ ...prev, [selectedBranchId]: updated }));
  };

  const removeFromCart = (productId: string) => {
    const currentBranchCart = branchCarts[selectedBranchId] || [];
    const updated = currentBranchCart.filter(i => i.id !== productId);
    setBranchCarts(prev => ({ ...prev, [selectedBranchId]: updated }));
  };

  const completeCheckout = async () => {
    setIsGlobalLoading(true);
    const total = cart.reduce((acc, i) => acc + (i.price * i.cartQuantity), 0);
    const totalCost = cart.reduce((acc, i) => acc + (i.costPrice * i.cartQuantity), 0);
    const tx: Transaction = {
      id: Math.random().toString(36).substr(2, 6).toUpperCase(),
      items: cart.map(i => ({ productId: i.id, name: i.name, sku: i.sku, price: i.price, costPriceAtSale: i.costPrice, quantity: i.cartQuantity })),
      total, totalCost, type: 'SALE', timestamp: new Date().toISOString()
    };
    try {
      await db.addTransaction(tx, selectedBranchId);
      await db.addNotification(selectedBranchId, `New sale: ₦${total.toLocaleString()} by ${currentUser?.name}`, 'success', currentUser?.name || 'System');
      await loadBranchData();
      setBranchCarts(prev => ({ ...prev, [selectedBranchId]: [] }));
      setIsBasketOpen(false);
      setReceiptToShow(tx);
      showToast("Checkout successful", "success");
    } catch {
      showToast("Checkout failed", "error");
    } finally {
      setIsGlobalLoading(false);
    }
  };

  const handleSaveProduct = async (data: Omit<Product, 'id' | 'lastUpdated' | 'sku'>) => {
    setIsGlobalLoading(true);
    const isEditing = !!editingProduct;
    const productId = editingProduct ? editingProduct.id : Math.random().toString(36).substr(2, 9);
    if (currentUser?.role === 'Seller') {
      const approvalReq: ApprovalRequest = {
        id: Math.random().toString(36).substr(2, 9), branchId: selectedBranchId, actionType: isEditing ? 'EDIT' : 'ADD',
        productId: productId, productData: data, requestedBy: currentUser.name, timestamp: new Date().toISOString(), status: 'PENDING'
      };
      await db.addApprovalRequest(approvalReq);
      showToast("Sent for approval", "info");
      setIsModalOpen(false);
      setEditingProduct(null);
    } else {
      const sku = editingProduct ? editingProduct.sku : (data.name.substring(0, 2).toUpperCase()) + Math.floor(1000 + Math.random() * 9000);
      const product: Product = { ...data, id: productId, sku, lastUpdated: new Date().toISOString() };
      await db.upsertProduct(product, selectedBranchId);
      await loadBranchData();
      setIsModalOpen(false);
      setEditingProduct(null);
      showToast("Saved!", "success");
    }
    setIsGlobalLoading(false);
  };

  const deleteProduct = (id: string) => {
    const product = activeBranchProducts.find(p => p.id === id);
    setConfirmModal({
      isOpen: true,
      title: "Confirm Delete?",
      message: `Permanently remove ${product?.name}?`,
      onConfirm: async () => {
        setIsGlobalLoading(true);
        if (currentUser?.role === 'Seller') {
          const approvalReq: ApprovalRequest = {
            id: Math.random().toString(36).substr(2, 9), branchId: selectedBranchId, actionType: 'DELETE',
            productId: id, productData: product || {}, requestedBy: currentUser.name, timestamp: new Date().toISOString(), status: 'PENDING'
          };
          await db.addApprovalRequest(approvalReq);
          showToast("Approval requested", "info");
        } else {
          await db.deleteProduct(id);
          await loadBranchData();
          showToast("Deleted", "info");
        }
        setConfirmModal(null);
        setIsGlobalLoading(false);
      }
    });
  };

  const [searchTerm, setSearchTerm] = useState('');
  const [searchTermTransactions, setSearchTermTransactions] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const fuse = useMemo(() => new Fuse(activeBranchProducts, { keys: ['name', 'sku'], threshold: 0.3 }), [activeBranchProducts]);
  const filteredProducts = useMemo(() => searchTerm ? fuse.search(searchTerm).map(r => r.item) : activeBranchProducts, [activeBranchProducts, searchTerm, fuse]);

  const filteredTransactions = useMemo(() => {
    return activeBranchTransactions.filter(t => {
      const matchSearch = t.id.toLowerCase().includes(searchTermTransactions.toLowerCase());
      const date = new Date(t.timestamp);
      const matchStart = txStartDate ? date >= new Date(txStartDate) : true;
      const matchEnd = txEndDate ? date <= new Date(txEndDate + 'T23:59:59') : true;
      return matchSearch && matchStart && matchEnd;
    });
  }, [activeBranchTransactions, searchTermTransactions, txStartDate, txEndDate]);

  const filteredRevenueTransactions = useMemo(() => {
    return activeBranchTransactions.filter(t => {
      const date = new Date(t.timestamp);
      const matchStart = revStartDate ? date >= new Date(revStartDate) : true;
      const matchEnd = revEndDate ? date <= new Date(revEndDate + 'T23:59:59') : true;
      return matchStart && matchEnd;
    });
  }, [activeBranchTransactions, revStartDate, revEndDate]);

  const revenueStats = useMemo(() => {
    const totalSales = filteredRevenueTransactions.reduce((acc, t) => acc + t.total, 0);
    const totalCosts = filteredRevenueTransactions.reduce((acc, t) => acc + t.totalCost, 0);
    return {
      sales: totalSales,
      profit: totalSales - totalCosts,
      count: filteredRevenueTransactions.length
    };
  }, [filteredRevenueTransactions]);

  const startScanner = async () => {
    setIsScannerOpen(true);
    if (!audioContextRef.current) audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioContextRef.current.state === 'suspended') audioContextRef.current.resume();
    
    // Clear old ref if exists
    if (html5QrCodeRef.current) {
        try { await html5QrCodeRef.current.stop(); } catch(e){}
        html5QrCodeRef.current = null;
    }

    setTimeout(() => {
      html5QrCodeRef.current = new Html5Qrcode("reader");
      html5QrCodeRef.current.start(
        { facingMode: cameraFacingMode },
        { fps: 60, qrbox: { width: 300, height: 300 }, aspectRatio: 1.0 },
        onScanSuccess,
        onScanFailure
      ).catch((err: any) => {
        console.error("Camera error", err);
        showToast("Camera access required", "error");
        setIsScannerOpen(false);
      });
    }, 50);
  };

  const stopScanner = async () => {
    if (html5QrCodeRef.current) {
      try {
        await html5QrCodeRef.current.stop();
        html5QrCodeRef.current = null;
        setIsScannerOpen(false);
        lastScannedRef.current = null;
      } catch {
        html5QrCodeRef.current = null;
        setIsScannerOpen(false);
      }
    } else {
      setIsScannerOpen(false);
    }
  };

  const flipCamera = async () => {
      const nextMode = cameraFacingMode === 'environment' ? 'user' : 'environment';
      setCameraFacingMode(nextMode);
      if (html5QrCodeRef.current) {
          await html5QrCodeRef.current.stop();
          html5QrCodeRef.current = null;
          startScanner(); // Restart with new mode
      }
  };

  const onScanSuccess = (decodedText: string) => {
    const now = Date.now();
    if (lastScannedRef.current?.code === decodedText && (now - lastScannedRef.current.time < 800)) return;
    const product = activeBranchProducts.find(p => p.sku === decodedText);
    if (product) {
      lastScannedRef.current = { code: decodedText, time: now };
      playBeep();
      addToCart(product);
      showToast(`${product.name} scanned`, "success");
    } else {
      lastScannedRef.current = { code: decodedText, time: now };
      showToast("Unknown Barcode", "error");
    }
  };

  const onScanFailure = () => {};

  const handleProcessApproval = async (req: ApprovalRequest, status: 'APPROVED' | 'DECLINED') => {
    setIsGlobalLoading(true);
    try {
      await db.updateApprovalStatus(req.id, status);
      if (status === 'APPROVED') {
        if (req.actionType === 'DELETE') {
          await db.deleteProduct(req.productId!);
        } else {
          // Re-upsert with latest data
          const sku = req.productData.sku || (req.productData.name!.substring(0, 2).toUpperCase()) + Math.floor(1000 + Math.random() * 9000);
          const product: Product = { 
              ...req.productData, 
              id: req.productId!, 
              sku, 
              lastUpdated: new Date().toISOString() 
          } as Product;
          await db.upsertProduct(product, req.branchId);
        }
        showToast("Approved & Updated", "success");
      } else {
        showToast("Request Declined", "info");
      }
      await loadBranchData();
    } catch (e) {
      showToast("Process failed", "error");
    } finally {
      setIsGlobalLoading(false);
    }
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin"></div>
          <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Waking up shop...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-6 transition-colors duration-300 ${theme === 'dark' ? 'bg-slate-950' : 'bg-slate-50'}`}>
        <div className={`w-full max-w-md rounded-[3rem] p-10 shadow-2xl transition-all ${theme === 'dark' ? 'bg-slate-900 border border-slate-800' : 'bg-white'}`}>
          <div className="text-center mb-10">
            {config.logoUrl ? (
                <img src={config.logoUrl} className="w-20 h-20 mx-auto mb-6 rounded-2xl object-cover shadow-lg" alt="Logo" />
            ) : (
                <div className="w-20 h-20 bg-blue-600 rounded-[2rem] flex items-center justify-center mx-auto mb-6 text-white shadow-xl"><ICONS.Inventory /></div>
            )}
            <h1 className={`text-3xl font-black tracking-tight uppercase leading-none ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{config.supermarketName}</h1>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-4 italic">Staff Portal</p>
          </div>
          
          <div className="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl mb-8">
            {(['Seller', 'Admin'] as UserRole[]).map(r => (
              <button key={r} onClick={() => { setLoginRole(r); setLoginError(''); }} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${loginRole === r ? 'bg-white dark:bg-slate-700 text-blue-600 shadow-md' : 'text-slate-400'}`}>
                {r === 'Seller' ? 'POS' : 'Manager'}
              </button>
            ))}
          </div>
          <form onSubmit={handleLogin} className="space-y-6">
            {loginRole === 'Seller' && (
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Work Email</label>
                <input type="email" required className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-800 dark:border-slate-700 border-2 border-slate-100 rounded-2xl focus:border-blue-600 outline-none font-bold" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} />
              </div>
            )}
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{loginRole === 'Admin' ? 'Admin Password' : 'Staff Pin'}</label>
              <input type="password" required className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-800 dark:border-slate-700 border-2 border-slate-100 rounded-2xl focus:border-blue-600 outline-none font-bold" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} />
            </div>
            {loginError && <p className="text-rose-500 text-[10px] font-black uppercase text-center">{loginError}</p>}
            <button type="submit" className="w-full py-5 bg-blue-600 text-white rounded-3xl font-black uppercase tracking-widest shadow-xl shadow-blue-600/30 hover:bg-blue-700 transition-all">Start Session</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className={`flex h-screen overflow-hidden ${theme === 'dark' ? 'bg-slate-950 text-white' : 'bg-slate-50 text-slate-900'}`}>
      {isGlobalLoading && <div className="fixed inset-0 z-[300] bg-black/40 backdrop-blur-sm flex items-center justify-center"><div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin"></div></div>}
      
      {isScannerOpen && (
        <div className="fixed inset-0 z-[200] bg-black/95 flex items-center justify-center p-4 sm:p-6 backdrop-blur-md">
           <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-[2rem] sm:rounded-[3rem] p-6 sm:p-8 shadow-2xl relative overflow-hidden">
              <div className="flex items-center justify-between mb-4 sm:mb-6">
                <h3 className="text-lg sm:text-xl font-black uppercase tracking-tight italic flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full bg-blue-600 animate-ping"></span> High-Speed Sensor
                </h3>
                <button onClick={flipCamera} className="p-3 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-blue-600 hover:text-white transition-all active:scale-90">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M23 4v6h-6"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                </button>
              </div>
              <div className="relative aspect-square w-full bg-black rounded-2xl sm:rounded-3xl border-4 border-blue-600 shadow-2xl overflow-hidden">
                 <div id="reader" className="w-full h-full object-cover"></div>
                 <div className="scanner-laser"></div>
                 <div className="absolute top-4 left-4 w-8 h-8 border-t-4 border-l-4 border-blue-600 rounded-tl-lg"></div>
                 <div className="absolute top-4 right-4 w-8 h-8 border-t-4 border-r-4 border-blue-600 rounded-tr-lg"></div>
                 <div className="absolute bottom-4 left-4 w-8 h-8 border-b-4 border-l-4 border-blue-600 rounded-bl-lg"></div>
                 <div className="absolute bottom-4 right-4 w-8 h-8 border-b-4 border-r-4 border-blue-600 rounded-br-lg"></div>
              </div>
              <button onClick={stopScanner} className="w-full py-4 sm:py-5 mt-6 sm:mt-8 bg-rose-600 text-white rounded-2xl font-black uppercase text-[11px] shadow-xl shadow-rose-600/20 active:scale-95">Deactivate Scanner</button>
           </div>
        </div>
      )}

      {isNotificationsOpen && (
        <div className="fixed inset-0 z-[180] flex justify-end">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setIsNotificationsOpen(false)}></div>
            <div className={`relative w-full max-w-sm h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300 ${theme === 'dark' ? 'bg-slate-900' : 'bg-white'}`}>
                <div className="p-8 border-b flex items-center justify-between">
                    <h3 className="text-xl font-black uppercase italic tracking-tighter">Notifications</h3>
                    <button onClick={() => setIsNotificationsOpen(false)} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800"><svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
                </div>
                <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                    {notifications.map(n => (
                        <div key={n.id} className={`p-6 rounded-[2rem] border ${n.type === 'alert' ? 'border-rose-100 bg-rose-50/50 dark:bg-rose-900/10' : 'border-slate-100 bg-slate-50/30 dark:bg-slate-800/50'}`}>
                            <div className="flex justify-between items-start mb-2">
                                <span className={`px-3 py-0.5 rounded-lg text-[8px] font-black uppercase tracking-widest ${n.type === 'alert' ? 'text-rose-600 bg-rose-100' : 'text-blue-600 bg-blue-100'}`}>{n.type}</span>
                                <span className="text-[8px] font-bold text-slate-400 italic">{new Date(n.timestamp).toLocaleTimeString()}</span>
                            </div>
                            <p className="text-xs font-bold leading-relaxed">{n.message}</p>
                            <p className="mt-3 text-[8px] font-black text-slate-400 uppercase italic">By {n.user}</p>
                        </div>
                    ))}
                    {notifications.length === 0 && <div className="py-20 text-center font-black text-slate-300 uppercase italic text-xs">Inbox is clean</div>}
                </div>
            </div>
        </div>
      )}

      {/* Sidebar Overlay for mobile */}
      {isSidebarOpen && (
          <div className="fixed inset-0 z-[190] bg-black/60 backdrop-blur-sm lg:hidden" onClick={() => setIsSidebarOpen(false)}></div>
      )}

      <aside className={`fixed lg:static inset-y-0 left-0 z-[200] w-72 bg-slate-950 text-white flex flex-col transition-transform duration-300 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="p-8 border-b border-white/5 flex items-center gap-4">
          {config.logoUrl ? (
              <img src={config.logoUrl} className="w-10 h-10 rounded-xl object-cover" alt="Logo" />
          ) : (
              <div className="p-3 bg-blue-600 rounded-2xl text-white shadow-lg shadow-blue-600/20"><ICONS.Inventory /></div>
          )}
          <h1 className="text-lg font-black uppercase tracking-tighter italic truncate">{config.supermarketName}</h1>
        </div>
        <nav className="flex-1 p-6 space-y-2 overflow-y-auto custom-scrollbar">
          {[
            { id: 'Dashboard', icon: <ICONS.Dashboard />, label: 'Dashboard' },
            { id: 'Inventory', icon: <ICONS.Inventory />, label: 'Stock Room' },
            { id: 'Barcodes', icon: <ICONS.Plus />, label: 'Stickers' },
            { id: 'Register', icon: <ICONS.Register />, label: 'Checkout' },
            { id: 'Transactions', icon: <ICONS.Register />, label: 'Sales History' },
            { id: 'Revenue', icon: <ICONS.Revenue />, label: 'Financials', adminOnly: true },
            { id: 'Approvals', icon: <ICONS.Alert />, label: 'Approvals', adminOnly: true, count: pendingApprovals.length },
            { id: 'Settings', icon: <ICONS.Dashboard />, label: 'Store Config', adminOnly: true }
          ].map(item => (!item.adminOnly || currentUser?.role === 'Admin') && (
            <button key={item.id} onClick={() => { setActiveTab(item.id as any); setIsSidebarOpen(false); }} className={`w-full flex items-center justify-between px-6 py-4 rounded-2xl font-bold text-sm transition-all ${activeTab === item.id ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
              <div className="flex items-center gap-4">{item.icon} {item.label}</div>
              {item.count ? <span className="bg-rose-500 text-white text-[10px] px-2 py-0.5 rounded-lg">{item.count}</span> : null}
            </button>
          ))}
        </nav>
        <div className="p-6 border-t border-white/5"><button onClick={handleLogout} className="w-full py-4 bg-white/5 text-slate-400 font-black uppercase text-[10px] rounded-2xl hover:text-rose-500 transition-colors">Sign Out</button></div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0">
        <header className={`h-24 px-6 sm:px-10 flex items-center justify-between sticky top-0 z-30 border-b shrink-0 ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center gap-4">
            <button onClick={() => setIsSidebarOpen(true)} className="lg:hidden p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg></button>
            <div className="hidden sm:block">
              <select 
                value={selectedBranchId}
                onChange={(e) => handleBranchSwitch(e.target.value)}
                className={`px-6 py-2 rounded-xl font-black uppercase text-[10px] tracking-widest outline-none border-2 transition-all cursor-pointer ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-200 text-slate-900'}`}
              >
                {config.branches.map(b => <option key={b.id} value={b.id}>{b.name.toUpperCase()}</option>)}
              </select>
            </div>
            <h2 className="text-lg sm:text-xl font-black uppercase italic tracking-tighter truncate">{activeTab}</h2>
          </div>
          <div className="flex items-center gap-2 sm:gap-3">
             <button onClick={() => setIsNotificationsOpen(true)} className="relative p-2 sm:p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800">
                 <ICONS.Bell />
                 {notifications.length > 0 && <span className="absolute -top-1 -right-1 w-5 h-5 bg-rose-500 text-white text-[9px] flex items-center justify-center rounded-full animate-pulse font-black border-2 border-white dark:border-slate-900">{notifications.length}</span>}
             </button>
             <button onClick={toggleTheme} className="p-2 sm:p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 transition-transform active:scale-90">{theme === 'dark' ? '☀️' : '🌙'}</button>
             {activeTab === 'Register' && cart.length > 0 && (
               <button onClick={() => setIsBasketOpen(true)} className="relative p-2.5 sm:p-3 bg-blue-600 text-white rounded-2xl shadow-lg"><ICONS.Register /><span className="absolute -top-1.5 -right-1.5 w-6 h-6 bg-rose-500 text-white text-[11px] font-black flex items-center justify-center rounded-full border-2 border-white">{cart.length}</span></button>
             )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-10 custom-scrollbar pb-32">
          {/* Mobile Branch Switcher inside content */}
          <div className="sm:hidden mb-6">
             <select 
                value={selectedBranchId}
                onChange={(e) => handleBranchSwitch(e.target.value)}
                className={`w-full px-6 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest outline-none border-2 ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}
              >
                {config.branches.map(b => <option key={b.id} value={b.id}>{b.name.toUpperCase()}</option>)}
              </select>
          </div>

          {activeTab === 'Dashboard' && (
             <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 max-w-7xl mx-auto">
               <StatCard title="Stock Items" value={stats.totalItems} icon={<ICONS.Inventory />} color="blue" theme={theme} />
               <StatCard title="Total Value" value={`₦${stats.totalValue.toLocaleString()}`} icon={<ICONS.Revenue />} color="emerald" theme={theme} />
               <StatCard title="Low Stock" value={stats.lowStockCount} icon={<ICONS.Alert />} color="amber" alert={stats.lowStockCount > 0} theme={theme} />
               <StatCard title="Today's Sales" value={`₦${activeBranchTransactions.filter(t => new Date(t.timestamp).toDateString() === new Date().toDateString()).reduce((acc, t) => acc + t.total, 0).toLocaleString()}`} icon={<ICONS.Dashboard />} color="slate" theme={theme} />
             </div>
          )}

          {activeTab === 'Register' && (
             <div className="space-y-6 sm:space-y-8 max-w-7xl mx-auto">
                <div className="flex flex-col md:flex-row items-center gap-4 max-w-4xl mx-auto w-full">
                   <div className="relative flex-1 w-full">
                      <span className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400"><ICONS.Search /></span>
                      <input type="text" placeholder="Search product..." className={`w-full pl-14 pr-8 py-5 font-bold rounded-[2.5rem] outline-none shadow-sm transition-all focus:ring-4 focus:ring-blue-600/10 ${theme === 'dark' ? 'bg-slate-900 text-white' : 'bg-white text-slate-900'}`} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                   </div>
                   <button onClick={startScanner} className="w-full md:w-auto px-10 py-5 bg-blue-600 text-white rounded-[2.5rem] font-black uppercase text-[11px] tracking-widest shadow-xl flex items-center justify-center gap-3 active:scale-95 transition-all">
                     <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><rect width="10" height="10" x="7" y="7" rx="1"/></svg>
                     Scan Label
                   </button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
                  {filteredProducts.map(p => (
                    <button key={p.id} onClick={() => addToCart(p)} className={`p-5 sm:p-6 border-2 rounded-[2rem] sm:rounded-[2.5rem] text-left transition-all active:scale-95 hover:border-blue-600 group ${theme === 'dark' ? 'bg-slate-900 border-transparent' : 'bg-white border-transparent shadow-sm'}`}>
                      <div className="text-lg sm:text-xl font-black mb-1 sm:mb-2">₦{p.price.toLocaleString()}</div>
                      <h4 className="text-[10px] sm:text-[11px] font-black uppercase tracking-tight line-clamp-2 min-h-[2.5rem]">{p.name}</h4>
                      <div className={`mt-3 sm:mt-4 px-3 py-1 rounded-lg text-[8px] sm:text-[9px] font-black w-fit ${p.quantity <= p.minThreshold ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>{p.quantity} In Stock</div>
                    </button>
                  ))}
                </div>
             </div>
          )}

          {activeTab === 'Inventory' && (
             <div className="space-y-6 max-w-7xl mx-auto">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                   <div className="relative flex-1 w-full max-w-md">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><ICONS.Search /></span>
                      <input type="text" placeholder="Filter stock..." className={`w-full pl-12 pr-6 py-4 rounded-2xl font-bold shadow-sm outline-none focus:ring-4 focus:ring-blue-600/5 ${theme === 'dark' ? 'bg-slate-900 text-white' : 'bg-white text-slate-900'}`} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                   </div>
                   <button onClick={() => { setEditingProduct(null); setIsModalOpen(true); }} className="w-full sm:w-auto px-8 py-4 bg-blue-600 text-white rounded-2xl text-[11px] font-black uppercase tracking-widest shadow-xl shadow-blue-600/30 hover:bg-blue-700 transition-all">New Product</button>
                </div>
                <div className={`rounded-[2rem] sm:rounded-[3rem] border overflow-hidden shadow-sm overflow-x-auto ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                   <table className="w-full text-left min-w-[700px]">
                      <thead className={`border-b ${theme === 'dark' ? 'bg-slate-800/50' : 'bg-slate-50'}`}><tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest"><th className="px-8 py-6">Item Details</th><th className="px-8 py-6 text-center">Price</th><th className="px-8 py-6 text-center">In Stock</th><th className="px-8 py-6 text-right">Actions</th></tr></thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                         {filteredProducts.map(p => (
                           <tr key={p.id} className="hover:bg-blue-50/5 transition-colors">
                              <td className="px-8 py-6"><span className="font-black uppercase text-xs block truncate max-w-[200px]">{p.name}</span><span className="text-[8px] font-bold text-slate-400 tracking-widest mt-1 block uppercase">{p.sku}</span></td>
                              <td className="px-8 py-6 text-center font-black text-blue-600">₦{p.price.toLocaleString()}</td>
                              <td className="px-8 py-6 text-center"><span className={`px-4 py-1.5 rounded-xl text-[10px] font-black ${p.quantity <= p.minThreshold ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>{p.quantity} Units</span></td>
                              <td className="px-8 py-6 text-right"><div className="flex justify-end gap-3"><button onClick={() => { setEditingProduct(p); setIsModalOpen(true); }} className="p-2 text-slate-400 hover:text-blue-600 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg></button><button onClick={() => deleteProduct(p.id)} className="p-2 text-slate-400 hover:text-rose-600 transition-colors"><ICONS.Trash /></button></div></td>
                           </tr>
                         ))}
                      </tbody>
                   </table>
                </div>
             </div>
          )}

          {activeTab === 'Transactions' && (
             <div className="space-y-6 max-w-7xl mx-auto">
                <div className="flex flex-col sm:flex-row items-center gap-4">
                   <div className="relative flex-1 w-full">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><ICONS.Search /></span>
                      <input type="text" placeholder="Search Receipt ID..." className={`w-full pl-12 pr-6 py-4 rounded-2xl font-bold outline-none shadow-sm ${theme === 'dark' ? 'bg-slate-900' : 'bg-white'}`} value={searchTermTransactions} onChange={e => setSearchTermTransactions(e.target.value)} />
                   </div>
                   <div className="flex items-center gap-2 w-full sm:w-auto">
                     <input type="date" className={`flex-1 sm:w-auto px-4 py-4 rounded-2xl font-bold outline-none ${theme === 'dark' ? 'bg-slate-900' : 'bg-white'}`} value={txStartDate} onChange={e => setTxStartDate(e.target.value)} />
                     <span className="font-black text-slate-400 text-xs">to</span>
                     <input type="date" className={`flex-1 sm:w-auto px-4 py-4 rounded-2xl font-bold outline-none ${theme === 'dark' ? 'bg-slate-900' : 'bg-white'}`} value={txEndDate} onChange={e => setTxEndDate(e.target.value)} />
                   </div>
                </div>
                <div className={`rounded-[2rem] sm:rounded-[3rem] border overflow-hidden shadow-sm overflow-x-auto ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                   <table className="w-full text-left min-w-[700px]">
                      <thead className={`border-b ${theme === 'dark' ? 'bg-slate-800/50' : 'bg-slate-50'}`}><tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest"><th className="px-10 py-6">Receipt #</th><th className="px-10 py-6">Date</th><th className="px-10 py-6">Total Paid</th><th className="px-10 py-6 text-right">View</th></tr></thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                         {filteredTransactions.map(t => (
                           <tr key={t.id} className="hover:bg-blue-50/5 transition-colors">
                              <td className="px-10 py-6 font-black uppercase text-xs">#{t.id}</td>
                              <td className="px-10 py-6 text-[10px] font-bold text-slate-500">{new Date(t.timestamp).toLocaleString()}</td>
                              <td className="px-10 py-6 font-black text-blue-600">₦{t.total.toLocaleString()}</td>
                              <td className="px-10 py-6 text-right"><button onClick={() => setReceiptToShow(t)} className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-blue-600 hover:text-white transition-all active:scale-90"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg></button></td>
                           </tr>
                         ))}
                      </tbody>
                   </table>
                </div>
             </div>
          )}

          {activeTab === 'Barcodes' && (
             <div className="space-y-10 max-w-7xl mx-auto print-section">
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 print:hidden">
                   <h3 className="text-xl sm:text-2xl font-black uppercase italic tracking-tighter">Inventory Stickers</h3>
                   <button onClick={() => window.print()} className="w-full sm:w-auto px-12 py-4 bg-slate-900 text-white rounded-[2rem] font-black uppercase text-[11px] shadow-xl hover:bg-black transition-all">Print all labels</button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 sm:gap-6 barcodes-grid">
                   {activeBranchProducts.map(p => (
                     <div key={p.id} className="p-6 sm:p-8 border-2 border-slate-100 rounded-[2rem] sm:rounded-[3rem] bg-white text-center flex flex-col items-center gap-4 break-inside-avoid shadow-sm">
                        <h4 className="text-[10px] font-black uppercase tracking-tight text-black line-clamp-1">{p.name}</h4>
                        <div className="p-2 sm:p-3 bg-white border-2 sm:border-4 border-blue-600 rounded-2xl sm:rounded-3xl shadow-lg">
                           <img src={`https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${p.sku}&bgcolor=ffffff&color=000000`} alt={p.sku} className="w-24 h-24 sm:w-32 sm:h-32" />
                        </div>
                        <div className="space-y-1">
                           <p className="text-[12px] sm:text-[14px] font-black text-blue-600">₦{p.price.toLocaleString()}</p>
                           <p className="text-[8px] font-bold text-slate-400 tracking-[0.2em] uppercase">{p.sku}</p>
                        </div>
                     </div>
                   ))}
                </div>
             </div>
          )}

          {activeTab === 'Revenue' && (
             <div className="space-y-10 max-w-7xl mx-auto">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
                   <h3 className="text-xl sm:text-2xl font-black uppercase italic tracking-tighter">Finance Overview</h3>
                   <div className="flex items-center gap-2 sm:gap-3 w-full sm:w-auto">
                      <input type="date" className={`flex-1 sm:w-auto px-4 sm:px-6 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest outline-none border-2 ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`} value={revStartDate} onChange={e => setRevStartDate(e.target.value)} />
                      <input type="date" className={`flex-1 sm:w-auto px-4 sm:px-6 py-4 rounded-2xl font-black uppercase text-[10px] tracking-widest outline-none border-2 ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`} value={revEndDate} onChange={e => setRevEndDate(e.target.value)} />
                   </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8">
                   <div className={`p-8 sm:p-10 rounded-[2.5rem] sm:rounded-[3.5rem] border-2 flex flex-col justify-between ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-transparent shadow-sm'}`}>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic mb-6 sm:mb-8">Gross Sales</span>
                      <div className="text-4xl sm:text-5xl font-black text-blue-600 tracking-tighter truncate">₦{revenueStats.sales.toLocaleString()}</div>
                      <p className="mt-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">{revenueStats.count} Completed Orders</p>
                   </div>
                   <div className={`p-8 sm:p-10 rounded-[2.5rem] sm:rounded-[3.5rem] border-2 flex flex-col justify-between ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-transparent shadow-sm'}`}>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic mb-6 sm:mb-8">Total Profit</span>
                      <div className="text-4xl sm:text-5xl font-black text-emerald-600 tracking-tighter truncate">₦{revenueStats.profit.toLocaleString()}</div>
                      <p className="mt-4 text-[9px] font-bold text-emerald-500 uppercase tracking-widest">{(revenueStats.sales ? (revenueStats.profit / revenueStats.sales * 100).toFixed(1) : 0)}% Operating Margin</p>
                   </div>
                   <div className={`p-8 sm:p-10 rounded-[2.5rem] sm:rounded-[3.5rem] border-2 flex flex-col justify-between ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-transparent shadow-sm'}`}>
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic mb-6 sm:mb-8">Asset Valuation</span>
                      <div className="text-4xl sm:text-5xl font-black text-slate-900 dark:text-white tracking-tighter truncate">₦{stats.totalValue.toLocaleString()}</div>
                      <p className="mt-4 text-[9px] font-bold text-slate-400 uppercase tracking-widest">Inventory value on shelves</p>
                   </div>
                </div>
             </div>
          )}

          {activeTab === 'Approvals' && (
             <div className="max-w-7xl mx-auto space-y-10">
                <h3 className="text-xl sm:text-2xl font-black uppercase italic tracking-tighter">Review Queue</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
                   {pendingApprovals.map(req => (
                     <div key={req.id} className={`p-8 sm:p-10 rounded-[2.5rem] sm:rounded-[3.5rem] border-2 transition-all hover:shadow-xl ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-transparent shadow-sm'}`}>
                        <div className="flex justify-between items-start mb-6 sm:mb-8">
                           <span className={`px-4 sm:px-5 py-1.5 rounded-xl text-[9px] sm:text-[10px] font-black uppercase tracking-widest ${req.actionType === 'DELETE' ? 'bg-rose-100 text-rose-600' : 'bg-emerald-100 text-emerald-600'}`}>{req.actionType} REQUEST</span>
                           <span className="text-[8px] font-bold text-slate-400 uppercase italic">{new Date(req.timestamp).toLocaleDateString()}</span>
                        </div>
                        <h4 className="text-xl sm:text-2xl font-black uppercase tracking-tight">{req.productData.name}</h4>
                        <p className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase mt-2 italic tracking-widest">Requested by {req.requestedBy}</p>
                        <div className="grid grid-cols-2 gap-4 mt-6 sm:mt-8 pt-6 sm:pt-8 border-t dark:border-slate-800">
                           <div className="text-[9px] font-black text-slate-400 uppercase">Price: <span className="text-blue-600 block sm:inline">₦{req.productData.price?.toLocaleString()}</span></div>
                           <div className="text-[9px] font-black text-slate-400 uppercase">Qty: <span className="text-slate-900 dark:text-white block sm:inline">{req.productData.quantity}</span></div>
                        </div>
                        <div className="flex gap-3 sm:gap-4 mt-8 sm:mt-10">
                           <button onClick={() => handleProcessApproval(req, 'DECLINED')} className="flex-1 py-4 sm:py-5 bg-slate-100 dark:bg-slate-800 text-slate-400 rounded-2xl sm:rounded-3xl font-black uppercase text-[10px] tracking-widest transition-all hover:text-rose-600">Decline</button>
                           <button onClick={() => handleProcessApproval(req, 'APPROVED')} className="flex-1 py-4 sm:py-5 bg-blue-600 text-white rounded-2xl sm:rounded-3xl font-black uppercase text-[10px] tracking-widest transition-all shadow-xl shadow-blue-600/20 active:scale-95">Approve</button>
                        </div>
                     </div>
                   ))}
                   {pendingApprovals.length === 0 && (
                       <div className="col-span-full py-20 text-center">
                           <div className="inline-block p-6 rounded-full bg-slate-50 dark:bg-slate-800 mb-4"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-300"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg></div>
                           <p className="font-black text-slate-300 uppercase italic text-sm">Everything is approved! All set.</p>
                       </div>
                   )}
                </div>
             </div>
          )}

          {activeTab === 'Settings' && (
             <div className="max-w-4xl mx-auto space-y-12 pb-20">
                <section className="space-y-6">
                   <h4 className="text-sm font-black text-slate-400 uppercase tracking-[0.3em] ml-1">Store Branding</h4>
                   <div className={`p-8 sm:p-10 rounded-[2.5rem] sm:rounded-[3.5rem] border-2 ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-transparent shadow-sm'}`}>
                      <div className="flex flex-col sm:flex-row items-center gap-8 mb-10">
                          <div className="relative w-24 h-24 rounded-[2rem] overflow-hidden bg-slate-100 dark:bg-slate-800 flex items-center justify-center border-2 border-dashed border-slate-200 dark:border-slate-700">
                              {config.logoUrl ? <img src={config.logoUrl} className="w-full h-full object-cover" /> : <ICONS.Plus />}
                              <input type="file" accept="image/*" onChange={handleLogoUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                          </div>
                          <div className="text-center sm:text-left">
                              <p className="font-black text-sm uppercase">Shop Icon</p>
                              <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">Tap box to upload store logo</p>
                          </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-10">
                         <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Display Name</label>
                            <input 
                              type="text" 
                              className={`w-full px-6 py-4 rounded-2xl font-bold border-2 outline-none focus:border-blue-600 transition-all ${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-100'}`} 
                              value={config.supermarketName}
                              onChange={(e) => {
                                const newName = e.target.value;
                                setConfig(prev => ({ ...prev, supermarketName: newName }));
                                db.updateConfig(newName, config.logoUrl, config.adminPassword);
                              }}
                            />
                         </div>
                         <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Manager Secret Pin</label>
                            <input 
                              type="password" 
                              className={`w-full px-6 py-4 rounded-2xl font-bold border-2 outline-none focus:border-blue-600 transition-all ${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-100'}`} 
                              value={config.adminPassword}
                              onChange={(e) => {
                                const newPass = e.target.value;
                                setConfig(prev => ({ ...prev, adminPassword: newPass }));
                                db.updateConfig(config.supermarketName, config.logoUrl, newPass);
                              }}
                            />
                         </div>
                      </div>
                   </div>
                </section>

                <section className="space-y-6">
                   <h4 className="text-sm font-black text-slate-400 uppercase tracking-[0.3em] ml-1">Staff Management</h4>
                   <div className={`p-8 sm:p-10 rounded-[2.5rem] sm:rounded-[3.5rem] border-2 ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-transparent shadow-sm'}`}>
                      <div className="space-y-4 mb-8">
                         {config.sellers.map(s => (
                           <div key={s.id} className="flex items-center justify-between p-6 rounded-2xl bg-slate-50 dark:bg-slate-800 border-2 border-transparent hover:border-blue-600/20 transition-all">
                              <div>
                                 <p className="font-black text-sm uppercase">{s.name}</p>
                                 <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">{s.email} • {config.branches.find(b => b.id === s.branchId)?.name}</p>
                              </div>
                              <button onClick={() => db.deleteSeller(s.id).then(initApp)} className="p-3 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/10 rounded-xl transition-all"><ICONS.Trash /></button>
                           </div>
                         ))}
                      </div>
                      <button 
                        onClick={() => {
                          const name = prompt('Full Name:');
                          const email = prompt('Work Email:');
                          const password = prompt('Access Pin:');
                          if (name && email && password) {
                            db.addSeller({ id: Math.random().toString(36).substr(2, 9), name, email, password, branchId: selectedBranchId }).then(initApp);
                          }
                        }}
                        className="w-full py-5 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-[2rem] sm:rounded-[2.5rem] font-black uppercase text-[10px] tracking-widest text-slate-400 hover:text-blue-600 hover:border-blue-600 transition-all"
                      >
                        + Onboard New Staff member
                      </button>
                   </div>
                </section>

                <section className="space-y-6">
                   <h4 className="text-sm font-black text-slate-400 uppercase tracking-[0.3em] ml-1">Branch Locations</h4>
                   <div className={`p-8 sm:p-10 rounded-[2.5rem] sm:rounded-[3.5rem] border-2 ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-transparent shadow-sm'}`}>
                      <div className="space-y-4 mb-8">
                         {config.branches.map(b => (
                           <div key={b.id} className="flex flex-col sm:flex-row items-center justify-between gap-4 p-6 rounded-2xl bg-slate-50 dark:bg-slate-800">
                              <div className="text-center sm:text-left">
                                 <p className="font-black text-sm uppercase">{b.name}</p>
                                 <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">{b.location}</p>
                              </div>
                              <div className="flex gap-2 w-full sm:w-auto">
                                <button onClick={() => {
                                    setConfirmModal({
                                        isOpen: true,
                                        title: "WIPE STORE DATA?",
                                        message: `Warning: This will clear all transactions, history, and inventory for ${b.name}. Staff will remain.`,
                                        isDangerous: true,
                                        onConfirm: async () => { 
                                            await db.wipeBranchData(b.id);
                                            showToast(`${b.name} data cleared`, 'success');
                                            await loadBranchData();
                                            setConfirmModal(null);
                                        }
                                    })
                                }} className="flex-1 sm:flex-none px-5 py-2.5 bg-rose-50 dark:bg-rose-900/10 text-rose-600 rounded-xl font-black text-[9px] uppercase tracking-widest hover:bg-rose-600 hover:text-white transition-all">Clear Data</button>
                                {config.branches.length > 1 && <button onClick={() => db.deleteBranch(b.id).then(initApp)} className="p-3 text-slate-400 hover:text-rose-600 transition-all"><ICONS.Trash /></button>}
                              </div>
                           </div>
                         ))}
                      </div>
                      <button 
                        onClick={() => {
                          const name = prompt('Store Name:');
                          const location = prompt('Address:');
                          if (name && location) {
                            db.addBranch({ id: 'br_'+Math.random().toString(36).substr(2, 5), name, location, createdAt: new Date().toISOString() }).then(initApp);
                          }
                        }}
                        className="w-full py-5 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-[2rem] sm:rounded-[2.5rem] font-black uppercase text-[10px] tracking-widest text-slate-400 hover:text-blue-600 hover:border-blue-600 transition-all"
                      >
                        + Open New Branch
                      </button>
                   </div>
                </section>
             </div>
          )}
        </div>

        {isBasketOpen && (
           <div className="fixed inset-0 z-[210] flex items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-md">
              <div className={`w-full max-w-2xl h-full sm:h-[90vh] sm:rounded-[3rem] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom duration-300 ${theme === 'dark' ? 'bg-slate-900 text-white' : 'bg-white text-slate-900'}`}>
                 <div className="p-8 sm:p-10 border-b dark:border-slate-800 flex items-center justify-between shrink-0">
                    <h3 className="text-xl sm:text-2xl font-black uppercase italic leading-none">Your Basket</h3>
                    <button onClick={() => setIsBasketOpen(false)} className="p-3 sm:p-4 rounded-2xl bg-slate-50 dark:bg-slate-800 active:scale-90 transition-all"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
                 </div>
                 <div className="flex-1 p-6 sm:p-10 overflow-y-auto custom-scrollbar space-y-4">
                    {cart.map(item => (
                      <div key={item.id} className="p-6 sm:p-8 rounded-[2rem] sm:rounded-[3rem] flex items-center justify-between border border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-800/50 hover:bg-slate-100/50 transition-colors">
                         <div className="flex-1 min-w-0 pr-4 sm:pr-6">
                            <p className="text-lg sm:text-xl font-black uppercase truncate">{item.name}</p>
                            <p className="text-[10px] sm:text-[11px] font-bold text-slate-400 mt-1 uppercase italic">₦{item.price.toLocaleString()}</p>
                         </div>
                         <div className="flex items-center gap-4 sm:gap-8">
                            <div className="flex items-center gap-2 sm:gap-4 bg-white dark:bg-slate-900 p-1.5 sm:p-2 rounded-2xl border dark:border-slate-800 shadow-sm">
                               <button onClick={() => handleCartQuantityChange(item.id, (item.cartQuantity - 1).toString())} className="w-8 h-8 sm:w-10 sm:h-10 font-black text-lg sm:text-xl">-</button>
                               <span className="w-6 sm:w-8 text-center font-black text-lg sm:text-xl">{item.cartQuantity}</span>
                               <button onClick={() => handleCartQuantityChange(item.id, (item.cartQuantity + 1).toString())} className="w-8 h-8 sm:w-10 sm:h-10 font-black text-lg sm:text-xl">+</button>
                            </div>
                            <span className="hidden sm:block font-black text-2xl text-blue-600 min-w-[120px] text-right tracking-tighter">₦{(item.price * item.cartQuantity).toLocaleString()}</span>
                            <button onClick={() => removeFromCart(item.id)} className="p-3 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/10 rounded-xl"><ICONS.Trash /></button>
                         </div>
                      </div>
                    ))}
                    {cart.length === 0 && <div className="py-20 text-center font-black text-slate-300 uppercase italic">Your basket is empty</div>}
                 </div>
                 <div className="p-8 sm:p-10 border-t flex flex-col sm:flex-row items-center justify-between gap-6 bg-slate-50/50 dark:bg-slate-800/50 shrink-0">
                    <div className="text-center sm:text-left"><p className="text-[10px] sm:text-[12px] font-black text-slate-400 uppercase tracking-widest italic mb-2">Total Amount</p><p className="text-4xl sm:text-6xl font-black text-blue-600 tracking-tighter leading-none">₦{cart.reduce((a, i) => a + (i.price * i.cartQuantity), 0).toLocaleString()}</p></div>
                    <button onClick={completeCheckout} disabled={cart.length === 0} className="w-full sm:w-auto px-16 py-6 sm:py-8 bg-blue-600 text-white rounded-[2rem] sm:rounded-[3rem] font-black uppercase text-sm tracking-widest shadow-2xl shadow-blue-600/30 active:scale-95 disabled:opacity-20 transition-all hover:bg-blue-700">Submit Sale</button>
                 </div>
              </div>
           </div>
        )}

        {receiptToShow && (
          <div className="fixed inset-0 z-[220] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-xl print-receipt-overlay">
            <div className="w-full max-w-sm bg-white rounded-[3rem] p-8 sm:p-10 shadow-2xl flex flex-col print-receipt-card text-black animate-in zoom-in-95">
              <div className="text-center mb-10 border-b border-slate-100 pb-8">
                <h3 className="text-3xl font-black uppercase italic leading-none tracking-tighter">{config.supermarketName}</h3>
                <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-widest">Official Transaction Receipt</p>
                <div className="mt-6 space-y-1"><p className="text-[9px] font-black uppercase opacity-50 tracking-widest">ORDER: #{receiptToShow.id}</p><p className="text-[9px] font-bold text-slate-400 uppercase">{new Date(receiptToShow.timestamp).toLocaleString()}</p></div>
              </div>
              <div className="space-y-4 mb-10 flex-1 overflow-y-auto custom-scrollbar pr-2">
                {receiptToShow.items.map((item, idx) => (
                  <div key={idx} className="flex flex-col text-[11px] font-bold">
                    <div className="flex justify-between items-start uppercase leading-tight"><span>{item.name}</span><span className="font-black">₦{(item.price * item.quantity).toLocaleString()}</span></div>
                    <p className="text-[9px] text-slate-400 mt-1 italic tracking-widest">{item.quantity} x ₦{item.price.toLocaleString()}</p>
                  </div>
                ))}
              </div>
              <div className="border-t-2 border-dashed border-slate-200 pt-8 mb-10 flex justify-between items-center"><span className="text-[11px] font-black uppercase italic text-slate-400">Total Sum</span><span className="text-4xl font-black text-blue-600 tracking-tighter">₦{receiptToShow.total.toLocaleString()}</span></div>
              <div className="flex flex-col gap-3 print:hidden">
                <button onClick={() => window.print()} className="w-full py-5 bg-slate-900 text-white rounded-3xl font-black uppercase text-[11px] tracking-widest hover:bg-black transition-all">Download / Print</button>
                <button onClick={() => setReceiptToShow(null)} className="w-full py-5 bg-slate-100 text-slate-400 rounded-3xl font-black uppercase text-[11px] hover:text-slate-900 transition-all">Close Window</button>
              </div>
            </div>
          </div>
        )}
        
        {confirmModal && (
          <div className="fixed inset-0 z-[230] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-md">
             <div className="w-full max-w-md rounded-[2.5rem] sm:rounded-[3rem] p-8 sm:p-10 bg-white dark:bg-slate-900 shadow-2xl animate-in zoom-in-95 duration-200">
                <h3 className="text-lg sm:text-xl font-black mb-4 uppercase tracking-tight italic">{confirmModal.title}</h3>
                <p className="text-sm font-bold text-slate-500 mb-10 leading-relaxed">{confirmModal.message}</p>
                <div className="flex gap-4">
                   <button onClick={() => setConfirmModal(null)} className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest">Go Back</button>
                   <button onClick={confirmModal.onConfirm} className={`flex-1 py-4 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl ${confirmModal.isDangerous ? 'bg-rose-600 shadow-rose-600/20' : 'bg-blue-600 shadow-blue-600/20'}`}>Confirm Action</button>
                </div>
             </div>
          </div>
        )}
      </main>

      <ProductModal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setEditingProduct(null); }} onSave={handleSaveProduct} initialData={editingProduct} theme={theme} />
    </div>
  );
};

const StatCard = ({ title, value, icon, color, alert, theme }: { title: string, value: any, icon: React.ReactNode, color: string, alert?: boolean, theme: string }) => {
  const colorMap = { emerald: 'text-emerald-600', blue: 'text-blue-600', amber: 'text-amber-500', slate: 'text-slate-900 dark:text-white' };
  return (
    <div className={`p-6 sm:p-8 border-2 rounded-[2.5rem] sm:rounded-[3.5rem] transition-all flex flex-col justify-between ${alert ? 'border-rose-100 shadow-xl shadow-rose-600/5' : theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-transparent shadow-sm'}`}>
      <div className="flex items-center justify-between mb-8 sm:mb-10">
        <span className="text-[9px] sm:text-[11px] font-black text-slate-400 uppercase tracking-[0.2em] italic truncate">{title}</span>
        <div className={`p-3 sm:p-4 rounded-2xl ${theme === 'dark' ? 'bg-slate-800' : 'bg-slate-50'} ${colorMap[color as keyof typeof colorMap]}`}>{icon}</div>
      </div>
      <div><div className={`text-3xl sm:text-4xl font-black tracking-tighter leading-none truncate ${alert ? 'text-rose-600' : colorMap[color as keyof typeof colorMap]}`}>{value}</div></div>
    </div>
  );
};

export default App;
