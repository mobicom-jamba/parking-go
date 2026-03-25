import { useMemo, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import TopBar from './components/TopBar';
import Dashboard from './views/Dashboard';
import Registration from './views/Registration';
import FineChecker from './views/FineChecker';
import PaymentDetails from './views/PaymentDetails';
import WorkerQueue from './views/WorkerQueue';
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
      .neq('status', 'RELEASED')
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
      .neq('status', 'RELEASED')
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

  const refreshSelectedCase = async (id: string) => {
    const { data, error } = await supabase.from('parking_cases').select('*').eq('id', id).single();
    if (error || !data) return;
    setSelectedCase(data as ParkingCase);
  };

  const currentAdminView = useMemo<'dashboard' | 'registration' | 'queue'>(() => {
    if (location.pathname.includes('/admin/registration')) return 'registration';
    if (location.pathname.includes('/admin/queue')) return 'queue';
    return 'dashboard';
  }, [location.pathname]);

  const AdminShell = ({ children }: { children: ReactNode }) => (
    <div className="md:flex min-h-screen md:h-screen bg-surface text-on-surface font-sans md:overflow-hidden">
      <Sidebar
        currentView={currentAdminView}
        onNavigate={(view) => {
          if (view === 'dashboard') navigate('/admin/dashboard');
          if (view === 'registration') navigate('/admin/registration');
          if (view === 'queue') navigate('/admin/queue');
          if (view === 'finecheck') navigate('/fine-check');
        }}
        role={role}
      />
      <div className="flex-1 flex flex-col min-h-screen md:h-screen md:overflow-hidden">
        <TopBar role={role} onRoleChange={handleRoleChange} />
        <div className="md:hidden px-4 py-3 border-b border-surface-low bg-white/80 backdrop-blur">
          {role === 'user' ? (
            <div className="grid grid-cols-1 gap-2">
              <button
                onClick={() => navigate('/fine-check')}
                className="py-2 rounded-lg text-xs font-semibold bg-surface-low text-on-surface"
              >
                Торгууль шалгах
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => navigate('/admin/dashboard')}
                className={`py-2 rounded-lg text-xs font-semibold ${currentAdminView === 'dashboard' ? 'bg-primary text-white' : 'bg-surface-low text-on-surface'}`}
              >
                Самбар
              </button>
              <button
                onClick={() => navigate('/admin/registration')}
                className={`py-2 rounded-lg text-xs font-semibold ${currentAdminView === 'registration' ? 'bg-primary text-white' : 'bg-surface-low text-on-surface'}`}
              >
                Бүртгэх
              </button>
              <button
                onClick={() => navigate('/admin/queue')}
                className={`py-2 rounded-lg text-xs font-semibold ${currentAdminView === 'queue' ? 'bg-primary text-white' : 'bg-surface-low text-on-surface'}`}
              >
                Жагсаалт
              </button>
            </div>
          )}
        </div>
        <main className="flex-1 md:overflow-y-auto">{children}</main>
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
            onCaseUpdated={(id) => void refreshSelectedCase(id)}
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
        path="/admin/queue"
        element={
          role === 'user' ? (
            <Navigate to="/fine-check" replace />
          ) : (
            <AdminShell>
              <WorkerQueue />
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
