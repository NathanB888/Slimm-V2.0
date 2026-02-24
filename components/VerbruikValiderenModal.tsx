
import React, { useState } from 'react';
import { X, Lock, PenLine, FileText, Check, Crown, Loader2 } from 'lucide-react';
import { supabase } from '../services/supabaseClient';

interface Props {
  isPremium: boolean;
  onClose: () => void;
  onUpload: () => void;
}

const USPS = [
  'Geen abonnement',
  'Eenmalige aankoop',
  'Alle premium functies (ook toekomstig)',
  '45 dagen bedenktijd',
];

interface OptionCardProps {
  icon: React.ElementType;
  title: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
}

function OptionCard({ icon: Icon, title, description, onClick, disabled }: OptionCardProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="flex-1 relative flex flex-col items-center text-center gap-3 p-6 bg-slate-50 border border-slate-200 rounded-2xl hover:border-blue-300 hover:bg-blue-50 transition-all group disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {/* Icon area */}
      <div className="relative mt-1">
        <div className="w-14 h-14 bg-white border border-slate-200 rounded-xl flex items-center justify-center text-slate-400 group-hover:text-blue-500 group-hover:border-blue-200 transition-colors shadow-sm">
          <Icon size={24} />
        </div>
        <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-slate-700 rounded-full flex items-center justify-center">
          <Lock size={9} className="text-white" />
        </div>
      </div>

      <div className="space-y-1">
        <p className="font-bold text-slate-800 text-sm leading-snug">{title}</p>
        <p className="text-xs text-slate-400 leading-relaxed">{description}</p>
      </div>
    </button>
  );
}

export const VerbruikValiderenModal: React.FC<Props> = ({ isPremium, onClose, onUpload }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const redirectToStripe = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Niet ingelogd');

      const res = await fetch('/api/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, userEmail: user.email }),
      });

      if (!res.ok) throw new Error('Sessie aanmaken mislukt');
      const { url } = await res.json();
      window.location.href = url;
    } catch (err) {
      setError('Er ging iets mis. Probeer het opnieuw.');
      setLoading(false);
    }
  };

  const handleOptionClick = (option: 'manual' | 'upload') => {
    if (isPremium) {
      if (option === 'upload') onUpload();
    } else {
      redirectToStripe();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md sm:max-w-[528px] relative overflow-hidden">

        {/* Close */}
        <button
          onClick={onClose}
          disabled={loading}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors z-10 disabled:opacity-50"
        >
          <X size={20} />
        </button>

        {/* Header */}
        <div className="px-6 pt-7 pb-5">
          <h2 className="text-xl font-extrabold text-slate-900 leading-tight">Verbruik valideren</h2>
          <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
            Gebruik nauwkeurige verbruiksdata voor preciezere besparingen.
          </p>
        </div>

        {/* Option cards */}
        <div className="px-6 flex flex-col sm:flex-row gap-3">
          <OptionCard
            icon={PenLine}
            title="Handmatig invoeren"
            description="Voer je totaal kWh en maandelijkse kosten in"
            onClick={() => handleOptionClick('manual')}
            disabled={loading}
          />
          <OptionCard
            icon={FileText}
            title="Factuur uploaden"
            description="Upload je energienota voor automatische herkenning"
            onClick={() => handleOptionClick('upload')}
            disabled={loading}
          />
        </div>

        {/* Divider */}
        <div className="h-px bg-gray-100 mx-6 my-5" />

        {/* USPs */}
        <div className="px-6 space-y-2.5">
          {USPS.map((usp) => (
            <div key={usp} className="flex items-center gap-2.5">
              <div className="w-4 h-4 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
                <Check size={9} className="text-emerald-600" strokeWidth={3} />
              </div>
              <span className="text-sm text-slate-600">{usp}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="p-6 pt-5">
          {error && (
            <p className="text-sm text-red-500 text-center mb-3">{error}</p>
          )}
          <button
            onClick={redirectToStripe}
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white p-4 rounded-xl font-bold text-base hover:bg-blue-700 active:scale-[0.98] transition-all disabled:opacity-70 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Doorsturen naar betaling...
              </>
            ) : (
              <>
                <Crown size={16} />
                Ontgrendel voor €19,99 eenmalig
              </>
            )}
          </button>
          <p className="text-center text-xs text-slate-400 mt-2.5">Veilig betalen via Stripe</p>
        </div>
      </div>
    </div>
  );
};
