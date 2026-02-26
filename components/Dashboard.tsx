
import React, { useState } from 'react';
import { UserProfile, PriceCheckResult, MarketProvider } from '../types';
import { compareMarketPrices } from '../services/geminiService';
import { CONTRACT_TYPE_LABELS, FEATURE_VERBRUIK_VALIDEREN } from '../constants';
import { CheckCircle, AlertTriangle, RefreshCw, Trash2, HelpCircle, Zap, Lock, Crown, ShieldCheck } from 'lucide-react';
import { VerbruikValiderenModal } from './VerbruikValiderenModal';

interface DashboardProps {
  profile: UserProfile;
  onUpdate: (profile: Partial<UserProfile>) => void;
  onLogout: () => void;
  onVerify: () => void;
  onCheckComplete: (result: PriceCheckResult) => void;
}

function formatCheckedAt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' }) +
    ' om ' + d.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' });
}

function ProviderCard({ provider, rank, userKwhPerMonth }: { provider: MarketProvider; rank: number; userKwhPerMonth: number }) {
  const isVariable = provider.contractType === 'variable';
  const monthlyEstimate = provider.perKwhRate * userKwhPerMonth;
  return (
    <div className="flex-1 bg-slate-50 border border-slate-100 rounded-2xl p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">#{rank}</span>
        <span className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${isVariable ? 'bg-blue-100 text-blue-600' : 'bg-slate-200 text-slate-600'}`}>
          {isVariable ? <Zap size={10} /> : <Lock size={10} />}
          {isVariable ? 'Variabel' : 'Vast'}
        </span>
      </div>
      <p className="font-bold text-slate-900 text-base leading-tight">{provider.name}</p>
      <p className="text-2xl font-extrabold text-slate-800">
        €{monthlyEstimate.toFixed(0)}
        <span className="text-sm font-normal text-slate-400">/maand</span>
      </p>
      <p className="text-xs text-slate-400">{userKwhPerMonth} kWh/maand</p>
      {provider.welkomsbonus ? (
        <p className="text-xs font-semibold text-emerald-600">+ €{provider.welkomsbonus} welkomsbonus</p>
      ) : null}
    </div>
  );
}

export const Dashboard: React.FC<DashboardProps> = ({ profile, onUpdate, onLogout, onVerify, onCheckComplete }) => {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<PriceCheckResult | null>(profile.lastPriceCheck ?? null);
  const [showValiderenModal, setShowValiderenModal] = useState(false);

  const isPremium = profile.subscriptionStatus === 'premium';

  const performCheck = async () => {
    setChecking(true);
    try {
      const res = await compareMarketPrices(profile);
      setResult(res);
      onCheckComplete(res);
    } catch (e) {
      console.error(e);
    } finally {
      setChecking(false);
    }
  };

  const canSwitch = result?.recommendation === 'SWITCH' && result.monthlySavings > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-bold">
              {profile.email.charAt(0).toUpperCase()}
            </div>
            {isPremium && (
              <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-amber-400 rounded-full flex items-center justify-center">
                <Crown size={8} className="text-white" />
              </div>
            )}
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-slate-700">{profile.email}</span>
            {isPremium && (
              <span className="flex items-center gap-1 text-xs font-semibold text-amber-600">
                <ShieldCheck size={10} />
                Premium
              </span>
            )}
          </div>
        </div>
        <button onClick={onLogout} className="text-sm text-gray-400 hover:text-red-500 transition-colors">Uitloggen</button>
      </div>

      {/* Main card */}
      <div className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100 space-y-6">

        {/* Current contract */}
        <section>
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-4">Huidig Contract</h3>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-2xl font-bold text-slate-800">{profile.currentProvider}</p>
              <p className="text-gray-500 capitalize">
                {CONTRACT_TYPE_LABELS[profile.currentContractType] || profile.currentContractType} tarief &bull; €{profile.monthlyCost}/p.m.
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-gray-400">{profile.isVerified ? 'Geverifieerd' : 'Geschat'} verbruik</p>
              <p className="text-lg font-semibold text-slate-800">
                {profile.isVerified ? profile.verifiedKwhPerMonth : profile.estimatedKwhPerMonth} kWh/p.m.
              </p>
            </div>
          </div>
        </section>

        <div className="h-px bg-gray-100" />

        {/* Price check result */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-widest">Marktprijzen</h3>
            {result?.checkedAt && (
              <span className="text-xs text-gray-400">Gecontroleerd: {formatCheckedAt(result.checkedAt)}</span>
            )}
          </div>

          {result && result.top2.length > 0 ? (
            <>
              {/* Top 2 provider cards */}
              <div className="flex gap-3">
                {result.top2.map((provider, i) => (
                  <ProviderCard key={provider.name} provider={provider} rank={i + 1} userKwhPerMonth={result.userKwhPerMonth} />
                ))}
              </div>

              {/* Recommendation banner */}
              {canSwitch ? (
                <div className="flex items-start gap-4 p-4 rounded-2xl bg-orange-50 border border-orange-100">
                  <div className="bg-orange-500 p-2 rounded-lg text-white shrink-0">
                    <AlertTriangle size={20} />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">
                      Bespaar €{result.monthlySavings.toFixed(0)}/maand door over te stappen
                    </p>
                    <p className="text-sm text-slate-500 leading-relaxed mt-0.5">{result.reasoning}</p>
                  </div>
                </div>
              ) : (
                <div className="flex items-start gap-4 p-4 rounded-2xl bg-emerald-50 border border-emerald-100">
                  <div className="bg-emerald-500 p-2 rounded-lg text-white shrink-0">
                    <CheckCircle size={20} />
                  </div>
                  <div>
                    <p className="font-bold text-slate-900">Je zit op de beste prijs</p>
                    <p className="text-sm text-slate-500 leading-relaxed mt-0.5">{result.reasoning}</p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="bg-slate-50 border border-slate-100 rounded-2xl p-6 text-center space-y-2">
              <p className="text-slate-500 text-sm">
                {checking
                  ? 'AI zoekt de beste prijzen voor jou...'
                  : 'Klik op "Nu controleren" om de actuele marktprijzen te vergelijken.'}
              </p>
            </div>
          )}
        </section>

        {/* Action buttons */}
        <div className="flex gap-2">
          <button
            onClick={performCheck}
            disabled={checking}
            className="flex-1 flex items-center justify-center gap-2 bg-slate-900 text-white p-3 rounded-xl font-semibold hover:bg-slate-800 transition-all disabled:opacity-50"
          >
            <RefreshCw size={18} className={checking ? 'animate-spin' : ''} />
            {checking ? 'Controleren...' : 'Nu controleren'}
          </button>
          {FEATURE_VERBRUIK_VALIDEREN && (
            <button
              onClick={() => setShowValiderenModal(true)}
              className="flex-1 flex items-center justify-center gap-2 bg-blue-600 text-white p-3 rounded-xl font-semibold hover:bg-blue-700 transition-all"
            >
              <ShieldCheck size={18} />
              Verbruik valideren
            </button>
          )}
        </div>
      </div>

      {/* Feedback widget */}
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

      {showValiderenModal && (
        <VerbruikValiderenModal
          isPremium={isPremium}
          onClose={() => setShowValiderenModal(false)}
          onUpload={() => {
            setShowValiderenModal(false);
            onVerify();
          }}
        />
      )}
    </div>
  );
};
