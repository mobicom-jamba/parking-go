import {
  LayoutDashboard,
  Car,
  ParkingCircle,
  SearchCheck
} from 'lucide-react';
import type { UserRole } from '../lib/supabase';

interface SidebarProps {
  currentView: 'dashboard' | 'registration';
  onNavigate: (view: 'dashboard' | 'registration' | 'finecheck') => void;
  role: UserRole;
}

export default function Sidebar({ currentView, onNavigate, role }: SidebarProps) {
  const superAdminItems = [
    { id: 'dashboard', label: 'Хянах самбар', icon: LayoutDashboard },
    { id: 'registration', label: 'Зөрчил бүртгэх', icon: Car },
    { id: 'finecheck', label: 'Хэрэглэгчийн хэсэг', icon: SearchCheck },
  ];
  const workerItems = [
    { id: 'dashboard', label: 'Хянах самбар', icon: LayoutDashboard },
    { id: 'registration', label: 'Зөрчил бүртгэх', icon: Car },
    { id: 'finecheck', label: 'Хэрэглэгчийн хэсэг', icon: SearchCheck },
  ];
  const navItems = role === 'superadmin' ? superAdminItems : workerItems;

  return (
    <aside className="hidden md:flex flex-col h-screen w-64 p-4 bg-slate-50 border-r-0 font-sans sticky top-0">
      <button
        onClick={() => onNavigate('dashboard')}
        className="flex items-center gap-3 px-2 mb-10 cursor-pointer text-left"
        aria-label="Хянах самбар руу очих"
      >
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-primary-container flex items-center justify-center text-white shadow-ambient">
          <ParkingCircle size={24} />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 leading-tight">Зогсоолын систем</h1>
          <p className="text-[10px] text-on-secondary-container uppercase tracking-widest font-bold">Торгуулийн удирдлага</p>
        </div>
      </button>
      
      <nav className="flex-1 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id as 'dashboard' | 'registration' | 'finecheck')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors duration-200 group ${
                isActive
                  ? 'text-primary font-semibold bg-white shadow-sm'
                  : 'text-slate-500 hover:text-primary hover:bg-slate-100'
              }`}
            >
              <Icon size={20} className={isActive ? 'text-primary' : 'group-hover:text-primary'} />
              <span className="text-sm">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto p-4 bg-surface-low rounded-xl flex items-center gap-3">
        <img
          alt="Админ профиль"
          className="w-10 h-10 rounded-full object-cover border-2 border-white"
          src="https://lh3.googleusercontent.com/aida-public/AB6AXuDqREjRTh0Al7IdwKIpmNUUsc97K00c4r73XZ28uTOo3_ZsqlBCYW0SnAC_REy8BkqhHoOKfyKMGtMYELEc-qsJsPWeanA_ORvgo2unOxAIsu84awidhoKRo00wurEzWqXetGqaCdduex2lVFQPoNKYpDRDiIUci6oNcGb7LVL233m9z1c3Sdu6vjLxE68aas-uLmf_do9O3AcYmNXsLxFwH6XVYsE_ysFlGzbAGZwyoO3vyTaC_RrWWYuUyj_Bildl8UegSS0Yyrg"
        />
        <div className="overflow-hidden text-left">
          <p className="text-sm font-bold truncate text-on-surface">{role === 'superadmin' ? 'Системийн эзэн' : 'Жижүүр ажилтан'}</p>
          <p className="text-[10px] text-on-secondary-container truncate">{role === 'superadmin' ? 'Супер админ' : 'Ажилтан'}</p>
        </div>
      </div>
    </aside>
  );
}
