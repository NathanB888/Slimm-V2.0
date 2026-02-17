
import React, { useState } from 'react';
import { UserProfile, HouseholdSize, HouseType, ContractType } from '../types';
import { ENERGY_PROVIDERS, HOUSE_TYPES_LABELS, HOUSEHOLD_SIZE_LABELS, CONTRACT_TYPE_LABELS } from '../constants';
import { estimateKwhUsage } from '../services/geminiService';
import { supabase } from '../services/supabaseClient';

interface SignupFlowProps {
  onComplete: (profile: UserProfile) => void;
}

export const SignupFlow: React.FC<SignupFlowProps> = ({ onComplete }) => {
  const [step, setStep] = useState(1);
  const [isLogin, setIsLogin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authData, setAuthData] = useState({ email: '', password: '' });
  const [formData, setFormData] = useState<Partial<UserProfile>>({
    householdSize: '3-4',
    houseType: 'single_family',
    behaviors: {
      workFromHome: false,
      heatPump: false,
      districtHeating: false,
      solarPanels: false
    }
  });

  const next = () => setStep(s => s + 1);
  const back = () => setStep(s => s - 1);

  const handleAuth = async () => {
    setLoading(true);
    setError(null);
    try {
      if (isLogin) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: authData.email,
          password: authData.password,
        });
        if (signInError) throw signInError;
        // Profile will be loaded by App.tsx listener
      } else {
        next(); // Move to survey steps
      }
    } catch (err: any) {
      setError(err.message || 'Er is een fout opgetreden');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Create Auth User
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: authData.email,
        password: authData.password,
      });

      if (signUpError) throw signUpError;
      if (!signUpData.user) throw new Error("Gebruiker kon niet worden aangemaakt.");

      // 2. Estimate usage via Gemini
      const estimate = await estimateKwhUsage({ ...formData, email: authData.email, monthlyCost: formData.monthlyCost || 0 } as UserProfile);
      
      const completeProfile: UserProfile = {
        ...(formData as UserProfile),
        email: authData.email,
        isVerified: false,
        estimatedKwhPerMonth: estimate.estimated_kwh_per_month,
        estimatedPerKwhRate: estimate.estimated_per_kwh_rate,
        estimateConfidence: estimate.confidence_level
      };

      // 3. Save to Supabase Profiles table
      const { error: profileError } = await supabase.from('profiles').insert({
        id: signUpData.user.id,
        email: authData.email,
        zipcode: formData.zipcode,
        house_number: formData.houseNumber,
        household_size: formData.householdSize,
        house_type: formData.houseType,
        current_provider: formData.currentProvider,
        current_contract_type: formData.currentContractType,
        monthly_cost: formData.monthlyCost,
        work_from_home: formData.behaviors?.workFromHome,
        heat_pump: formData.behaviors?.heatPump,
        district_heating: formData.behaviors?.districtHeating,
        solar_panels: formData.behaviors?.solarPanels,
        is_verified: false,
        estimated_kwh_per_month: estimate.estimated_kwh_per_month,
        estimated_per_kwh_rate: estimate.estimated_per_kwh_rate
      });

      if (profileError) throw profileError;

      onComplete(completeProfile);
    } catch (err: any) {
      setError(err.message || 'Fout bij het opslaan van gegevens');
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">{isLogin ? 'Inloggen' : 'Laten we beginnen'}</h2>
            <p className="text-gray-500">
              {isLogin ? 'Welkom terug! Log in op je account.' : 'Voer je e-mailadres in om je maandelijkse besparingsrapporten te ontvangen.'}
            </p>
            {error && <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>}
            <input 
              type="email" 
              placeholder="E-mailadres"
              className="w-full p-3 border rounded-lg bg-white text-slate-900"
              value={authData.email}
              onChange={e => setAuthData({ ...authData, email: e.target.value })}
            />
            <input 
              type="password" 
              placeholder="Wachtwoord"
              className="w-full p-3 border rounded-lg bg-white text-slate-900"
              value={authData.password}
              onChange={e => setAuthData({ ...authData, password: e.target.value })}
            />
            <button 
              onClick={handleAuth} 
              disabled={loading}
              className="w-full bg-blue-600 text-white p-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Bezig...' : (isLogin ? 'Inloggen' : 'Doorgaan')}
            </button>
            <button 
              onClick={() => setIsLogin(!isLogin)} 
              className="w-full text-sm text-blue-600 font-medium"
            >
              {isLogin ? 'Nog geen account? Maak er een aan' : 'Heb je al een account? Log in'}
            </button>
          </div>
        );
      case 2:
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Jouw Locatie</h2>
            <div className="grid grid-cols-2 gap-4">
              <input 
                type="text" 
                placeholder="Postcode (1234AB)"
                className="p-3 border rounded-lg bg-white text-slate-900"
                value={formData.zipcode || ''}
                onChange={e => setFormData({ ...formData, zipcode: e.target.value.toUpperCase() })}
              />
              <input 
                type="text" 
                placeholder="Huisnummer"
                className="p-3 border rounded-lg bg-white text-slate-900"
                value={formData.houseNumber || ''}
                onChange={e => setFormData({ ...formData, houseNumber: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Grootte huishouden</label>
              <select 
                className="w-full p-3 border rounded-lg bg-white text-slate-900"
                value={formData.householdSize}
                onChange={e => setFormData({ ...formData, householdSize: e.target.value as HouseholdSize })}
              >
                {Object.entries(HOUSEHOLD_SIZE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Type woning</label>
              <select 
                className="w-full p-3 border rounded-lg bg-white text-slate-900"
                value={formData.houseType}
                onChange={e => setFormData({ ...formData, houseType: e.target.value as HouseType })}
              >
                {Object.entries(HOUSE_TYPES_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={back} className="flex-1 border p-3 rounded-lg bg-white text-slate-900">Terug</button>
              <button onClick={next} className="flex-[2] bg-blue-600 text-white p-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors">Doorgaan</button>
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Huidig Contract</h2>
            <div>
              <label className="block text-sm font-medium mb-1">Leverancier</label>
              <select 
                className="w-full p-3 border rounded-lg bg-white text-slate-900"
                value={formData.currentProvider}
                onChange={e => setFormData({ ...formData, currentProvider: e.target.value })}
              >
                <option value="">Selecteer leverancier...</option>
                {ENERGY_PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Contracttype</label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(CONTRACT_TYPE_LABELS).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setFormData({ ...formData, currentContractType: val as ContractType })}
                    className={`p-2 border rounded-lg capitalize ${formData.currentContractType === val ? 'bg-blue-50 border-blue-600 text-blue-600' : 'bg-white text-slate-900'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={back} className="flex-1 border p-3 rounded-lg bg-white text-slate-900">Terug</button>
              <button onClick={next} className="flex-[2] bg-blue-600 text-white p-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors">Doorgaan</button>
            </div>
          </div>
        );
      case 4:
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Maandkosten & Verbruik</h2>
            {error && <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">{error}</div>}
            <div className="relative">
              <span className="absolute left-3 top-3 text-gray-500">€</span>
              <input 
                type="number" 
                placeholder="Gemiddelde maandelijkse kosten"
                className="w-full p-3 pl-8 border rounded-lg bg-white text-slate-900"
                value={formData.monthlyCost || ''}
                onChange={e => setFormData({ ...formData, monthlyCost: Number(e.target.value) })}
              />
            </div>
            <div className="space-y-2 bg-gray-50 p-4 rounded-lg">
              <p className="text-sm font-medium text-slate-700">Situatie details (helpt bij schatting)</p>
              {[
                { key: 'workFromHome', label: 'Ik werk regelmatig thuis' },
                { key: 'heatPump', label: 'Ik heb een warmtepomp' },
                { key: 'districtHeating', label: 'Ik heb stadsverwarming' },
                { key: 'solarPanels', label: 'Ik heb de zonnepanelen' }
              ].map(item => (
                <label key={item.key} className="flex items-center gap-2 cursor-pointer text-slate-700">
                  <input 
                    type="checkbox"
                    className="w-4 h-4 text-blue-600"
                    checked={(formData.behaviors as any)[item.key]}
                    onChange={e => setFormData({ 
                      ...formData, 
                      behaviors: { ...formData.behaviors!, [item.key]: e.target.checked }
                    })}
                  />
                  <span className="text-sm">{item.label}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={back} className="flex-1 border p-3 rounded-lg bg-white text-slate-900">Terug</button>
              <button 
                onClick={handleSubmit} 
                disabled={loading}
                className="flex-[2] bg-blue-600 text-white p-3 rounded-lg font-semibold disabled:opacity-50 hover:bg-blue-700 transition-colors"
              >
                {loading ? 'Bezig met opslaan...' : 'Inschrijven'}
              </button>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-white p-8 rounded-2xl shadow-xl border border-gray-100">
      <div className="w-full bg-gray-100 h-1 rounded-full mb-8">
        <div className="bg-blue-600 h-1 rounded-full transition-all duration-300" style={{ width: `${(step / 4) * 100}%` }}></div>
      </div>
      {renderStep()}
    </div>
  );
};
