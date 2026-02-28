
import React, { useState, useRef, useEffect } from 'react';
import { UserProfile, HouseholdSize, HouseType, ContractType } from '../types';
import { ENERGY_PROVIDERS, HOUSE_TYPES_LABELS, HOUSEHOLD_SIZE_LABELS, CONTRACT_TYPE_LABELS } from '../constants';
import { estimateKwhUsage } from '../services/geminiService';
import { supabase } from '../services/supabaseClient';
import { Loader2, MapPin } from 'lucide-react';

interface SignupFlowProps {
  onComplete: (profile: UserProfile) => void;
  onSignupStart: () => void;
  onSignupAbort: () => void;
  onLoginComplete: (userId: string) => void;
}

export const SignupFlow: React.FC<SignupFlowProps> = ({ onComplete, onSignupStart, onSignupAbort, onLoginComplete }) => {
  const isMounted = useRef(true);
  const addressDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [step, setStep] = useState(1);
  const [isLogin, setIsLogin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Step 1 field-level errors
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  // Steps 2–4 validation error
  const [stepError, setStepError] = useState<string | null>(null);

  // General submission error (step 4)
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [authData, setAuthData] = useState({ email: '', password: '' });

  // Address lookup (step 2) — partial=true means postcode matched but house number not found
  const [addressLookup, setAddressLookup] = useState<{
    loading: boolean;
    result: string | null;
    partial: boolean;
    error: string | null;
  }>({ loading: false, result: null, partial: false, error: null });

  const [formData, setFormData] = useState<Partial<UserProfile>>({
    behaviors: {
      workFromHome: false,
      heatPump: false,
      districtHeating: false,
      solarPanels: false
    }
  });

  useEffect(() => () => { isMounted.current = false; }, []);

  // Debounced address lookup via PDOK Locatieserver (free Dutch government API)
  useEffect(() => {
    const zipcode = (formData.zipcode || '').replace(/\s/g, '');
    const houseNumber = (formData.houseNumber || '').trim();

    if (!/^\d{4}[A-Za-z]{2}$/.test(zipcode) || !houseNumber) {
      setAddressLookup({ loading: false, result: null, partial: false, error: null });
      return;
    }

    if (addressDebounce.current) clearTimeout(addressDebounce.current);
    setAddressLookup({ loading: true, result: null, partial: false, error: null });

    addressDebounce.current = setTimeout(async () => {
      try {
        const base = `https://api.pdok.nl/bzk/locatieserver/search/v3_1/free`;
        const fields = `fl=weergavenaam,straatnaam,huisnummer,postcode,woonplaatsnaam`;

        // 1. Try exact postcode + house number
        const q = encodeURIComponent(`${zipcode} ${houseNumber}`);
        const res = await fetch(`${base}?q=${q}&fq=type:adres&rows=1&${fields}`);
        if (!res.ok) throw new Error('lookup failed');
        const data = await res.json();
        const doc = data.response?.docs?.[0];

        // Verify the returned house number actually matches what the user typed.
        // PDOK fuzzy search can return the nearest house number (e.g. 135 for input "1"),
        // so we must confirm the numeric part matches exactly.
        const inputNumeric = parseInt(houseNumber, 10);
        const exactMatch = doc && !isNaN(inputNumeric) && doc.huisnummer === inputNumeric;

        if (exactMatch) {
          setAddressLookup({ loading: false, result: doc.weergavenaam, partial: false, error: null });
          return;
        }

        // 2. Fallback: query just the postcode to at least confirm the street + city
        const fallbackQ = encodeURIComponent(zipcode);
        const fallbackRes = await fetch(`${base}?q=${fallbackQ}&fq=type:adres&rows=1&${fields}`);
        if (!fallbackRes.ok) throw new Error('fallback failed');
        const fallbackData = await fallbackRes.json();
        const fallbackDoc = fallbackData.response?.docs?.[0];

        if (fallbackDoc) {
          setAddressLookup({
            loading: false,
            result: `${fallbackDoc.straatnaam}, ${fallbackDoc.postcode} ${fallbackDoc.woonplaatsnaam}`,
            partial: true,
            error: null,
          });
        } else {
          setAddressLookup({ loading: false, result: null, partial: false, error: 'Postcode niet gevonden. Controleer je invoer.' });
        }
      } catch {
        setAddressLookup({ loading: false, result: null, partial: false, error: 'Kon adres niet ophalen. Probeer het opnieuw.' });
      }
    }, 600);

    return () => { if (addressDebounce.current) clearTimeout(addressDebounce.current); };
  }, [formData.zipcode, formData.houseNumber]);

  const next = () => { setStepError(null); setStep(s => s + 1); };
  const back = () => { setStepError(null); setStep(s => s - 1); };

  // --- Step 1 validation ---
  const validateStep1 = (): boolean => {
    let valid = true;
    if (!authData.email || !/\S+@\S+\.\S+/.test(authData.email)) {
      setEmailError('Voer een geldig e-mailadres in.');
      valid = false;
    } else {
      setEmailError(null);
    }
    if (!authData.password || authData.password.length < 6) {
      setPasswordError('Wachtwoord moet minimaal 6 tekens bevatten.');
      valid = false;
    } else {
      setPasswordError(null);
    }
    return valid;
  };

  // --- Step 2 validation ---
  const validateStep2 = (): boolean => {
    if (!formData.zipcode || !formData.houseNumber || !formData.householdSize || !formData.houseType) {
      setStepError('Vul alle velden in om door te gaan.');
      return false;
    }
    setStepError(null);
    return true;
  };

  // --- Step 3 validation ---
  const validateStep3 = (): boolean => {
    if (!formData.currentProvider || !formData.currentContractType) {
      setStepError('Selecteer je leverancier en contracttype om door te gaan.');
      return false;
    }
    setStepError(null);
    return true;
  };

  // --- Step 4 validation ---
  const validateStep4 = (): boolean => {
    if (!formData.monthlyCost || formData.monthlyCost <= 0) {
      setStepError('Voer je gemiddelde maandelijkse kosten in.');
      return false;
    }
    setStepError(null);
    return true;
  };

  const handleAuth = async () => {
    if (!validateStep1()) return;
    setLoading(true);
    try {
      if (isLogin) {
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: authData.email,
          password: authData.password,
        });
        if (signInError) throw signInError;
        if (!signInData.user) throw new Error('Inloggen mislukt');
        onLoginComplete(signInData.user.id);
      } else {
        setLoading(false);
        next();
      }
    } catch (err: any) {
      const msg = (err.message || '').toLowerCase();
      if (msg.includes('invalid login credentials') || msg.includes('invalid credentials')) {
        setPasswordError('E-mailadres of wachtwoord is onjuist.');
      } else if (msg.includes('already registered') || msg.includes('already exists')) {
        setEmailError('Er bestaat al een account met dit e-mailadres.');
      } else {
        setPasswordError(err.message || 'Er is een fout opgetreden');
      }
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!validateStep4()) return;
    setSubmitting(true);
    setLoading(true);
    setSubmitError(null);
    try {
      onSignupStart();
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: authData.email,
        password: authData.password,
      });

      if (signUpError) {
        // If email already exists, navigate back to step 1 and show error there
        if ((signUpError.message || '').toLowerCase().includes('already registered')) {
          setStep(1);
          setEmailError('Er bestaat al een account met dit e-mailadres.');
          onSignupAbort();
          setSubmitting(false);
          setLoading(false);
          return;
        }
        throw signUpError;
      }
      if (!signUpData.user) throw new Error("Gebruiker kon niet worden aangemaakt.");

      const estimate = await estimateKwhUsage({ ...formData, email: authData.email, monthlyCost: formData.monthlyCost || 0 } as UserProfile);

      const completeProfile: UserProfile = {
        ...(formData as UserProfile),
        email: authData.email,
        isVerified: false,
        estimatedKwhPerMonth: estimate.estimated_kwh_per_month,
        estimatedPerKwhRate: estimate.estimated_per_kwh_rate,
        estimateConfidence: estimate.confidence_level
      };

      const { error: profileError } = await supabase.from('profiles').upsert({
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
      onSignupAbort();
      setSubmitting(false);
      setLoading(false);
      setSubmitError(err.message || 'Fout bij het opslaan van gegevens');
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
            <div className="space-y-1">
              <input
                type="email"
                placeholder="E-mailadres"
                className={`w-full p-3 border rounded-lg bg-white text-slate-900 ${emailError ? 'border-red-400' : ''}`}
                value={authData.email}
                onChange={e => { setAuthData({ ...authData, email: e.target.value }); setEmailError(null); }}
              />
              {emailError && <p className="text-sm text-red-500 px-1">{emailError}</p>}
            </div>
            <div className="space-y-1">
              <input
                type="password"
                placeholder="Wachtwoord"
                className={`w-full p-3 border rounded-lg bg-white text-slate-900 ${passwordError ? 'border-red-400' : ''}`}
                value={authData.password}
                onChange={e => { setAuthData({ ...authData, password: e.target.value }); setPasswordError(null); }}
              />
              {passwordError && <p className="text-sm text-red-500 px-1">{passwordError}</p>}
            </div>
            <button
              onClick={handleAuth}
              disabled={loading}
              className="w-full bg-blue-600 text-white p-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              {loading ? 'Bezig...' : (isLogin ? 'Inloggen' : 'Doorgaan')}
            </button>
            <button
              onClick={() => { setIsLogin(!isLogin); setEmailError(null); setPasswordError(null); }}
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
                onChange={e => { setFormData({ ...formData, zipcode: e.target.value.toUpperCase() }); setStepError(null); }}
              />
              <input
                type="text"
                placeholder="Huisnummer"
                className="p-3 border rounded-lg bg-white text-slate-900"
                value={formData.houseNumber || ''}
                onChange={e => { setFormData({ ...formData, houseNumber: e.target.value }); setStepError(null); }}
              />
            </div>
            {/* Address lookup result */}
            {addressLookup.loading && (
              <div className="flex items-center gap-2 text-sm text-gray-400 px-1">
                <Loader2 size={13} className="animate-spin" />
                Adres ophalen...
              </div>
            )}
            {addressLookup.result && (
              <div className={`flex items-center gap-2 text-sm rounded-lg px-3 py-2 ${
                addressLookup.partial
                  ? 'text-amber-700 bg-amber-50 border border-amber-100'
                  : 'text-emerald-600 bg-emerald-50 border border-emerald-100'
              }`}>
                <MapPin size={14} className="shrink-0" />
                <span>
                  {addressLookup.result}
                  {addressLookup.partial && <span className="ml-1 opacity-70">— huisnummer niet gevonden</span>}
                </span>
              </div>
            )}
            {addressLookup.error && (
              <p className="text-sm text-red-500 px-1">{addressLookup.error}</p>
            )}
            <div>
              <label className="block text-sm font-medium mb-1">Grootte huishouden</label>
              <select
                className={`w-full p-3 border rounded-lg bg-white ${formData.householdSize ? 'text-slate-900' : 'text-gray-400'}`}
                value={formData.householdSize || ''}
                onChange={e => { setFormData({ ...formData, householdSize: e.target.value as HouseholdSize }); setStepError(null); }}
              >
                <option value="" disabled>Maak een keuze</option>
                {Object.entries(HOUSEHOLD_SIZE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Type woning</label>
              <select
                className={`w-full p-3 border rounded-lg bg-white ${formData.houseType ? 'text-slate-900' : 'text-gray-400'}`}
                value={formData.houseType || ''}
                onChange={e => { setFormData({ ...formData, houseType: e.target.value as HouseType }); setStepError(null); }}
              >
                <option value="" disabled>Maak een keuze</option>
                {Object.entries(HOUSE_TYPES_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            {stepError && <p className="text-sm text-red-500 px-1">{stepError}</p>}
            <div className="flex gap-2">
              <button onClick={back} className="flex-1 border p-3 rounded-lg bg-white text-slate-900">Terug</button>
              <button onClick={() => validateStep2() && next()} className="flex-[2] bg-blue-600 text-white p-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors">Doorgaan</button>
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
                className={`w-full p-3 border rounded-lg bg-white ${formData.currentProvider ? 'text-slate-900' : 'text-gray-400'}`}
                value={formData.currentProvider || ''}
                onChange={e => { setFormData({ ...formData, currentProvider: e.target.value }); setStepError(null); }}
              >
                <option value="" disabled>Selecteer leverancier...</option>
                {ENERGY_PROVIDERS.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Contracttype</label>
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(CONTRACT_TYPE_LABELS).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => { setFormData({ ...formData, currentContractType: val as ContractType }); setStepError(null); }}
                    className={`p-2 border rounded-lg capitalize ${formData.currentContractType === val ? 'bg-blue-50 border-blue-600 text-blue-600' : 'bg-white text-slate-900'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {stepError && <p className="text-sm text-red-500 px-1">{stepError}</p>}
            <div className="flex gap-2">
              <button onClick={back} className="flex-1 border p-3 rounded-lg bg-white text-slate-900">Terug</button>
              <button onClick={() => validateStep3() && next()} className="flex-[2] bg-blue-600 text-white p-3 rounded-lg font-semibold hover:bg-blue-700 transition-colors">Doorgaan</button>
            </div>
          </div>
        );
      case 4:
        return (
          <div className="space-y-4">
            <h2 className="text-xl font-bold">Maandkosten & Verbruik</h2>
            {submitError && <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">{submitError}</div>}
            <div className="relative">
              <span className="absolute left-3 top-3 text-gray-500">€</span>
              <input
                type="number"
                placeholder="Gemiddelde maandelijkse kosten"
                className="w-full p-3 pl-8 border rounded-lg bg-white text-slate-900"
                value={formData.monthlyCost || ''}
                onChange={e => { setFormData({ ...formData, monthlyCost: Number(e.target.value) }); setStepError(null); }}
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
            {stepError && <p className="text-sm text-red-500 px-1">{stepError}</p>}
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

  if (submitting) {
    return (
      <div className="bg-white p-8 rounded-2xl shadow-xl border border-gray-100">
        <div className="flex flex-col items-center justify-center py-12 gap-4">
          <Loader2 className="animate-spin text-blue-600" size={48} />
          <p className="text-slate-700 font-semibold text-lg">Account aanmaken...</p>
          <p className="text-slate-400 text-sm text-center">We schatten je verbruik in met AI.<br/>Dit duurt een paar seconden.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white p-8 rounded-2xl shadow-xl border border-gray-100">
      <div className="w-full bg-gray-100 h-1 rounded-full mb-8">
        <div className="bg-blue-600 h-1 rounded-full transition-all duration-300" style={{ width: `${(step / 4) * 100}%` }}></div>
      </div>
      {renderStep()}
    </div>
  );
};
