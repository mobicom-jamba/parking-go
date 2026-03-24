import { useMemo, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import Dashboard from './views/Dashboard';
import Registration from './views/Registration';
import FineChecker from './views/FineChecker';
import PaymentDetails from './views/PaymentDetails';
import { formatRole, supabase, type ParkingCase, type UserRole } from './lib/supabase';

export default function App() {
  const [role, setRole] = useState<UserRole>('superadmin');
  const [searchedPlate, setSearchedPlate] = useState('');
  const [selectedCase, setSelectedCase] = useState<ParkingCase | null>(null);
  const [searchError, setSearchError] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  const handleFineSearch = async (plate: string) => {
    setSearchLoading(true);
    setSearchError('');
    setSelectedCase(null);

    const { data, error } = await supabase
      .from('parking_cases')
      .select('*')
      .ilike('plate', plate)
      .neq('status', 'released')
      .order('created_at', { ascending: false })
      .limit(1);

    setSearchLoading(false);

    if (error) {
      setSearchError('Мэдээлэл ачааллах үед алдаа гарлаа.');
      return;
    }

    if (!data || data.length === 0) {
      setSearchError('Тухайн дугаартай торгууль олдсонгүй.');
      return;
    }

    setSearchedPlate(plate);
    setSelectedCase(data[0] as ParkingCase);
    navigate('/payment');
  };

  const handlePlateSuggestions = async (platePrefix: string) => {
    if (!platePrefix.trim()) return [];
    const { data, error } = await supabase
      .from('parking_cases')
      .select('*')
      .ilike('plate', `${platePrefix}%`)
      .neq('status', 'released')
      .order('created_at', { ascending: false })
      .limit(5);

    if (error || !data) return [];
    return data as ParkingCase[];
  };

  const handleSelectCase = (item: ParkingCase) => {
    setSelectedCase(item);
    setSearchedPlate(item.plate);
    setSearchError('');
    navigate('/payment');
  };

  const handleBackToFineCheck = () => {
    navigate('/fine-check');
  };

  const handleRoleChange = (nextRole: UserRole) => {
    setRole(nextRole);
    if (nextRole === 'user') {
      navigate('/fine-check');
    } else {
      navigate('/admin/dashboard');
    }
  };

  const handlePaid = () => {
    if (!selectedCase) return;
    setSelectedCase({
      ...selectedCase,
      status: 'paid',
      paid_at: new Date().toISOString(),
      paid_amount: selectedCase.total_amount,
    });
  };

  const currentAdminView = useMemo<'dashboard' | 'registration'>(() => {
    if (location.pathname.includes('/admin/registration')) return 'registration';
    return 'dashboard';
  }, [location.pathname]);

  const AdminShell = ({ children }: { children: ReactNode }) => (
    <div className="flex h-screen bg-surface text-on-surface font-sans overflow-hidden">
      <Sidebar
        currentView={currentAdminView}
        onNavigate={(view) => {
          if (view === 'dashboard') navigate('/admin/dashboard');
          if (view === 'registration') navigate('/admin/registration');
          if (view === 'finecheck') navigate('/fine-check');
        }}
        role={role}
      />
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <TopBar role={role} onRoleChange={handleRoleChange} />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/fine-check" replace />} />
      <Route
        path="/fine-check"
        element={
          <FineChecker
            onSearch={handleFineSearch}
            onPlateSuggestions={handlePlateSuggestions}
            onSelectCase={handleSelectCase}
            loading={searchLoading}
            error={searchError}
          />
        }
      />
      <Route
        path="/payment"
        element={
          <PaymentDetails
            plateNumber={searchedPlate}
            caseData={selectedCase}
            onPaid={handlePaid}
            onBack={handleBackToFineCheck}
          />
        }
      />
      <Route
        path="/admin/dashboard"
        element={
          role === 'user' ? (
            <Navigate to="/fine-check" replace />
          ) : (
            <AdminShell>
              <Dashboard role={role} />
            </AdminShell>
          )
        }
      />
      <Route
        path="/admin/registration"
        element={
          role === 'user' ? (
            <Navigate to="/fine-check" replace />
          ) : (
            <AdminShell>
              <Registration />
            </AdminShell>
          )
        }
      />
      <Route
        path="*"
        element={
          <div className="min-h-screen flex items-center justify-center p-8 text-center">
            <p className="text-on-secondary-container">
              {formatRole(role)} горимд энэ хуудас олдсонгүй.
            </p>
          </div>
        }
      />
    </Routes>
  );
}
