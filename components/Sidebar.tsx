
import React from 'react';

interface SidebarProps {
  isOpen: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ isOpen }) => {
  if (!isOpen) return null;

  const navItems = [
    { name: 'New Chat', icon: 'M12 4v16m8-8H4' },
    { name: 'History', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
    { name: 'Settings', icon: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066' },
  ];

  return (
    <div className="flex flex-col h-full p-4 overflow-y-auto">
      <div className="mb-8">
        <button className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-xl font-medium hover:bg-blue-700 transition-colors shadow-sm">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Project
        </button>
      </div>

      <nav className="space-y-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 mb-2">Main</p>
        {navItems.map((item) => (
          <a
            key={item.name}
            href="#"
            className="flex items-center gap-3 px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors group"
          >
            <svg className="w-5 h-5 text-gray-400 group-hover:text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={item.icon} />
            </svg>
            <span className="text-sm font-medium">{item.name}</span>
          </a>
        ))}
      </nav>

      <div className="mt-auto pt-6">
        <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
          <p className="text-xs text-gray-500 mb-1">Current Plan</p>
          <p className="text-sm font-bold text-gray-800">Free Tier</p>
          <div className="mt-2 w-full bg-gray-200 rounded-full h-1.5">
            <div className="bg-blue-500 h-1.5 rounded-full w-3/4"></div>
          </div>
          <p className="text-[10px] text-gray-400 mt-2">75% of usage limit</p>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
