
import React, { useState } from 'react';
import { extractBillData } from '../services/geminiService';
import { BillExtraction, UserProfile } from '../types';
import { CONTRACT_TYPE_LABELS } from '../constants';
import { Camera, FileText, Check, AlertCircle, ArrowLeft, RefreshCw as RefreshCwIcon } from 'lucide-react';

interface BillVerificationProps {
  onVerified: (data: Partial<UserProfile>) => void;
  onCancel: () => void;
}

export const BillVerification: React.FC<BillVerificationProps> = ({ onVerified, onCancel }) => {
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<BillExtraction | null>(null);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (ev) => {
      const base64 = ev.target?.result as string;
      setPreview(base64);
      setLoading(true);
      try {
        const data = await extractBillData(base64);
        setExtracted(data);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const confirm = () => {
    if (!extracted) return;
    onVerified({
      isVerified: true,
      verifiedKwhPerMonth: extracted.monthlyKwh || (extracted.annualKwh ? extracted.annualKwh / 12 : undefined),
      verifiedPerKwhRate: extracted.perKwhRate || undefined,
      verifiedProvider: extracted.providerName || undefined,
      verifiedContractType: extracted.contractType
    });
  };

  return (
    <div className="bg-white p-8 rounded-3xl shadow-xl border border-gray-100">
      <button onClick={onCancel} className="flex items-center gap-2 text-gray-400 mb-6 hover:text-slate-900 transition-colors">
        <ArrowLeft size={16} />
        Terug naar Dashboard
      </button>

      {!preview ? (
        <div className="text-center space-y-6">
          <div className="w-20 h-20 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mx-auto">
            <Camera size={40} />
          </div>
          <h2 className="text-2xl font-bold text-slate-800">Upload je rekening</h2>
          <p className="text-gray-500">Maak een foto of upload een PDF van je laatste energierekening. Wij lezen je werkelijke verbruik automatisch uit.</p>
          
          <label className="block w-full">
            <span className="sr-only">Kies bestand</span>
            <input 
              type="file" 
              accept="image/*,application/pdf"
              className="hidden" 
              onChange={handleFile}
            />
            <div className="w-full bg-blue-600 text-white p-4 rounded-xl font-bold cursor-pointer hover:bg-blue-700 transition-colors">
              Selecteer bestand
            </div>
          </label>
          <p className="text-xs text-gray-400">Ondersteunde formaten: JPG, PNG, PDF</p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="relative group">
            <img src={preview} className="w-full h-48 object-cover rounded-xl border" alt="Voorbeeld rekening" />
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity rounded-xl">
              <label className="cursor-pointer bg-white text-slate-900 px-4 py-2 rounded-lg text-sm font-bold">
                Wijzig bestand
                <input type="file" className="hidden" onChange={handleFile} />
              </label>
            </div>
          </div>

          {loading ? (
            <div className="flex flex-col items-center gap-4 py-8">
              <RefreshCwIcon className="animate-spin text-blue-600" size={32} />
              <p className="font-bold text-slate-700">Je rekening lezen...</p>
              <p className="text-sm text-gray-400">Gemini extraheert kWh en tarieven</p>
            </div>
          ) : extracted ? (
            <div className="space-y-4">
              <div className="bg-blue-50 p-4 rounded-xl border border-blue-100">
                <div className="flex items-center gap-2 mb-2 text-blue-700 font-bold">
                  <Check size={18} />
                  <span>Gegevens gevonden</span>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm text-slate-700">
                  <div>
                    <p className="text-gray-500">Jaarverbruik</p>
                    <p className="font-bold">{extracted.annualKwh || extracted.monthlyKwh ? Math.round(extracted.monthlyKwh ? extracted.monthlyKwh * 12 : extracted.annualKwh!) : '---'} kWh</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Leverancier</p>
                    <p className="font-bold">{extracted.providerName || 'Onbekend'}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Contract</p>
                    <p className="font-bold capitalize">{CONTRACT_TYPE_LABELS[extracted.contractType] || extracted.contractType}</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Tarief</p>
                    <p className="font-bold">€{extracted.perKwhRate?.toFixed(3) || '---'}/kWh</p>
                  </div>
                </div>
              </div>

              {extracted.warnings.length > 0 && (
                <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-100 flex gap-2">
                  <AlertCircle className="text-yellow-600 shrink-0" size={18} />
                  <ul className="text-xs text-yellow-700 space-y-1">
                    {extracted.warnings.map((w, i) => <li key={i}>{w}</li>)}
                  </ul>
                </div>
              )}

              <button 
                onClick={confirm}
                className="w-full bg-slate-900 text-white p-4 rounded-xl font-bold hover:bg-slate-800 transition-colors"
              >
                Bevestigen & Synchroniseren
              </button>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};
