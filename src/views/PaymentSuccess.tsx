import { CircleCheckBig } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export default function PaymentSuccess() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center px-4">
      <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-sm text-center space-y-4">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
            <CircleCheckBig className="text-green-700" size={32} />
          </div>
        </div>
        <h1 className="text-xl font-black text-on-surface">Төлбөр амжилттай</h1>
        <p className="text-sm text-on-secondary-container">
          Таны төлбөр баталгаажлаа. Ажилтан машиныг гаргахад бэлтгэнэ.
        </p>
        <button
          className="w-full bg-gradient-to-r from-primary to-primary-container text-white py-3 rounded-xl font-bold"
          onClick={() => navigate('/fine-check')}
        >
          Дуусгах
        </button>
      </div>
    </div>
  );
}

