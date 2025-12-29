
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Product, UserRole, InventoryStats, Transaction, AppConfig, Seller, Branch, Notification, ApprovalRequest } from './types.ts';
import { ICONS } from './constants.tsx';
import Fuse from 'fuse.js';
import ProductModal from './components/ProductModal.tsx';
import { db } from './services/dbService.ts';

declare const Html5QrcodeScanner: any;

interface CartItem extends Product {
  cartQuantity: number;
}

interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

interface OperationTask {
  id: string;
  title: string;
  desc: string;
  type: 'critical' | 'info' | 'success';
}

const App: React.FC = () => {
  const [isInitializing, setIsInitializing] = useState(true);
  const [isGlobalLoading, setIsGlobalLoading] = useState(false);
  const [isSwitchingBranch, setIsSwitchingBranch] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem('supermart_theme');
    return (saved as 'light' | 'dark') || 'light';
  });

  const [currentUser, setCurrentUser] = useState<{ role: UserRole; name: string; branchId: string } | null>(() => {
    const savedSession = localStorage.getItem('supermart_session');
    return savedSession ? JSON.parse(savedSession) : null;
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
  const [isWipeModalOpen, setIsWipeModalOpen] = useState(false);

  // Barcode Scanner State
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const scannerRef = useRef<any>(null);

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
  
  const [lastViewedAt, setLastViewedAt] = useState<number>(0);
  const [hiddenBefore, setHiddenBefore] = useState<number>(0);

  const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
  const [editingSeller, setEditingSeller] = useState<Seller | null>(null);
  const [isStaffEmailVerified, setIsStaffEmailVerified] = useState(false);
  const [isVerifyingEmail, setIsVerifyingEmail] = useState(false);

  const [branchCarts, setBranchCarts] = useState<Record<string, CartItem[]>>(() => {
    const saved = localStorage.getItem('supermart_carts');
    return saved ? JSON.parse(saved) : {};
  });

  const [txStartDate, setTxStartDate] = useState('');
  const [txEndDate, setTxEndDate] = useState('');
  const [revStartDate, setRevStartDate] = useState('');
  const [revEndDate, setRevEndDate] = useState('');

  const cart = useMemo(() => branchCarts[selectedBranchId] || [], [branchCarts, selectedBranchId]);

  const visibleNotifications = useMemo(() => {
    return notifications.filter(n => new Date(n.timestamp).getTime() > hiddenBefore);
  }, [notifications, hiddenBefore]);

  const unreadNotificationsCount = useMemo(() => {
    return visibleNotifications.filter(n => new Date(n.timestamp).getTime() > lastViewedAt).length;
  }, [visibleNotifications, lastViewedAt]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  // Helper to play a scan beep sound
  const playBeep = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // High pitch beep
      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + 0.01);
      gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.1);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.1);
    } catch (e) {
      console.log('Audio beep failed', e);
    }
  };

  const isValidEmailFormat = (email: string) => {
    const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return re.test(email);
  };

  const addNotification = async (message: string, type: 'info' | 'alert' | 'success' = 'info') => {
    if (!currentUser) return;
    await db.addNotification(selectedBranchId, message, type, currentUser.name);
    const n = await db.getNotifications(selectedBranchId);
    setNotifications(n);
  };

  const markAllRead = () => {
    const now = Date.now();
    setLastViewedAt(now);
    if (currentUser) {
      const key = `supermart_last_viewed_${currentUser.role}_${selectedBranchId}`;
      localStorage.setItem(key, now.toString());
    }
  };

  const clearLogsLocally = () => {
    const now = Date.now();
    setHiddenBefore(now);
    if (currentUser) {
      const key = `supermart_hidden_before_${currentUser.role}_${selectedBranchId}`;
      localStorage.setItem(key, now.toString());
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
    setIsInitializing(true);
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
      showToast("Could not load the store", "error");
    } finally {
      setTimeout(() => setIsInitializing(false), 800);
    }
  };

  useEffect(() => {
    initApp();
  }, []);

  const handleBranchSwitch = async (branchId: string) => {
    setIsSwitchingBranch(true);
    setSelectedBranchId(branchId);
    setTimeout(async () => {
      await loadBranchDataFor(branchId);
      setIsSwitchingBranch(false);
    }, 1200);
  };

  useEffect(() => {
    if (selectedBranchId && currentUser) {
      loadBranchData();
      const viewKey = `supermart_last_viewed_${currentUser.role}_${selectedBranchId}`;
      const hideKey = `supermart_hidden_before_${currentUser.role}_${selectedBranchId}`;
      setLastViewedAt(Number(localStorage.getItem(viewKey)) || 0);
      setHiddenBefore(Number(localStorage.getItem(hideKey)) || 0);
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

  const loadBranchDataFor = async (id: string) => {
    const [p, t, n, a] = await Promise.all([
      db.getProducts(id),
      db.getTransactions(id),
      db.getNotifications(id),
      db.getApprovals(id)
    ]);
    setActiveBranchProducts(p);
    setActiveBranchTransactions(t);
    setNotifications(n);
    setPendingApprovals(a);
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

  const operationTasks = useMemo((): OperationTask[] => {
    const tasks: OperationTask[] = [];
    const outOfStock = activeBranchProducts.filter(p => p.quantity <= 0);
    if (outOfStock.length > 0) {
      tasks.push({
        id: 'out',
        title: 'Empty Shelves!',
        desc: `${outOfStock.length} items are sold out at ${activeBranch?.name}. Add more now!`,
        type: 'critical'
      });
    }
    const lowStock = activeBranchProducts.filter(p => p.quantity > 0 && p.quantity <= p.minThreshold);
    if (lowStock.length > 0) {
      tasks.push({
        id: 'low',
        title: 'Running Low',
        desc: `${lowStock.length} items are almost finished. Buy more soon!`,
        type: 'info'
      });
    }
    return tasks;
  }, [activeBranchProducts, activeBranch]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    setIsGlobalLoading(true);
    await new Promise(r => setTimeout(r, 1500));

    if (loginRole === 'Admin') {
      if (loginPassword === config.adminPassword) {
        const adminUser = { role: 'Admin' as UserRole, name: 'Shop Boss', branchId: config.branches[0]?.id || '' };
        setCurrentUser(adminUser);
        setSelectedBranchId(adminUser.branchId);
        showToast(`Welcome back, Boss!`, "success");
      } else {
        setLoginError('Password is wrong');
      }
      setIsGlobalLoading(false);
    } else {
      if (loginStep === 'credentials') {
        if (!isValidEmailFormat(loginEmail)) {
          setLoginError('That email looks wrong (example: me@gmail.com)');
          setIsGlobalLoading(false);
          return;
        }
        const seller = config.sellers.find(s => s.email === loginEmail && s.password === loginPassword);
        if (seller) {
          setLoginStep('verification');
          showToast("We sent a code to your email (try 1234)", "info");
        } else {
          setLoginError('Email or Pin is wrong');
        }
        setIsGlobalLoading(false);
      } else {
        if (verificationCode === '1234') {
          const seller = config.sellers.find(s => s.email === loginEmail);
          const staffUser = { role: 'Seller' as UserRole, name: seller!.name, branchId: seller!.branchId };
          setCurrentUser(staffUser);
          setSelectedBranchId(staffUser.branchId);
          showToast(`Hi ${seller!.name}, you're logged in!`, "success");
          setLoginStep('credentials');
          setVerificationCode('');
        } else {
          setLoginError('Invalid code');
        }
        setIsGlobalLoading(false);
      }
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    showToast("Logged out safely", "info");
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsGlobalLoading(true);
      const reader = new FileReader();
      reader.onloadend = async () => {
        await new Promise(r => setTimeout(r, 1200));
        setConfig(prev => ({ ...prev, logoUrl: reader.result as string }));
        showToast("New logo saved!", "success");
        setIsGlobalLoading(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const updateBranchCart = (newCart: CartItem[]) => {
    setBranchCarts(prev => ({ ...prev, [selectedBranchId]: newCart }));
  };

  const addToCart = (product: Product) => {
    if (product.quantity <= 0) {
      showToast("Sorry, this is sold out!", "error");
      return;
    }
    const currentCart = [...cart];
    const existing = currentCart.find(i => i.id === product.id);
    if (existing) {
      if (existing.cartQuantity >= product.quantity) {
        showToast(`No more left in stock`, "info");
        return;
      }
      const updated = currentCart.map(i => i.id === product.id ? { ...i, cartQuantity: i.cartQuantity + 1 } : i);
      updateBranchCart(updated);
    } else {
      updateBranchCart([...currentCart, { ...product, cartQuantity: 1 }]);
    }
  };

  const handleCartQuantityChange = (productId: string, val: string) => {
    const num = parseInt(val) || 0;
    const real = activeBranchProducts.find(p => p.id === productId);
    if (!real) return;
    let targetNum = num;
    if (targetNum > real.quantity) {
      showToast(`We only have ${real.quantity} left`, "info");
      targetNum = real.quantity;
    }
    const updated = cart.map(i => i.id === productId ? { ...i, cartQuantity: targetNum } : i).filter(i => i.cartQuantity >= 0);
    updateBranchCart(updated);
  };

  const removeFromCart = (productId: string) => {
    const updated = cart.filter(i => i.id !== productId);
    updateBranchCart(updated);
    showToast("Removed from basket", "info");
  };

  const completeCheckout = async () => {
    setIsGlobalLoading(true);
    await new Promise(r => setTimeout(r, 2000));
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
    updateBranchCart([]);
    setIsBasketOpen(false);
    setReceiptToShow(tx);
    showToast("Sold! Paper printing...", "success");
    addNotification(`${currentUser?.name} sold items worth ₦${total.toLocaleString()}. Profit: ₦${(total - totalCost).toLocaleString()}.`, 'success');
    setIsGlobalLoading(false);
  };

  const handleSaveProduct = async (data: Omit<Product, 'id' | 'lastUpdated' | 'sku'>) => {
    setIsGlobalLoading(true);
    await new Promise(r => setTimeout(r, 1500));
    const isEditing = !!editingProduct;
    const productId = editingProduct ? editingProduct.id : Math.random().toString(36).substr(2, 9);
    if (currentUser?.role === 'Seller') {
      const approvalReq: ApprovalRequest = {
        id: Math.random().toString(36).substr(2, 9),
        branchId: selectedBranchId,
        actionType: isEditing ? 'EDIT' : 'ADD',
        productId: productId,
        productData: data,
        requestedBy: currentUser.name,
        timestamp: new Date().toISOString(),
        status: 'PENDING'
      };
      await db.addApprovalRequest(approvalReq);
      showToast("Sent to Boss for checking", "info");
      addNotification(`${currentUser.name} wants to ${isEditing ? 'change' : 'add'} ${data.name}. Go to Requests to see it.`, 'info');
      setIsModalOpen(false);
      setEditingProduct(null);
    } else {
      const sku = editingProduct ? editingProduct.sku : (data.name.substring(0, 2).toUpperCase()) + Math.floor(1000 + Math.random() * 9000);
      const product: Product = { ...data, id: productId, sku, lastUpdated: new Date().toISOString() };
      await db.upsertProduct(product, selectedBranchId);
      await loadBranchData();
      setIsModalOpen(false);
      setEditingProduct(null);
      showToast("Item saved!", "success");
      addNotification(`Boss updated item: ${data.name}.`, 'success');
    }
    setIsGlobalLoading(false);
  };

  const deleteProduct = (id: string) => {
    const product = activeBranchProducts.find(p => p.id === id);
    setConfirmModal({
      isOpen: true,
      title: "Delete item?",
      message: `Really remove ${product?.name}? ${currentUser?.role === 'Seller' ? 'The Boss must say yes first.' : 'Deleting now.'}`,
      onConfirm: async () => {
        setIsGlobalLoading(true);
        await new Promise(r => setTimeout(r, 1200));
        if (currentUser?.role === 'Seller') {
          const approvalReq: ApprovalRequest = {
            id: Math.random().toString(36).substr(2, 9),
            branchId: selectedBranchId,
            actionType: 'DELETE',
            productId: id,
            productData: product || {},
            requestedBy: currentUser.name,
            timestamp: new Date().toISOString(),
            status: 'PENDING'
          };
          await db.addApprovalRequest(approvalReq);
          showToast("Sent to Boss", "info");
          addNotification(`${currentUser.name} wants to delete: ${product?.name}.`, 'alert');
        } else {
          await db.deleteProduct(id);
          await loadBranchData();
          showToast("Deleted!", "info");
          addNotification(`Boss deleted item: ${product?.name}.`, 'alert');
        }
        setConfirmModal(null);
        setIsGlobalLoading(false);
      }
    });
  };

  const handleProcessApproval = async (req: ApprovalRequest, status: 'APPROVED' | 'DECLINED') => {
    setIsGlobalLoading(true);
    await new Promise(r => setTimeout(r, 1200));
    await db.updateApprovalStatus(req.id, status);
    if (status === 'APPROVED') {
      if (req.actionType === 'DELETE') {
        await db.deleteProduct(req.productId!);
      } else {
        const sku = req.productData.sku || (req.productData.name!.substring(0, 2).toUpperCase()) + Math.floor(1000 + Math.random() * 9000);
        const product: Product = { 
          id: req.productId!,
          sku,
          name: req.productData.name!,
          price: req.productData.price!,
          costPrice: req.productData.costPrice!,
          quantity: req.productData.quantity!,
          minThreshold: req.productData.minThreshold!,
          tags: req.productData.tags,
          lastUpdated: new Date().toISOString()
        };
        await db.upsertProduct(product, req.branchId);
      }
      showToast("Request Accepted!", "success");
      addNotification(`Boss said YES to ${req.requestedBy}'s request for ${req.productData.name}.`, 'success');
    } else {
      showToast("Request Rejected", "info");
      addNotification(`Boss said NO to ${req.requestedBy}'s request for ${req.productData.name}.`, 'alert');
    }
    await loadBranchData();
    setIsGlobalLoading(false);
  };

  const handleWipeBranch = async (branchId: string) => {
    const branchName = config.branches.find(b => b.id === branchId)?.name || 'Store';
    setConfirmModal({
      isOpen: true,
      title: `CLEAN OUT ${branchName.toUpperCase()}?`,
      message: `This will delete EVERYTHING for ${branchName} (sales, stock, etc). You can't undo this!`,
      isDangerous: true,
      onConfirm: async () => {
        setConfirmModal(null);
        setIsGlobalLoading(true);
        try {
          await db.wipeBranchData(branchId);
          await new Promise(r => setTimeout(r, 2000));
          showToast(`${branchName} is now empty`, "success");
          if (selectedBranchId === branchId) {
            await loadBranchData();
          }
          await initApp();
        } catch (e) {
          showToast("Failed to clean store", "error");
        } finally {
          setIsGlobalLoading(false);
          setIsWipeModalOpen(false);
        }
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

  const lowStockItems = useMemo(() => 
    activeBranchProducts
      .filter(p => p.quantity > 0 && p.quantity <= p.minThreshold)
      .sort((a, b) => a.quantity - b.quantity)
      .slice(0, 5),
    [activeBranchProducts]
  );

  const handleVerifyStaffEmail = async (email: string) => {
    if (!isValidEmailFormat(email)) {
      showToast("That email doesn't look right!", "error");
      return;
    }
    setIsVerifyingEmail(true);
    await new Promise(r => setTimeout(r, 2000));
    setIsStaffEmailVerified(true);
    showToast(`Email ${email} is real and ready!`, "success");
    setIsVerifyingEmail(false);
  };

  // Barcode Scanning Logic
  const startScanner = () => {
    setIsScannerOpen(true);
    setTimeout(() => {
      scannerRef.current = new Html5QrcodeScanner(
        "reader",
        { fps: 10, qrbox: { width: 250, height: 250 } },
        /* verbose= */ false
      );
      scannerRef.current.render(onScanSuccess, onScanFailure);
    }, 100);
  };

  const stopScanner = () => {
    if (scannerRef.current) {
      scannerRef.current.clear().catch((error: any) => console.error("Scanner clear error:", error));
      scannerRef.current = null;
    }
    setIsScannerOpen(false);
  };

  const onScanSuccess = (decodedText: string) => {
    const product = activeBranchProducts.find(p => p.sku === decodedText);
    if (product) {
      playBeep();
      addToCart(product);
      showToast(`Matched: ${product.name}!`, "success");
    } else {
      showToast("I don't know this code: " + decodedText, "error");
    }
  };

  const onScanFailure = (error: any) => {
    // Failures happen every frame scanning for a match, so we ignore them.
  };

  if (isInitializing) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-center px-6">
        <div className="h-1 w-48 bg-white/10 rounded-full overflow-hidden relative mb-6">
          <div className="absolute inset-y-0 left-0 bg-blue-600 animate-loading-bar rounded-full"></div>
        </div>
        <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest animate-pulse">Waking up the shop...</p>
      </div>
    );
  }

  const LoadingOverlay = ({ message = "Just a second..." }: { message?: string }) => (
    <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center bg-slate-950/60 backdrop-blur-md animate-in fade-in duration-300">
      <div className="w-16 h-16 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin"></div>
      <p className="mt-6 text-[10px] font-black text-white uppercase tracking-[0.3em] animate-pulse">{message}</p>
    </div>
  );

  if (!currentUser) {
    return (
      <div className={`min-h-screen flex items-center justify-center p-6 transition-colors duration-300 ${theme === 'dark' ? 'bg-slate-950' : 'bg-slate-50'}`}>
        {isGlobalLoading && <LoadingOverlay message="Logging you in..." />}
        <div className={`w-full max-w-md rounded-[3rem] p-10 shadow-2xl transition-all ${theme === 'dark' ? 'bg-slate-900 border border-slate-800' : 'bg-white'}`}>
          <div className="text-center mb-10">
            {config.logoUrl ? (
              <img src={config.logoUrl} className="w-20 h-20 mx-auto mb-6 rounded-2xl object-cover shadow-lg" alt="Logo" />
            ) : (
              <div className="w-20 h-20 bg-blue-600 rounded-[2rem] flex items-center justify-center mx-auto mb-6 text-white shadow-xl"><ICONS.Inventory /></div>
            )}
            <h1 className={`text-3xl font-black tracking-tight uppercase leading-none ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>{config.supermarketName}</h1>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-4 italic">Staff Login Area</p>
          </div>
          
          {loginStep === 'credentials' ? (
            <>
              <div className="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl mb-8">
                {(['Seller', 'Admin'] as UserRole[]).map(r => (
                  <button key={r} onClick={() => { setLoginRole(r); setLoginError(''); }} className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest rounded-xl transition-all ${loginRole === r ? 'bg-white dark:bg-slate-700 text-blue-600 shadow-md' : 'text-slate-400'}`}>
                    {r === 'Seller' ? 'Cashier' : 'Boss (Admin)'}
                  </button>
                ))}
              </div>
              <form onSubmit={handleLogin} className="space-y-6">
                {loginRole === 'Seller' && (
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Email Address</label>
                    <input type="email" required className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-white border-2 border-slate-100 rounded-2xl focus:border-blue-600 outline-none font-bold" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} />
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{loginRole === 'Admin' ? 'Admin Password' : 'Staff Pin'}</label>
                  <input type="password" required className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-white border-2 border-slate-100 rounded-2xl focus:border-blue-600 outline-none font-bold" value={loginPassword} onChange={e => setLoginPassword(e.target.value)} />
                </div>
                {loginError && <p className="text-rose-500 text-[10px] font-black uppercase text-center">{loginError}</p>}
                <button type="submit" className="w-full py-5 bg-blue-600 text-white rounded-3xl font-black uppercase tracking-widest shadow-xl shadow-blue-600/30 hover:bg-blue-700 transition-all">Start Work</button>
              </form>
            </>
          ) : (
            <form onSubmit={handleLogin} className="space-y-6">
              <div className="text-center mb-6">
                <p className="text-xs font-bold text-slate-500">We sent a secret code to</p>
                <p className="text-xs font-black text-blue-600">{loginEmail}</p>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">4-Digit Code</label>
                <input type="text" maxLength={4} required className="w-full px-6 py-4 bg-slate-50 dark:bg-slate-800 dark:border-slate-700 dark:text-white border-2 border-slate-100 rounded-2xl focus:border-blue-600 outline-none font-bold text-center text-2xl tracking-[1em]" value={verificationCode} onChange={e => setVerificationCode(e.target.value)} />
              </div>
              {loginError && <p className="text-rose-500 text-[10px] font-black uppercase text-center">{loginError}</p>}
              <button type="submit" className="w-full py-5 bg-blue-600 text-white rounded-3xl font-black uppercase tracking-widest shadow-xl shadow-blue-600/30 hover:bg-blue-700 transition-all">Verify & Enter</button>
              <button type="button" onClick={() => setLoginStep('credentials')} className="w-full text-[10px] font-black uppercase text-slate-400 hover:text-slate-600 transition-colors">Go Back</button>
            </form>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`flex h-screen overflow-hidden transition-colors duration-300 ${theme === 'dark' ? 'bg-slate-950 text-slate-100' : 'bg-slate-50 text-slate-900'}`}>
      {(isGlobalLoading || isVerifyingEmail) && <LoadingOverlay message={isVerifyingEmail ? "Checking if email is real..." : undefined} />}
      {isSwitchingBranch && (
        <div className="fixed inset-0 z-[150] flex flex-col items-center justify-center bg-slate-950/40 backdrop-blur-xl animate-in fade-in duration-300">
           <div className="w-20 h-20 mb-8 border-4 border-blue-600/20 border-t-blue-600 rounded-full animate-spin"></div>
           <h2 className="text-xl font-black text-white uppercase tracking-widest">Changing Store...</h2>
           <p className="text-[10px] font-bold text-slate-300 uppercase tracking-[0.3em] mt-2 animate-pulse">Checking stock at {activeBranch?.name}</p>
        </div>
      )}

      {isSidebarOpen && (
        <div 
          className="fixed inset-0 z-[40] bg-slate-950/50 backdrop-blur-sm lg:hidden animate-in fade-in duration-300" 
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {isNotificationsOpen && (
         <div className="fixed inset-0 z-[120] flex justify-end">
            <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm animate-in fade-in duration-300" onClick={() => { setIsNotificationsOpen(false); markAllRead(); }}></div>
            <div className={`relative w-full max-w-md h-full shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-300 ${theme === 'dark' ? 'bg-slate-900' : 'bg-white'}`}>
               <div className="p-8 border-b dark:border-slate-800 flex items-center justify-between shrink-0">
                  <div className="min-w-0 pr-4">
                     <h3 className="text-xl font-black uppercase tracking-tight italic leading-none dark:text-white">Recent Activity</h3>
                     <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest mt-2">Logs for {currentUser.name}</p>
                  </div>
                  <button onClick={() => { setIsNotificationsOpen(false); markAllRead(); }} className={`p-4 rounded-2xl transition-colors ${theme === 'dark' ? 'bg-slate-800 text-white' : 'bg-slate-50'}`}><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
               </div>
               <div className="flex-1 overflow-y-auto p-6 space-y-4 custom-scrollbar">
                  {visibleNotifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 text-slate-300 opacity-20">
                       <div className="scale-150 mb-6"><ICONS.Bell /></div>
                       <p className="text-[10px] font-black uppercase tracking-widest mt-4">Nothing happened yet</p>
                    </div>
                  ) : visibleNotifications.map(n => (
                    <div key={n.id} className={`p-6 rounded-[2rem] border transition-all ${new Date(n.timestamp).getTime() <= lastViewedAt ? 'opacity-60 grayscale-[0.5]' : 'bg-slate-50 dark:bg-slate-800 border-blue-100 dark:border-blue-900/30 shadow-md ring-1 ring-blue-500/20'}`}>
                       <div className="flex justify-between items-start mb-2">
                         <span className={`text-[8px] font-black uppercase px-3 py-1 rounded-lg ${n.type === 'success' ? 'bg-emerald-100 text-emerald-600' : n.type === 'alert' ? 'bg-rose-100 text-rose-600' : 'bg-blue-100 text-blue-600'}`}>{n.type}</span>
                         <span className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{new Date(n.timestamp).toLocaleTimeString()}</span>
                       </div>
                       <p className="text-xs font-bold text-slate-700 dark:text-slate-200 leading-relaxed">{n.message}</p>
                    </div>
                  ))}
               </div>
               <div className="p-8 border-t dark:border-slate-800 text-center flex flex-col gap-3">
                  <button onClick={() => { markAllRead(); setIsNotificationsOpen(false); }} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest hover:bg-blue-700 transition-all">Clear & Close</button>
                  <button onClick={clearLogsLocally} className="text-[10px] font-black uppercase text-rose-500 hover:text-rose-600 transition-colors tracking-widest">Wipe Log view</button>
               </div>
            </div>
         </div>
      )}

      {isWipeModalOpen && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center p-6 bg-slate-950/80 backdrop-blur-md">
          <div className={`w-full max-w-md rounded-[3rem] p-10 shadow-2xl animate-in zoom-in-95 duration-200 ${theme === 'dark' ? 'bg-slate-900 border border-slate-800 text-white' : 'bg-white text-slate-900'}`}>
            <h3 className="text-xl font-black mb-4 uppercase tracking-tight">Pick a Store to Wipe</h3>
            <p className="text-sm font-bold text-slate-500 mb-8 leading-relaxed italic">Warning: This will delete every item and sale for this store forever.</p>
            <div className="space-y-3 mb-10 overflow-y-auto max-h-[300px] custom-scrollbar pr-2">
              {config.branches.map(b => (
                <button 
                  key={b.id} 
                  onClick={() => handleWipeBranch(b.id)}
                  className={`w-full p-6 text-left rounded-[2rem] border-2 font-black uppercase text-xs transition-all ${theme === 'dark' ? 'border-slate-800 bg-slate-800/50 hover:border-rose-500' : 'border-slate-100 bg-slate-50 hover:border-rose-500'}`}
                >
                  {b.name}
                  <p className="text-[9px] font-bold text-slate-400 mt-1">{b.location}</p>
                </button>
              ))}
            </div>
            <button onClick={() => setIsWipeModalOpen(false)} className="w-full py-4 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest">Cancel</button>
          </div>
        </div>
      )}

      {confirmModal && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-6">
           <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-md" onClick={() => setConfirmModal(null)}></div>
           <div className={`relative w-full max-w-md rounded-[2.5rem] p-10 shadow-2xl animate-in zoom-in-95 duration-200 ${theme === 'dark' ? 'bg-slate-900 border border-slate-800 text-white' : 'bg-white text-slate-900'}`}>
              <h3 className="text-xl font-black mb-4 uppercase tracking-tight">{confirmModal.title}</h3>
              <p className="text-sm font-bold text-slate-500 mb-10 leading-relaxed">{confirmModal.message}</p>
              <div className="flex gap-4">
                 <button onClick={() => setConfirmModal(null)} className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest">Stop</button>
                 <button onClick={confirmModal.onConfirm} className={`flex-1 py-4 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest ${confirmModal.isDangerous ? 'bg-rose-600' : 'bg-blue-600'}`}>Yes, do it</button>
              </div>
           </div>
        </div>
      )}

      {isScannerOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/90 backdrop-blur-lg p-6">
           <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-[3rem] p-8 shadow-2xl relative">
              <h3 className="text-xl font-black mb-6 uppercase tracking-tight text-center italic">Point Camera at Product Sticker</h3>
              <div id="reader" className="w-full overflow-hidden rounded-2xl border-4 border-blue-600"></div>
              <button onClick={stopScanner} className="w-full py-4 mt-8 bg-rose-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest active:scale-95 shadow-xl">Close Camera</button>
           </div>
        </div>
      )}

      <aside className={`fixed lg:static inset-y-0 left-0 z-50 w-72 bg-slate-950 text-white flex flex-col transition-all duration-300 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}>
        <div className="p-8 flex items-center justify-between border-b border-white/5 shrink-0">
          <div className="flex items-center gap-4">
            {config.logoUrl ? (
              <img src={config.logoUrl} className="w-10 h-10 rounded-xl object-cover" alt="Logo" />
            ) : (
              <div className="p-3 bg-blue-600 rounded-2xl text-white"><ICONS.Inventory /></div>
            )}
            <div className="min-w-0">
              <h1 className="text-lg font-black italic truncate uppercase leading-none tracking-tighter">{config.supermarketName}</h1>
              <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Store Manager</p>
            </div>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden p-2 text-slate-400 hover:text-white">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
        <nav className="flex-1 p-6 space-y-2 overflow-y-auto custom-scrollbar">
          {[
            { id: 'Dashboard', icon: <ICONS.Dashboard />, label: 'Dashboard' },
            { id: 'Inventory', icon: <ICONS.Inventory />, label: 'Stock Room' },
            { id: 'Barcodes', icon: <ICONS.Plus />, label: 'Item Stickers' },
            { id: 'Register', icon: <ICONS.Register />, label: 'Check Out' },
            { id: 'Transactions', icon: <ICONS.Register />, label: 'Sales History' },
            { id: 'Revenue', icon: <ICONS.Revenue />, label: 'Money Report', adminOnly: true },
            { id: 'Approvals', icon: <ICONS.Alert />, label: 'Requests', adminOnly: true, count: pendingApprovals.length },
            { id: 'Settings', icon: <ICONS.Dashboard />, label: 'Settings', adminOnly: true }
          ].map(item => (
            (!item.adminOnly || currentUser.role === 'Admin') && (
              <button key={item.id} onClick={() => { setActiveTab(item.id as any); setIsSidebarOpen(false); }} className={`w-full flex items-center justify-between px-6 py-4 rounded-2xl transition-all font-bold text-sm ${activeTab === item.id ? 'bg-blue-600 text-white shadow-xl shadow-blue-600/20' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                <div className="flex items-center gap-4">{item.icon} {item.label}</div>
                {item.count ? <span className="bg-rose-500 text-white text-[10px] px-2 py-0.5 rounded-lg">{item.count}</span> : null}
              </button>
            )
          ))}
        </nav>
        <div className="p-6 shrink-0 border-t border-white/5">
           <button onClick={handleLogout} className="w-full py-3 bg-rose-500/10 text-rose-500 text-[10px] font-black uppercase tracking-widest rounded-2xl hover:bg-rose-500 hover:text-white transition-all">Sign Out</button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <header className={`h-24 px-4 sm:px-10 flex items-center justify-between sticky top-0 z-30 shrink-0 border-b transition-colors duration-300 ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
          <div className="flex items-center gap-2 sm:gap-4 overflow-hidden">
            <button onClick={() => setIsSidebarOpen(true)} className={`lg:hidden p-2.5 rounded-xl transition-all shrink-0 ${theme === 'dark' ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
            </button>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-xl font-black uppercase tracking-tight leading-none truncate">{activeTab === 'Revenue' ? 'Money Report' : activeTab === 'Barcodes' ? 'Item Stickers' : activeTab}</h2>
              <p className="hidden md:block text-[9px] font-black text-blue-600 uppercase tracking-widest mt-1 italic truncate">Hello, {currentUser.name}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {currentUser.role === 'Admin' && config.branches.length > 1 && (
              <div className={`flex items-center gap-1 sm:gap-2 px-2 sm:px-3 py-1.5 border rounded-xl sm:rounded-2xl transition-all shrink-0 ${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-100'}`}>
                 <select value={selectedBranchId} onChange={(e) => handleBranchSwitch(e.target.value)} className="bg-transparent border-none outline-none font-black text-[9px] sm:text-[10px] uppercase tracking-wider text-inherit cursor-pointer max-w-[70px] sm:max-w-none">
                    {config.branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                 </select>
              </div>
            )}

            <button onClick={() => { setIsNotificationsOpen(true); }} className={`relative p-2 sm:p-2.5 rounded-xl transition-all shrink-0 ${theme === 'dark' ? 'bg-slate-800 text-slate-400 hover:text-white' : 'bg-slate-100 text-slate-500'}`}>
              <ICONS.Bell />
              {unreadNotificationsCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 bg-rose-500 text-white text-[8px] font-bold w-4 h-4 flex items-center justify-center rounded-full border border-white dark:border-slate-900 animate-pulse">{unreadNotificationsCount}</span>
              )}
            </button>

            <button onClick={toggleTheme} className={`p-2 sm:p-2.5 rounded-xl transition-all shrink-0 ${theme === 'dark' ? 'bg-slate-800 text-amber-400' : 'bg-slate-100 text-slate-600'}`}>
              {theme === 'dark' ? <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="12" cy="12" r="5"/><path d="M12 1v2"/><path d="M12 21v2"/><path d="m4.22 4.22 1.42 1.42"/><path d="m18.36 18.36 1.42 1.42"/><path d="M1 12h2"/><path d="M21 12h2"/><path d="m4.22 19.78 1.42-1.42"/><path d="m18.36 5.64 1.42-1.42"/></svg> : <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>}
            </button>

            {activeTab === 'Register' && cart.length > 0 && (
              <button onClick={() => setIsBasketOpen(true)} className="relative p-2 sm:p-3 bg-slate-900 dark:bg-blue-600 text-white rounded-xl sm:rounded-2xl shadow-lg active:scale-95 transition-all shrink-0">
                <ICONS.Register />
                <span className="absolute -top-1 -right-1 bg-rose-500 text-white text-[8px] sm:text-[10px] font-black w-5 h-5 flex items-center justify-center rounded-full border-2 border-white dark:border-slate-900">{cart.length}</span>
              </button>
            )}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 sm:p-10 custom-scrollbar pb-32">
          {activeTab === 'Dashboard' && (
            <div className="space-y-6 sm:space-y-10 max-w-7xl mx-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
                <StatCard title="Total Items" value={stats.totalItems} icon={<ICONS.Dashboard />} color="slate" theme={theme} />
                <StatCard title="Stock Value" value={`₦${stats.totalValue.toLocaleString()}`} icon={<ICONS.Inventory />} color="blue" theme={theme} />
                <StatCard title="Low Warning" value={stats.lowStockCount} icon={<ICONS.Alert />} color="amber" alert={stats.lowStockCount > 0} theme={theme} />
                <StatCard title="Today's Money" value={`₦${activeBranchTransactions.filter(t => new Date(t.timestamp).toDateString() === new Date().toDateString()).reduce((acc, t) => acc + t.total, 0).toLocaleString()}`} icon={<ICONS.Revenue />} color="emerald" theme={theme} />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                 <div className={`lg:col-span-1 rounded-[3rem] p-6 sm:p-8 border shadow-sm flex flex-col min-h-[300px] sm:min-h-[400px] transition-colors ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                    <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-6 italic">Items Finishing</h3>
                    <div className="space-y-6 flex-1 overflow-y-auto custom-scrollbar pr-2">
                       {lowStockItems.length > 0 ? lowStockItems.map(item => (
                         <div key={item.id}>
                            <div className="flex justify-between items-center mb-2">
                               <span className="text-[11px] font-black uppercase truncate max-w-[140px] text-slate-900 dark:text-slate-200">{item.name}</span>
                               <span className="text-[10px] font-black text-amber-500">{item.quantity} left</span>
                            </div>
                            <div className={`h-1.5 w-full rounded-full overflow-hidden ${theme === 'dark' ? 'bg-slate-800' : 'bg-slate-100'}`}>
                               <div className="h-full bg-amber-500 transition-all duration-1000" style={{ width: `${Math.max(10, (item.quantity / (item.minThreshold || 1)) * 100)}%` }}></div>
                            </div>
                         </div>
                       )) : <p className="text-[10px] font-black uppercase text-slate-300 italic py-20 text-center">Stock looks good!</p>}
                    </div>
                 </div>

                 <div className="lg:col-span-2 bg-slate-900 rounded-[3rem] p-6 sm:p-10 shadow-2xl relative overflow-hidden flex flex-col min-h-[300px] sm:min-h-[400px]">
                    <div className="relative z-10 h-full flex flex-col">
                       <h3 className="text-lg font-black text-white uppercase tracking-tight mb-8 italic">To-Do List</h3>
                       <div className="flex-1 space-y-4 overflow-y-auto custom-scrollbar pr-2 text-slate-200">
                          {operationTasks.map(task => (
                            <div key={task.id} className={`p-6 rounded-3xl border ${task.type === 'critical' ? 'bg-rose-500/10 border-rose-500/20 text-rose-100' : 'bg-blue-500/10 border-blue-500/20 text-blue-100'}`}>
                               <h4 className={`text-[10px] font-black uppercase tracking-widest mb-2 ${task.type === 'critical' ? 'text-rose-400' : 'text-blue-400'}`}>{task.title}</h4>
                               <p className="text-sm font-medium leading-relaxed">{task.desc}</p>
                            </div>
                          ))}
                          {operationTasks.length === 0 && <p className="text-[10px] font-black uppercase text-slate-600 tracking-[0.4em] text-center mt-20 italic">Nothing to worry about</p>}
                       </div>
                    </div>
                 </div>
              </div>
            </div>
          )}

          {activeTab === 'Register' && (
            <div className="max-w-7xl mx-auto space-y-6 sm:space-y-8">
               <div className="flex flex-col sm:flex-row items-center gap-4 max-w-4xl mx-auto w-full">
                  <div className="relative flex-1 w-full">
                     <span className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-400"><ICONS.Search /></span>
                     <input type="text" placeholder="Search for items to sell..." className={`w-full pl-14 sm:pl-16 pr-6 sm:pr-8 py-4 sm:py-5 text-md font-bold border-2 border-transparent rounded-[2rem] sm:rounded-[2.5rem] outline-none shadow-sm transition-all focus:border-blue-600 ${theme === 'dark' ? 'bg-slate-900 text-white' : 'bg-white'}`} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                  </div>
                  <button onClick={startScanner} className="w-full sm:w-auto px-10 py-5 bg-blue-600 text-white rounded-[2rem] sm:rounded-[2.5rem] font-black uppercase text-[10px] tracking-widest shadow-xl shadow-blue-600/20 active:scale-95 transition-all flex items-center justify-center gap-3 shrink-0"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><path d="M12 7v10"/><path d="M8 12h8"/></svg> Activate Scan Sale</button>
               </div>
               <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4">
                 {filteredProducts.map(p => (
                   <button key={p.id} onClick={() => addToCart(p)} className={`p-4 sm:p-6 border-2 rounded-[2rem] sm:rounded-[2.5rem] text-left hover:shadow-xl transition-all group relative active:scale-95 shadow-sm overflow-hidden flex flex-col justify-between min-h-[140px] sm:min-h-[160px] ${p.quantity <= 0 ? 'border-rose-100 bg-rose-50/10' : theme === 'dark' ? 'bg-slate-900 border-transparent hover:border-blue-600' : 'bg-white border-transparent hover:border-blue-600'}`}>
                      <div>
                        <div className={`text-lg sm:text-xl font-black mb-1 leading-none ${theme === 'dark' ? 'text-white' : 'text-slate-900'}`}>₦{p.price.toLocaleString()}</div>
                        <h4 className={`text-[10px] sm:text-xs font-black uppercase tracking-tight line-clamp-2 leading-tight ${theme === 'dark' ? 'text-slate-300' : 'text-slate-800'}`}>{p.name}</h4>
                      </div>
                      <div className="mt-4">
                        <div className={`px-2 py-0.5 rounded-lg text-[8px] font-black w-fit uppercase ${p.quantity <= 0 ? 'bg-rose-100 text-rose-600' : p.quantity <= p.minThreshold ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                          {p.quantity <= 0 ? 'SOLD OUT' : `${p.quantity} Left`}
                        </div>
                      </div>
                   </button>
                 ))}
               </div>
            </div>
          )}

          {activeTab === 'Barcodes' && (
            <div className="max-w-7xl mx-auto space-y-10">
               <div className="flex flex-col sm:flex-row items-center justify-between gap-6 print:hidden">
                  <div>
                    <h3 className="text-2xl font-black uppercase italic tracking-tighter dark:text-white">Item Stickers</h3>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Print these and stick them on your products</p>
                  </div>
                  <button onClick={() => window.print()} className="w-full sm:w-auto px-12 py-5 bg-slate-900 dark:bg-blue-600 text-white rounded-3xl font-black uppercase text-[10px] tracking-widest shadow-2xl active:scale-95 flex items-center justify-center gap-3"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg> Print All Stickers</button>
               </div>
               
               <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 barcode-print-view">
                  {activeBranchProducts.map(p => (
                    <div key={p.id} className={`barcode-label p-6 border-2 rounded-[2.5rem] text-center flex flex-col items-center justify-center space-y-4 bg-white dark:bg-slate-900 transition-all ${theme === 'dark' ? 'border-slate-800' : 'border-slate-100 shadow-sm'}`}>
                       <h4 className="text-[9px] font-black uppercase tracking-tight text-slate-900 dark:text-slate-200 line-clamp-1">{p.name}</h4>
                       <div className="p-4 bg-white rounded-xl border border-slate-100">
                          <div className="flex flex-col items-center gap-1">
                             <div className="flex gap-[2px] items-end h-12">
                                {p.sku.split('').map((char, i) => (
                                   <div key={i} className={`bg-black`} style={{ width: (char.charCodeAt(0) % 3 + 1) + 'px', height: (70 + (char.charCodeAt(0) % 30)) + '%' }}></div>
                                ))}
                             </div>
                             <span className="text-[10px] font-black tracking-[0.2em] text-black">{p.sku}</span>
                          </div>
                       </div>
                       <p className="text-[10px] font-black text-blue-600">₦{p.price.toLocaleString()}</p>
                    </div>
                  ))}
               </div>
            </div>
          )}

          {activeTab === 'Inventory' && (
             <div className="max-w-7xl mx-auto space-y-6">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                   <div className="relative flex-1 w-full max-w-md">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><ICONS.Search /></span>
                      <input type="text" placeholder="Find an item..." className={`w-full pl-12 pr-6 py-3 border-2 rounded-2xl outline-none font-bold shadow-sm ${theme === 'dark' ? 'bg-slate-900 border-slate-800 text-white' : 'bg-white border-slate-100 text-slate-900'}`} value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
                   </div>
                   <button onClick={() => { setEditingProduct(null); setIsModalOpen(true); }} className="w-full sm:w-auto px-8 py-3 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl active:scale-95 transition-all">Add New Item</button>
                </div>
                <div className={`rounded-[2.5rem] border overflow-hidden shadow-sm overflow-x-auto ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                   <table className="w-full text-left min-w-[700px]">
                      <thead className={`border-b ${theme === 'dark' ? 'bg-slate-800/50' : 'bg-slate-50'}`}><tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest"><th className="px-10 py-6">Item Name</th><th className="px-10 py-6">Store Price</th><th className="px-10 py-6 text-center">In Stock</th><th className="px-10 py-6 text-right">Actions</th></tr></thead>
                      <tbody className={`divide-y ${theme === 'dark' ? 'divide-slate-800' : 'divide-slate-100'}`}>
                         {filteredProducts.map(p => (
                           <tr key={p.id} className="hover:bg-blue-50/5 transition-all">
                              <td className="px-10 py-6">
                                <span className="font-black uppercase text-xs block text-slate-900 dark:text-white">{p.name}</span>
                                <span className="text-[8px] font-bold text-slate-400 tracking-widest mt-1 block">SKU: {p.sku}</span>
                              </td>
                              <td className="px-10 py-6 font-black text-slate-900 dark:text-white">₦{p.price.toLocaleString()}</td>
                              <td className="px-10 py-6 text-center"><span className={`px-3 py-1 rounded-xl text-[9px] font-black ${p.quantity <= 0 ? 'bg-rose-100 text-rose-600' : p.quantity <= p.minThreshold ? 'bg-amber-100 text-amber-600' : 'bg-emerald-100 text-emerald-600'}`}>{p.quantity} Units</span></td>
                              <td className="px-10 py-6 text-right"><div className="flex justify-end gap-2"><button onClick={() => { setEditingProduct(p); setIsModalOpen(true); }} className="p-2 text-slate-400 hover:text-blue-600 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg></button><button onClick={() => deleteProduct(p.id)} className="p-2 text-slate-400 hover:text-rose-600 transition-colors"><ICONS.Trash /></button></div></td>
                           </tr>
                         ))}
                      </tbody>
                   </table>
                </div>
             </div>
          )}

          {activeTab === 'Approvals' && currentUser.role === 'Admin' && (
            <div className="max-w-7xl mx-auto space-y-6">
              <h3 className="text-xl font-black uppercase italic tracking-tighter dark:text-white">Staff Requests</h3>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest -mt-4">Boss, check these updates from your staff</p>
              {pendingApprovals.length === 0 ? (
                <div className="py-24 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-[3rem] text-slate-300 font-black uppercase text-xs">No requests right now</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {pendingApprovals.map(req => (
                    <div key={req.id} className={`p-8 rounded-[3rem] border transition-all ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}>
                      <div className="flex justify-between items-start mb-6">
                        <div>
                          <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase ${req.actionType === 'ADD' ? 'bg-emerald-100 text-emerald-600' : req.actionType === 'EDIT' ? 'bg-blue-100 text-blue-600' : 'bg-rose-100 text-rose-600'}`}>{req.actionType} ITEM</span>
                          <h4 className="text-lg font-black uppercase mt-2">{req.productData.name || 'Something'}</h4>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">From {req.requestedBy} • {new Date(req.timestamp).toLocaleTimeString()}</p>
                        </div>
                      </div>
                      <div className={`p-6 rounded-3xl mb-6 text-xs space-y-3 ${theme === 'dark' ? 'bg-slate-800' : 'bg-slate-50'}`}>
                        {req.actionType !== 'DELETE' && (
                          <>
                            <div className="flex justify-between"><span className="text-slate-400">Price:</span><span className="font-black text-blue-600">₦{req.productData.price?.toLocaleString()}</span></div>
                            <div className="flex justify-between"><span className="text-slate-400">Quantity:</span><span className="font-black">{req.productData.quantity} Units</span></div>
                          </>
                        )}
                        {req.actionType === 'DELETE' && <p className="text-rose-500 font-bold italic">They want to delete this forever.</p>}
                      </div>
                      <div className="flex gap-4">
                        <button onClick={() => handleProcessApproval(req, 'DECLINED')} className="flex-1 py-4 bg-slate-100 dark:bg-slate-800 text-slate-500 rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-600 hover:text-white transition-all">No</button>
                        <button onClick={() => handleProcessApproval(req, 'APPROVED')} className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg">Yes, Approve</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'Transactions' && (
            <div className="max-w-7xl mx-auto space-y-6">
               <div className="flex flex-col md:flex-row items-end gap-4 bg-white dark:bg-slate-900 p-6 rounded-[2.5rem] border dark:border-slate-800 shadow-sm">
                  <div className="flex-1 w-full space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Search Receipts</label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400"><ICONS.Search /></span>
                      <input type="text" placeholder="Type Receipt ID..." className={`w-full pl-12 pr-6 py-3 border-2 rounded-2xl outline-none font-bold text-sm ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-100 text-slate-900'}`} value={searchTermTransactions} onChange={e => setSearchTermTransactions(e.target.value)} />
                    </div>
                  </div>
                  <div className="w-full md:w-auto space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">From Date</label>
                    <input type="date" value={txStartDate} onChange={e => setTxStartDate(e.target.value)} className={`w-full px-4 py-3 border-2 rounded-2xl outline-none font-bold text-sm ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-100 text-slate-900'}`} />
                  </div>
                  <div className="w-full md:w-auto space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">To Date</label>
                    <input type="date" value={txEndDate} onChange={e => setTxEndDate(e.target.value)} className={`w-full px-4 py-3 border-2 rounded-2xl outline-none font-bold text-sm ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-100 text-slate-900'}`} />
                  </div>
                  {(txStartDate || txEndDate || searchTermTransactions) && (
                    <button onClick={() => { setTxStartDate(''); setTxEndDate(''); setSearchTermTransactions(''); }} className="p-3 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/10 rounded-2xl transition-all">Reset</button>
                  )}
               </div>

               <div className={`rounded-[3rem] border overflow-hidden shadow-sm overflow-x-auto ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                  <table className="w-full text-left min-w-[700px]">
                     <thead className={`border-b ${theme === 'dark' ? 'bg-slate-800/50' : 'bg-slate-50'}`}><tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest"><th className="px-10 py-6">Receipt #</th><th className="px-10 py-6">Time</th><th className="px-10 py-6">Total Amount</th><th className="px-10 py-6 text-right">View</th></tr></thead>
                     <tbody className={`divide-y ${theme === 'dark' ? 'divide-slate-800' : 'divide-slate-100'}`}>
                        {filteredTransactions.map(t => (
                          <tr key={t.id} className="hover:bg-slate-50/5 transition-all">
                             <td className="px-10 py-6 font-black text-xs text-slate-900 dark:text-white">#{t.id}</td>
                             <td className="px-10 py-6 text-xs text-slate-500 font-bold">{new Date(t.timestamp).toLocaleString()}</td>
                             <td className="px-10 py-6 font-black text-blue-600">₦{t.total.toLocaleString()}</td>
                             <td className="px-10 py-6 text-right"><div className="flex justify-end gap-2"><button onClick={() => setReceiptToShow(t)} className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-blue-600 hover:text-white transition-all"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg></button><button onClick={() => { setReceiptToShow(t); setTimeout(() => window.print(), 200); }} className="p-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-emerald-600 hover:text-white transition-all"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg></button></div></td>
                          </tr>
                        ))}
                     </tbody>
                  </table>
               </div>
            </div>
          )}

          {activeTab === 'Revenue' && currentUser.role === 'Admin' && (
             <div className="max-w-7xl mx-auto space-y-10">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                   <StatCard title="Total Money In" value={`₦${filteredRevenueTransactions.reduce((acc, t) => acc + t.total, 0).toLocaleString()}`} icon={<ICONS.Revenue />} color="blue" theme={theme} />
                   <StatCard title="What we Spent" value={`₦${filteredRevenueTransactions.reduce((acc, t) => acc + t.totalCost, 0).toLocaleString()}`} icon={<ICONS.Inventory />} color="amber" theme={theme} />
                   <StatCard title="Money Made" value={`₦${(filteredRevenueTransactions.reduce((acc, t) => acc + t.total, 0) - filteredRevenueTransactions.reduce((acc, t) => acc + t.totalCost, 0)).toLocaleString()}`} icon={<ICONS.Dashboard />} color="emerald" theme={theme} />
                   <StatCard title="Profit Percent" value={`${((filteredRevenueTransactions.reduce((acc, t) => acc + (t.total - t.totalCost), 0) / (filteredRevenueTransactions.reduce((acc, t) => acc + t.total, 0) || 1)) * 100).toFixed(1)}%`} icon={<ICONS.Register />} color="slate" theme={theme} />
                </div>

                <div className="flex flex-col md:flex-row items-end gap-4 bg-white dark:bg-slate-900 p-6 rounded-[2.5rem] border dark:border-slate-800 shadow-sm">
                  <div className="flex-1 w-full space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest ml-1">Filter by Date</label>
                    <div className="grid grid-cols-2 gap-4">
                      <input type="date" value={revStartDate} onChange={e => setRevStartDate(e.target.value)} className={`w-full px-4 py-3 border-2 rounded-2xl outline-none font-bold text-sm ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-100 text-slate-900'}`} />
                      <input type="date" value={revEndDate} onChange={e => setRevEndDate(e.target.value)} className={`w-full px-4 py-3 border-2 rounded-2xl outline-none font-bold text-sm ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-100 text-slate-900'}`} />
                    </div>
                  </div>
                  {(revStartDate || revEndDate) && (
                    <button onClick={() => { setRevStartDate(''); setRevEndDate(''); }} className="p-3 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/10 rounded-2xl transition-all font-black uppercase text-[10px]">Clear Filter</button>
                  )}
                </div>

                <div className={`rounded-[3rem] p-8 sm:p-10 border shadow-sm overflow-hidden ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                   <h3 className="text-xl font-black uppercase mb-8 italic tracking-tighter dark:text-white">Profit Log</h3>
                   <div className="overflow-x-auto">
                      <table className="w-full text-left min-w-[700px]">
                         <thead className={`border-b ${theme === 'dark' ? 'bg-slate-800/50' : 'bg-slate-50'}`}><tr className="text-[10px] font-black text-slate-400 uppercase tracking-widest"><th className="px-8 py-6">Date & Time</th><th className="px-8 py-6">Total Sale</th><th className="px-8 py-6">Profit</th><th className="px-8 py-6 text-right">Result</th></tr></thead>
                         <tbody className={`divide-y ${theme === 'dark' ? 'divide-slate-800 text-white' : 'divide-slate-100'}`}>
                            {filteredRevenueTransactions.map(t => (
                              <tr key={t.id} className="text-xs hover:bg-slate-50/5 transition-all">
                                 <td className="px-8 py-6 font-bold text-slate-500">{new Date(t.timestamp).toLocaleDateString()} at {new Date(t.timestamp).toLocaleTimeString()}</td>
                                 <td className="px-8 py-6 font-black text-slate-900 dark:text-white">₦{t.total.toLocaleString()}</td>
                                 <td className="px-8 py-6 font-black text-emerald-600">₦{(t.total - t.totalCost).toLocaleString()}</td>
                                 <td className="px-8 py-6 text-right"><span className={`px-4 py-2 rounded-xl font-black uppercase text-[9px] ${theme === 'dark' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-emerald-50 text-emerald-600'}`}>{(((t.total - t.totalCost) / (t.total || 1)) * 100).toFixed(1)}% Margin</span></td>
                              </tr>
                            ))}
                         </tbody>
                      </table>
                   </div>
                </div>
             </div>
          )}

          {activeTab === 'Settings' && currentUser.role === 'Admin' && (
            <div className="max-w-4xl mx-auto space-y-10 pb-40">
               <div className={`rounded-[3rem] p-8 border shadow-sm ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                  <h3 className="text-xl font-black mb-8 uppercase tracking-tight text-slate-400 italic">Logo & Name</h3>
                  <div className="space-y-8">
                    <div className={`flex flex-col sm:flex-row items-center gap-6 p-6 rounded-[2.5rem] border-2 border-dashed ${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                      <div className="w-24 h-24 bg-slate-200 rounded-[2rem] flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
                        {config.logoUrl ? <img src={config.logoUrl} className="w-full h-full object-cover" alt="Logo" /> : <ICONS.Inventory />}
                      </div>
                      <div className="flex-1 text-center sm:text-left">
                         <h4 className="text-xs font-black uppercase mb-4 tracking-widest text-slate-500">Store Logo</h4>
                         <button onClick={() => fileInputRef.current?.click()} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${theme === 'dark' ? 'bg-slate-700 text-white' : 'bg-white border shadow-sm'}`}>Update Logo</button>
                         <input type="file" ref={fileInputRef} onChange={handleLogoUpload} accept="image/*" className="hidden" />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                       <input value={config.supermarketName} onChange={e => setConfig({...config, supermarketName: e.target.value})} className={`px-6 py-4 border-2 rounded-2xl font-bold outline-none focus:border-blue-600 transition-all text-sm ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-100'}`} placeholder="Store Name" />
                       <input type="password" value={config.adminPassword} onChange={e => setConfig({...config, adminPassword: e.target.value})} className={`px-6 py-4 border-2 rounded-2xl font-bold outline-none focus:border-blue-600 transition-all text-sm ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-100'}`} placeholder="Admin Password" />
                       <button onClick={async () => { setIsGlobalLoading(true); await db.updateConfig(config.supermarketName, config.logoUrl, config.adminPassword); await new Promise(r => setTimeout(r, 1200)); showToast("Settings saved!", "success"); setIsGlobalLoading(false); }} className="sm:col-span-2 py-5 bg-blue-600 text-white rounded-3xl font-black uppercase text-[10px] tracking-widest shadow-xl active:scale-95 transition-all">Save All</button>
                    </div>
                  </div>
               </div>

               <div className={`rounded-[3rem] p-8 border shadow-sm ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                  <h3 className="text-xl font-black mb-8 uppercase tracking-tight text-slate-400 italic">Store Branches</h3>
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.target as HTMLFormElement;
                    const fd = new FormData(form);
                    setIsGlobalLoading(true);
                    await new Promise(r => setTimeout(r, 1200));
                    if (editingBranch) {
                      await db.updateBranch(editingBranch.id, fd.get('branchName') as string, fd.get('branchLoc') as string);
                      setEditingBranch(null);
                      showToast("Branch updated", "success");
                    } else {
                      const branch = { id: 'br_' + Math.random().toString(36).substr(2, 5), name: fd.get('branchName') as string, location: fd.get('branchLoc') as string, createdAt: new Date().toISOString() };
                      await db.addBranch(branch);
                      showToast("New branch added!", "success");
                    }
                    const branches = await db.getBranches();
                    setConfig({ ...config, branches });
                    form.reset();
                    setIsGlobalLoading(false);
                  }} className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-8">
                    <input name="branchName" required defaultValue={editingBranch?.name || ''} placeholder="Branch Name" className={`px-6 py-4 border-2 rounded-2xl outline-none font-bold text-sm ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50'}`} />
                    <input name="branchLoc" required defaultValue={editingBranch?.location || ''} placeholder="Address" className={`px-6 py-4 border-2 rounded-2xl outline-none font-bold text-sm ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50'}`} />
                    <button type="submit" className="sm:col-span-2 py-5 bg-slate-900 dark:bg-slate-700 text-white rounded-3xl font-black uppercase text-[10px] tracking-widest shadow-xl active:scale-95">{editingBranch ? 'Update Branch' : 'Add New Store'}</button>
                  </form>
                  <div className="space-y-4">
                    {config.branches.map(b => (
                      <div key={b.id} className={`p-6 rounded-[2rem] border flex items-center justify-between ${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-100'}`}>
                        <div><p className="font-black uppercase text-xs">{b.name}</p><p className="text-[9px] text-slate-400 font-bold uppercase">{b.location}</p></div>
                        <div className="flex gap-2">
                           <button onClick={() => setEditingBranch(b)} className="p-3 text-slate-400 hover:text-blue-600 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg></button>
                           {config.branches.length > 1 && (
                             <button onClick={() => { setConfirmModal({ isOpen: true, title: "Delete Store?", message: "This will remove all stock info for this store.", onConfirm: async () => { setIsGlobalLoading(true); await db.deleteBranch(b.id); const brs = await db.getBranches(); setConfig({...config, branches: brs}); setConfirmModal(null); await new Promise(r => setTimeout(r, 1200)); showToast("Branch removed", "info"); setIsGlobalLoading(false); } }); }} className="p-3 text-slate-400 hover:text-rose-600 transition-colors"><ICONS.Trash /></button>
                           )}
                        </div>
                      </div>
                    ))}
                  </div>
               </div>

               <div className={`rounded-[3rem] p-8 border shadow-sm ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-200'}`}>
                  <h3 className="text-xl font-black mb-8 uppercase tracking-tight text-slate-400 italic">Staff Members</h3>
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    if (!isStaffEmailVerified) {
                      showToast("Check the email first!", "error");
                      return;
                    }
                    const form = e.target as HTMLFormElement;
                    const fd = new FormData(form);
                    setIsGlobalLoading(true);
                    await new Promise(r => setTimeout(r, 1200));
                    if (editingSeller) await db.deleteSeller(editingSeller.id);
                    const seller = { id: editingSeller?.id || Math.random().toString(36).substr(2, 9), name: fd.get('staffName') as string, email: fd.get('staffEmail') as string, password: fd.get('staffPin') as string, branchId: fd.get('staffBranch') as string };
                    await db.addSeller(seller);
                    setEditingSeller(null);
                    setIsStaffEmailVerified(false);
                    showToast("Staff saved!", "success");
                    const sellers = await db.getSellers();
                    setConfig({ ...config, sellers });
                    form.reset();
                    setIsGlobalLoading(false);
                  }} className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
                    <input name="staffName" required defaultValue={editingSeller?.name || ''} placeholder="Staff Full Name" className={`px-6 py-4 border-2 rounded-2xl font-bold text-sm ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50'}`} />
                    <div className="relative group">
                      <input name="staffEmail" required defaultValue={editingSeller?.email || ''} type="email" placeholder="Email Address" className={`w-full px-6 py-4 border-2 rounded-2xl font-bold text-sm ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50'} ${isStaffEmailVerified ? 'border-emerald-500' : ''}`} onChange={(e) => { setIsStaffEmailVerified(false); }} />
                      <button type="button" onClick={(e) => { const el = (e.currentTarget.previousSibling as HTMLInputElement); handleVerifyStaffEmail(el.value); }} className={`absolute right-4 top-1/2 -translate-y-1/2 px-3 py-1 text-[8px] font-black uppercase tracking-widest rounded-lg transition-all ${isStaffEmailVerified ? 'bg-emerald-500 text-white' : 'bg-blue-600 text-white shadow-lg shadow-blue-600/20'}`}>
                        {isStaffEmailVerified ? 'Verified' : 'Verify Email'}
                      </button>
                    </div>
                    <input name="staffPin" required defaultValue={editingSeller?.password || ''} placeholder="Login Pin" className={`px-6 py-4 border-2 rounded-2xl font-bold text-sm ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50'}`} />
                    <select name="staffBranch" required defaultValue={editingSeller?.branchId || config.branches[0]?.id} className={`px-6 py-4 border-2 rounded-2xl font-bold text-sm ${theme === 'dark' ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50'}`}>
                       {config.branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <button type="submit" disabled={!isStaffEmailVerified} className="sm:col-span-2 py-5 bg-blue-600 text-white rounded-3xl font-black uppercase text-[10px] tracking-widest shadow-xl active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed">{editingSeller ? 'Save Staff Update' : 'Register New Staff'}</button>
                    {editingSeller && <button type="button" onClick={() => { setEditingSeller(null); setIsStaffEmailVerified(false); }} className="sm:col-span-2 text-[10px] font-black uppercase text-slate-500 py-2">Stop Editing</button>}
                  </form>

                  <div className="space-y-4">
                     {config.sellers.map(s => (
                        <div key={s.id} className={`p-6 rounded-[2rem] border flex flex-col sm:flex-row items-center sm:justify-between gap-6 text-center sm:text-left transition-all ${theme === 'dark' ? 'bg-slate-800 border-slate-700 hover:bg-slate-700/50' : 'bg-slate-50 border-slate-100 hover:bg-white'}`}>
                           <div className="min-w-0 flex-1">
                              <p className="font-black uppercase text-xs truncate">{s.name}</p>
                              <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">
                                Store: {config.branches.find(b => b.id === s.branchId)?.name || 'N/A'} • {s.email}
                              </p>
                           </div>
                           <div className="flex items-center gap-3 shrink-0">
                              <button onClick={() => { setEditingSeller(s); setIsStaffEmailVerified(true); window.scrollTo({top: 0, behavior: 'smooth'}); }} className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-blue-600 hover:border-blue-600 transition-all shadow-sm">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                              </button>
                              <button onClick={() => { setConfirmModal({ isOpen: true, title: "Remove Staff?", message: "This person won't be able to log in anymore.", onConfirm: async () => { setIsGlobalLoading(true); await db.deleteSeller(s.id); const updated = await db.getSellers(); setConfig({...config, sellers: updated}); setConfirmModal(null); await new Promise(r => setTimeout(r, 1200)); showToast("Staff deleted", "info"); setIsGlobalLoading(false); } }); }} className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-rose-600 hover:border-rose-600 transition-all shadow-sm">
                                <ICONS.Trash />
                              </button>
                           </div>
                        </div>
                     ))}
                  </div>
               </div>

               <div className="bg-rose-50 dark:bg-rose-900/10 rounded-[3rem] p-10 border-2 border-dashed border-rose-200 dark:border-rose-900/50 text-center">
                  <h3 className="text-2xl font-black uppercase text-rose-600 mb-2 italic">DANGER ZONE</h3>
                  <button onClick={() => setIsWipeModalOpen(true)} className="px-12 py-5 bg-rose-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest active:scale-95 shadow-xl">Master Reset a branch</button>
               </div>
            </div>
          )}
        </div>

        {isBasketOpen && (
           <div className="fixed inset-0 z-[110] flex items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-md">
              <div className={`w-full max-w-2xl h-full sm:h-[90vh] sm:rounded-[4rem] shadow-2xl flex flex-col overflow-hidden ${theme === 'dark' ? 'bg-slate-900' : 'bg-white'}`}>
                 <div className="p-8 sm:p-10 border-b dark:border-slate-800 flex items-center justify-between shrink-0">
                    <h3 className="text-xl sm:text-2xl font-black uppercase tracking-tight italic leading-none dark:text-white">Shopping Basket</h3>
                    <button onClick={() => setIsBasketOpen(false)} className={`p-4 rounded-2xl transition-colors ${theme === 'dark' ? 'bg-slate-800 text-white' : 'bg-slate-50'}`}><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></button>
                 </div>
                 <div className="flex-1 p-6 sm:p-10 overflow-y-auto custom-scrollbar space-y-4">
                    {cart.map(item => (
                      <div key={item.id} className={`p-6 sm:p-8 rounded-[3rem] flex flex-col sm:flex-row items-center justify-between border shadow-sm transition-colors gap-6 ${theme === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-slate-50 border-slate-100'}`}>
                         <div className="flex-1 min-w-0 pr-4 text-center sm:text-left">
                            <p className="text-lg sm:text-xl font-black uppercase truncate dark:text-white">{item.name}</p>
                            <p className="text-[10px] font-bold text-slate-400 tracking-widest mt-1 uppercase">Price: ₦{item.price.toLocaleString()}</p>
                         </div>
                         <div className="flex items-center gap-4 sm:gap-6">
                            <div className={`flex items-center gap-2.5 p-1 rounded-2xl border ${theme === 'dark' ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-100'}`}>
                               <button onClick={() => handleCartQuantityChange(item.id, (item.cartQuantity - 1).toString())} className="w-10 h-10 rounded-xl font-black text-lg">-</button>
                               <input 
                                 type="text" 
                                 value={item.cartQuantity} 
                                 onChange={(e) => handleCartQuantityChange(item.id, e.target.value)}
                                 className="w-12 text-center font-black text-lg bg-transparent border-none outline-none focus:ring-0"
                               />
                               <button onClick={() => handleCartQuantityChange(item.id, (item.cartQuantity + 1).toString())} className="w-10 h-10 rounded-xl font-black text-lg">+</button>
                            </div>
                            <span className="font-black text-xl sm:text-2xl min-w-[100px] sm:min-w-[120px] text-right text-blue-600">₦{(item.price * item.cartQuantity).toLocaleString()}</span>
                            <button onClick={() => removeFromCart(item.id)} className="p-3 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/10 rounded-xl transition-all"><ICONS.Trash /></button>
                         </div>
                      </div>
                    ))}
                    {cart.length === 0 && <div className="py-24 text-center text-slate-300 font-black uppercase text-xs italic">Your basket is empty</div>}
                 </div>
                 <div className={`p-8 sm:p-10 border-t flex flex-col sm:flex-row items-center justify-between shrink-0 gap-8 transition-colors ${theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-100'}`}>
                    <div className="text-center sm:text-left"><p className="text-[11px] font-black text-slate-400 uppercase tracking-widest mb-1 italic">Total to Pay</p><p className="text-4xl sm:text-6xl font-black text-blue-600 tracking-tighter leading-none">₦{cart.reduce((a, i) => a + (i.price * i.cartQuantity), 0).toLocaleString()}</p></div>
                    <button onClick={completeCheckout} disabled={cart.length === 0} className="w-full sm:w-auto px-12 sm:px-16 py-6 sm:py-8 bg-slate-900 dark:bg-blue-600 text-white rounded-[2rem] sm:rounded-[2.5rem] font-black uppercase text-xs sm:text-sm tracking-widest shadow-2xl active:scale-95 disabled:opacity-20 transition-all">Finish & Print Receipt</button>
                 </div>
              </div>
           </div>
        )}

        {receiptToShow && (
          <div className="fixed inset-0 z-[140] flex items-center justify-center p-0 sm:p-4 bg-slate-950/90 backdrop-blur-xl print-receipt-overlay">
            <div className="w-full max-w-sm h-full sm:h-auto bg-white rounded-none sm:rounded-[3rem] p-8 sm:p-10 shadow-2xl flex flex-col print-receipt-card relative overflow-y-auto text-slate-900">
              <div className="text-center mb-8 border-b border-slate-100 pb-8 shrink-0">
                <h3 className="text-2xl sm:text-3xl font-black uppercase tracking-tight italic leading-none">{config.supermarketName}</h3>
                <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mt-2">{activeBranch?.name}</p>
                <div className="mt-4 space-y-1"><p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Receipt ID: {receiptToShow.id}</p><p className="text-[9px] font-black text-slate-400 uppercase italic">{new Date(receiptToShow.timestamp).toLocaleString()}</p></div>
              </div>
              <div className="space-y-4 mb-8 overflow-y-auto custom-scrollbar pr-2 flex-1 sm:flex-none">
                {receiptToShow.items.map((item, idx) => (
                  <div key={idx} className="flex flex-col text-[10px] font-bold text-slate-700">
                    <div className="flex justify-between items-start"><span className="uppercase leading-tight pr-4">{item.name}</span><span className="font-black text-slate-900 shrink-0">₦{(item.price * item.quantity).toLocaleString()}</span></div>
                    <p className="text-[8px] text-slate-400 mt-0.5 uppercase tracking-widest">{item.quantity} pieces @ ₦{item.price.toLocaleString()}</p>
                  </div>
                ))}
              </div>
              <div className="border-t-2 border-dashed border-slate-200 pt-6 mb-8 flex justify-between items-center shrink-0"><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest italic">Grand Total</span><span className="text-3xl sm:text-4xl font-black text-blue-600 tracking-tighter">₦{receiptToShow.total.toLocaleString()}</span></div>
              <div className="flex flex-col gap-3 print:hidden shrink-0">
                <button onClick={() => window.print()} className="w-full py-4 bg-blue-600 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest shadow-lg">Print Paper Receipt</button>
                <button onClick={() => setReceiptToShow(null)} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-[10px] tracking-widest transition-all">Done</button>
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
    <div className={`p-8 border-2 rounded-[3rem] transition-all flex flex-col justify-between ${alert ? 'border-rose-100 dark:border-rose-900/50 shadow-xl shadow-rose-600/10' : theme === 'dark' ? 'bg-slate-900 border-slate-800' : 'bg-white border-slate-50 shadow-sm'}`}>
      <div className="flex items-center justify-between mb-8">
        <span className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] truncate italic">{title}</span>
        <div className={`p-4 rounded-2xl ${theme === 'dark' ? 'bg-slate-800' : 'bg-slate-50'} ${colorMap[color as keyof typeof colorMap]}`}>{icon}</div>
      </div>
      <div><div className={`text-2xl sm:text-4xl font-black tracking-tighter truncate leading-none ${alert ? 'text-rose-600' : colorMap[color as keyof typeof colorMap]}`}>{value}</div></div>
    </div>
  );
};

export default App;
