
import React, { useState, useEffect } from 'react';
import { UserProfile, ComparisonResult } from '../types';
import { compareMarketPrices } from '../services/geminiService';
import { CONTRACT_TYPE_LABELS } from '../constants';
import { CheckCircle, AlertTriangle, RefreshCw, Upload, Trash2, HelpCircle } from 'lucide-react';

interface DashboardProps {
  profile: UserProfile;
  onUpdate: (profile: Partial<UserProfile>) => void;
  onLogout: () => void;
  onVerify: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ profile, onUpdate, onLogout, onVerify }) => {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<ComparisonResult | null>(null);

  const performCheck = async () => {
    setChecking(true);
    try {
      const res = await compareMarketPrices(profile);
      setResult(res);
    } catch (e) {
      console.error(e);
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    performCheck();
  }, []);

  const getStatusInfo = () => {
    if (!profile.isVerified) {
      return {
        label: "⏳ Rekening verifiëren...",
        sub: "Upload je rekening voor 100% nauwkeurigheid",
        color: "bg-gray-100 text-gray-600"
      };
    }
    if (!result) return { label: "Controleren...", sub: "", color: "bg-gray-100" };
    
    if (result.recommendation === 'STAY') {
      return {
        label: "✓ Beste prijs",
        sub: "Je zit momenteel op de goedkoopste optie",
        color: "bg-emerald-100 text-emerald-700"
      };
    } else if (result.recommendation === 'SWITCH') {
      return {
        label: `💰 Bespaar €${result.savingsEur}`,
        sub: "Je kunt dit bedrag maandelijks besparen door over te stappen",
        color: "bg-orange-100 text-orange-700"
      };
    } else {
      return {
        label: "⚡ Actie vereist",
        sub: result.reasoning,
        color: "bg-yellow-100 text-yellow-700"
      };
    }
  };

  const status = getStatusInfo();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div className="flex items-center gap-3">
           <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold">
            {profile.email.charAt(0).toUpperCase()}
           </div>
           <span className="text-sm font-medium text-slate-700">{profile.email}</span>
        </div>
        <button onClick={onLogout} className="text-sm text-gray-400 hover:text-red-500 transition-colors">Uitloggen</button>
      </div>

      <div className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100 overflow-hidden relative">
        <div className={`absolute top-0 right-0 px-4 py-1 rounded-bl-xl text-xs font-bold uppercase tracking-wider ${status.color}`}>
          {status.label}
        </div>

        <div className="space-y-6">
          <section>
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-4">Huidig Contract</h3>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold text-slate-800">{profile.currentProvider}</p>
                <p className="text-gray-500 capitalize">{CONTRACT_TYPE_LABELS[profile.currentContractType] || profile.currentContractType} tarief • €{profile.monthlyCost}/p.m.</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-medium text-gray-400">Geschat verbruik</p>
                <p className="text-lg font-semibold text-slate-800">{profile.isVerified ? profile.verifiedKwhPerMonth : profile.estimatedKwhPerMonth} kWh/p.m.</p>
              </div>
            </div>
          </section>

          <div className="h-px bg-gray-100"></div>

          <section>
            <div className="flex items-start gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-100">
              {result?.recommendation === 'SWITCH' ? (
                <div className="bg-orange-500 p-2 rounded-lg text-white"><AlertTriangle size={20}/></div>
              ) : (
                <div className="bg-emerald-500 p-2 rounded-lg text-white"><CheckCircle size={20}/></div>
              )}
              <div>
                <p className="font-bold text-slate-900">{status.label}</p>
                <p className="text-sm text-slate-500 leading-relaxed">{status.sub}</p>
              </div>
            </div>
          </section>

          <div className="flex gap-2">
            <button 
              onClick={performCheck} 
              disabled={checking}
              className="flex-1 flex items-center justify-center gap-2 bg-slate-900 text-white p-3 rounded-xl font-semibold hover:bg-slate-800 transition-all disabled:opacity-50"
            >
              <RefreshCw size={18} className={checking ? 'animate-spin' : ''} />
              {checking ? 'Controleren...' : 'Nu controleren'}
            </button>
            {!profile.isVerified && (
              <button 
                onClick={onVerify}
                className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white p-3 rounded-xl font-semibold hover:bg-blue-700 transition-all"
              >
                <Upload size={18} />
                Rekening uploaden
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
        <div className="flex items-center gap-2 mb-4">
          <HelpCircle size={18} className="text-blue-500" />
          <h3 className="font-bold text-slate-800">Help ons verbeteren</h3>
        </div>
        <p className="text-sm text-gray-500 mb-4">Welke functie zou je helpen om meer te besparen?</p>
        <div className="space-y-2">
          <select className="w-full p-3 border rounded-lg text-sm bg-gray-50 text-slate-700">
            <option>Selecteer een optie...</option>
            <option>Betere mobiele ervaring</option>
            <option>Gascontract toevoegen</option>
            <option>Prijsgeschiedenis grafieken</option>
            <option>Dagelijkse prijsmeldingen</option>
            <option>Anders</option>
          </select>
          <button className="w-full bg-slate-100 text-slate-600 p-2 rounded-lg text-sm font-semibold hover:bg-slate-200">Verstuur Feedback</button>
        </div>
      </div>

      <button className="w-full flex items-center justify-center gap-2 text-gray-400 py-4 text-sm hover:text-red-500 transition-colors">
        <Trash2 size={16} />
        Mijn account verwijderen
      </button>
    </div>
  );
};
