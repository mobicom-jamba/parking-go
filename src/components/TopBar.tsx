import { Shield, UserRound } from 'lucide-react';
import { formatRole, type UserRole } from '../lib/supabase';

interface TopBarProps {
  role: UserRole;
  onRoleChange: (role: UserRole) => void;
}

export default function TopBar({ role, onRoleChange }: TopBarProps) {
  return (
    <header className="sticky top-0 z-10 flex justify-between items-center h-16 px-8 w-full bg-white/80 backdrop-blur-md shadow-sm border-b-0 font-sans text-sm">
      <div className="flex items-center gap-2">
        <Shield className="text-primary" size={18} />
        <p className="font-semibold text-on-surface">Зөрчил, торгуулийн удирдлага</p>
      </div>

      <div className="flex items-center gap-3">
        <UserRound className="text-on-secondary-container" size={18} />
        <select
          value={role}
          onChange={(e) => onRoleChange(e.target.value as UserRole)}
          className="bg-surface-highest rounded-lg px-3 py-2 text-sm font-medium outline-none"
        >
          <option value="superadmin">Супер админ</option>
          <option value="worker">Ажилтан</option>
          <option value="user">Хэрэглэгч</option>
        </select>
        <span className="text-xs text-on-secondary-container">Одоогийн горим: {formatRole(role)}</span>
      </div>
    </header>
  );
}
