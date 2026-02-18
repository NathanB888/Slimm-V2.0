
import React, { useState, useEffect, useRef } from 'react';
import { Layout } from './components/Layout';
import { SignupFlow } from './components/SignupFlow';
import { Dashboard } from './components/Dashboard';
import { BillVerification } from './components/BillVerification';
import { UserProfile, HouseholdSize, HouseType, ContractType } from './types';
import { Check, Loader2 } from 'lucide-react';
import { supabase } from './services/supabaseClient';

const App: React.FC = () => {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMessage, setLoadingMessage] = useState('Laden van jouw gegevens...');
  const [isVerifying, setIsVerifying] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);

  // Prevents the auth state listener from calling fetchProfile and setting
  // loading=true (which would unmount SignupFlow) while a signup is in progress.
  const signupInProgress = useRef(false);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
        // Skip during signup — profile will be provided by handleSignupComplete
        if (signupInProgress.current) return;
        await fetchProfile(session.user.id);
      } else if (event === 'SIGNED_OUT') {
        setProfile(null);
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    setLoading(true);
    const MAX_RETRIES = 5;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      if (attempt > 0) {
        setLoadingMessage('Profiel configureren...');
        await new Promise(res => setTimeout(res, 700 * attempt));
      }

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();

        if (error?.code === 'PGRST116') continue;
        if (error) throw error;

        if (data) {
          const mappedProfile: UserProfile = {
            email: data.email,
            zipcode: data.zipcode,
            houseNumber: data.house_number,
            householdSize: data.household_size as HouseholdSize,
            houseType: data.house_type as HouseType,
            currentProvider: data.current_provider,
            currentContractType: data.current_contract_type as ContractType,
            monthlyCost: data.monthly_cost,
            behaviors: {
              workFromHome: data.work_from_home,
              heatPump: data.heat_pump,
              districtHeating: data.district_heating,
              solarPanels: data.solar_panels
            },
            isVerified: data.is_verified,
            estimatedKwhPerMonth: data.estimated_kwh_per_month,
            estimatedPerKwhRate: data.estimated_per_kwh_rate
          };
          setProfile(mappedProfile);
          setLoading(false);
          setLoadingMessage('Laden van jouw gegevens...');
          return;
        }
      } catch (err) {
        console.error('Error fetching profile:', err);
        break;
      }
    }

    setLoading(false);
    setLoadingMessage('Laden van jouw gegevens...');
  };

  // Called by SignupFlow right before supabase.auth.signUp() — blocks fetchProfile
  const handleSignupStart = () => {
    signupInProgress.current = true;
  };

  // Called by SignupFlow on error — unblocks fetchProfile for future login attempts
  const handleSignupAbort = () => {
    signupInProgress.current = false;
  };

  // Called by SignupFlow after profile is fully created (auth + Gemini + DB)
  const handleSignupComplete = (newProfile: UserProfile) => {
    signupInProgress.current = false;
    setProfile(newProfile);
    setShowSuccess(true);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setShowSuccess(false);
    setIsVerifying(false);
  };

  const handleVerificationUpdate = async (update: Partial<UserProfile>) => {
    if (!profile) return;

    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const dbUpdate: any = {};
      if (update.isVerified !== undefined) dbUpdate.is_verified = update.isVerified;
      if (update.verifiedKwhPerMonth !== undefined) dbUpdate.estimated_kwh_per_month = update.verifiedKwhPerMonth;
      if (update.verifiedPerKwhRate !== undefined) dbUpdate.estimated_per_kwh_rate = update.verifiedPerKwhRate;
      if (update.verifiedProvider !== undefined) dbUpdate.current_provider = update.verifiedProvider;

      const { error } = await supabase
        .from('profiles')
        .update(dbUpdate)
        .eq('id', user.id);

      if (error) throw error;

      await fetchProfile(user.id);
      setIsVerifying(false);
    } catch (err) {
      console.error('Error updating profile:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <Loader2 className="animate-spin text-blue-600" size={48} />
          <p className="text-slate-500 font-medium">{loadingMessage}</p>
        </div>
      </Layout>
    );
  }

  if (!profile) {
    return (
      <Layout>
        <div className="text-center mb-12">
          <h2 className="text-4xl font-extrabold text-slate-900 mb-4 tracking-tight">Bespaar op je energie. <br/><span className="text-blue-600">Zonder gedoe.</span></h2>
          <p className="text-lg text-slate-500 max-w-sm mx-auto">Wij controleren elke maand de marktprijzen. Kun je besparen? Dan laten we het je weten. Zo simpel is het.</p>
        </div>
        <SignupFlow
          onComplete={handleSignupComplete}
          onSignupStart={handleSignupStart}
          onSignupAbort={handleSignupAbort}
        />
      </Layout>
    );
  }

  if (showSuccess) {
    return (
      <Layout>
        <div className="bg-white p-8 rounded-3xl shadow-xl text-center space-y-6 border border-gray-100">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
            <Check size={32} />
          </div>
          <h2 className="text-2xl font-bold text-slate-800">Welkom, {profile.email.split('@')[0]}!</h2>
          <p className="text-slate-500">
            Op basis van je profiel schatten we dat je ongeveer <span className="font-bold text-slate-900">{profile.estimatedKwhPerMonth} kWh per maand</span> verbruikt tegen circa <span className="font-bold text-slate-900">€{profile.estimatedPerKwhRate?.toFixed(2)} per kWh</span>.
          </p>
          <div className="bg-blue-50 p-4 rounded-xl text-sm text-blue-700 font-medium">
            Je eerste prijscheck vindt morgen om 08:00 uur plaats. Upload je rekening voor de meest nauwkeurige besparingscheck.
          </div>
          <button
            onClick={() => setShowSuccess(false)}
            className="w-full bg-slate-900 text-white p-4 rounded-xl font-bold hover:bg-slate-800 transition-colors"
          >
            Naar het Dashboard
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {isVerifying ? (
        <BillVerification
          onVerified={handleVerificationUpdate}
          onCancel={() => setIsVerifying(false)}
        />
      ) : (
        <Dashboard
          profile={profile}
          onLogout={handleLogout}
          onUpdate={handleVerificationUpdate}
          onVerify={() => setIsVerifying(true)}
        />
      )}
    </Layout>
  );
};

export default App;
