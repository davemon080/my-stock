
import React from 'react';

interface DashboardCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: string;
  color: 'blue' | 'red' | 'green' | 'amber';
}

const DashboardCard: React.FC<DashboardCardProps> = ({ title, value, icon, trend, color }) => {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-600',
    red: 'bg-red-50 text-red-600',
    green: 'bg-green-50 text-green-600',
    amber: 'bg-amber-50 text-amber-600'
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex items-start justify-between">
      <div>
        <p className="text-sm font-medium text-slate-500 mb-1">{title}</p>
        <h3 className="text-2xl font-bold text-slate-800">{value}</h3>
        {trend && (
          <p className="mt-2 text-xs font-medium text-green-600">
            {trend}
          </p>
        )}
      </div>
      <div className={`p-3 rounded-lg ${colorMap[color]}`}>
        {icon}
      </div>
    </div>
  );
};

export default DashboardCard;
