
import { GoogleGenAI, Type } from "@google/genai";
import { UserProfile, ComparisonResult, BillExtraction, MarketProvider, PriceCheckResult } from "../types";

const getAI = () => {
  // import.meta.env.VITE_* is injected natively by Vite at build time —
  // this works reliably in Vercel without any define() trickery.
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || '';
  if (!apiKey) throw new Error('Gemini API-sleutel niet geconfigureerd. Voeg VITE_GEMINI_API_KEY toe als omgevingsvariabele in Vercel.');
  return new GoogleGenAI({ apiKey });
};

export async function estimateKwhUsage(profile: UserProfile): Promise<any> {
  const ai = getAI();
  const prompt = `
    Je bent een Nederlandse expert op het gebied van elektriciteitsverbruik. Schat op basis van het onderstaande huishoudprofiel het maandelijks kWh-verbruik en het tarief per kWh.

    INVOERGEGEVENS:
    - Maandelijkse kosten: €${profile.monthlyCost}
    - Grootte huishouden: ${profile.householdSize} personen
    - Type woning: ${profile.houseType}
    - Werkt thuis: ${profile.behaviors.workFromHome ? 'Ja' : 'Nee'}
    - Heeft warmtepomp: ${profile.behaviors.heatPump ? 'Ja' : 'Nee'}
    - Heeft stadsverwarming: ${profile.behaviors.districtHeating ? 'Ja' : 'Nee'}
    - Heeft zonnepanelen: ${profile.behaviors.solarPanels ? 'Ja' : 'Nee'}

    NEDERLANDSE STATISTIEKEN & LOGICA:
    - Appartement basis: 180-220 kWh/maand
    - Eengezinswoning basis: 250-300 kWh/maand
    - Thuiswerken: +40-60 kWh/maand
    - Warmtepomp: Voegt aanzienlijk toe (+150-300 kWh/maand)
    - Stadsverwarming: Verlaagt vaak elektriciteitsverbruik t.o.v. all-electric homes (geen eigen boiler/pomp nodig voor hoofdverwarming)
    - Zonnepanelen: Verlaagt het netto verbruik op de rekening (-100 tot -400 kWh/maand afhankelijk van installatie)

    TAAK:
    Schat het netto maandelijks kWh-verbruik voor deze gebruiker op basis van hun €${profile.monthlyCost} maandbedrag en deze factoren.
    Bereken vervolgens het tarief per kWh: Maandelijkse kosten ÷ Geschatte kWh.
    Geef je redenering in het NEDERLANDS.

    Retourneer ALLEEN geldige JSON.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          estimated_kwh_per_month: { type: Type.INTEGER },
          estimated_per_kwh_rate: { type: Type.NUMBER },
          confidence_level: { type: Type.STRING },
          assumptions: { type: Type.ARRAY, items: { type: Type.STRING } },
          reasoning: { type: Type.STRING }
        }
      }
    }
  });

  return JSON.parse(response.text || '{}');
}

export async function extractBillData(base64Image: string): Promise<BillExtraction> {
  const ai = getAI();
  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: {
      parts: [
        { inlineData: { data: base64Image.split(',')[1] || base64Image, mimeType: 'image/png' } },
        { text: "Extraheer gegevens van de Nederlandse elektriciteitsrekening. Retourneer JSON inclusief annual_kwh, monthly_kwh, annual_cost_eur, monthly_cost_eur, per_kwh_rate, contract_type, provider_name, extraction_confidence, warnings. De waarschuwingen moeten in het NEDERLANDS zijn." }
      ]
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          annual_kwh: { type: Type.NUMBER },
          monthly_kwh: { type: Type.NUMBER },
          annual_cost_eur: { type: Type.NUMBER },
          monthly_cost_eur: { type: Type.NUMBER },
          per_kwh_rate: { type: Type.NUMBER },
          contract_type: { type: Type.STRING },
          provider_name: { type: Type.STRING },
          extraction_confidence: { type: Type.STRING },
          warnings: { type: Type.ARRAY, items: { type: Type.STRING } }
        }
      }
    }
  });

  const raw = JSON.parse(response.text || '{}');
  return {
    annualKwh: raw.annual_kwh,
    monthlyKwh: raw.monthly_kwh,
    annualCostEur: raw.annual_cost_eur,
    monthlyCostEur: raw.monthly_cost_eur,
    perKwhRate: raw.per_kwh_rate,
    contractType: raw.contract_type || 'unknown',
    providerName: raw.provider_name,
    confidence: raw.extraction_confidence || 'low',
    warnings: raw.warnings || []
  };
}

export async function compareMarketPrices(profile: UserProfile): Promise<PriceCheckResult> {
  const ai = getAI();
  const userRate = profile.isVerified ? profile.verifiedPerKwhRate : profile.estimatedPerKwhRate;
  const userKwh = profile.isVerified ? profile.verifiedKwhPerMonth : profile.estimatedKwhPerMonth;

  // Determine whether switching costs apply:
  // Only for fixed-term (vast) contracts that haven't expired yet.
  // Variable and dynamic contracts have no switching costs (max 30-day notice).
  const hasSwitchingCosts = profile.currentContractType === 'fixed';

  // Step 1: Grounded Google Search for live Dutch energy prices + welcome bonuses
  let marketContext = '';
  try {
    const searchResponse = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: `Zoek de actuele kWh-tarieven voor elektriciteit van Nederlandse energieleveranciers (${new Date().toLocaleDateString('nl-NL')}). Geef tarieven per kWh voor zowel variabele als vaste contracten van leveranciers zoals Vattenfall, Essent, Eneco, Engie, Budget Energie, Greenchoice, Frank Energie, Tibber, Vandebron, Hollandsnieuwe, United Consumers, Pure Energie. Vermeld ook eventuele welkomsbonussen (eenmalige cashbonussen) die leveranciers momenteel aanbieden aan nieuwe klanten.`,
      config: {
        tools: [{ googleSearch: {} }],
      }
    });
    marketContext = searchResponse.text || '';
  } catch {
    // Fallback: realistic Dutch market prices if grounded search fails
    marketContext = `
      Huidige Nederlandse elektriciteitsprijzen (marktschatting):
      - Frank Energie: €0.27/kWh variabel, geen welkomsbonus
      - Tibber: €0.26/kWh dynamisch/variabel, geen welkomsbonus
      - Greenchoice: €0.32/kWh vast, welkomsbonus €75
      - Budget Energie: €0.31/kWh vast, welkomsbonus €50
      - Vattenfall: €0.34/kWh vast, welkomsbonus €100
      - Essent: €0.35/kWh vast, welkomsbonus €100
      - Eneco: €0.36/kWh vast, geen welkomsbonus
      - Engie: €0.33/kWh vast, welkomsbonus €60
    `;
  }

  // Step 2: Structured analysis — find top 2 and calculate savings
  const switchingCostRule = hasSwitchingCosts
    ? `De gebruiker heeft een VAST contract. Overstapkosten kunnen van toepassing zijn.
       Formule: (resterend verbruik tot contracteinde) × (huidig tarief - nieuw vergelijkbaar tarief).
       Gebruik een conservatieve schatting van €75 totale overstapkosten gespreid over 12 maanden (€6,25/maand) tenzij je betere data hebt.`
    : `De gebruiker heeft een VARIABEL of DYNAMISCH contract. Er zijn GEEN overstapkosten (maximale opzegtermijn 30 dagen). Houd hier GEEN rekening mee in de berekening.`;

  const prompt = `
    Je bent een Nederlandse energieprijzen expert. Gebruik de onderstaande live marktdata om de 2 voordeligste energieleveranciers te identificeren en te vergelijken met de gebruiker.

    LIVE MARKTDATA (incl. welkomsbonussen):
    ${marketContext}

    GEBRUIKERSPROFIEL:
    - Huidige leverancier: ${profile.currentProvider}
    - Huidig tarief: €${userRate?.toFixed(4)}/kWh
    - Contracttype: ${profile.currentContractType}
    - Maandverbruik: ${userKwh} kWh

    OVERSTAPKOSTEN REGEL:
    ${switchingCostRule}

    WELKOMSBONUS REGEL:
    Een welkomsbonus (eenmalig cash) verlaagt de effectieve kosten van het eerste jaar.
    Verdeel de welkomsbonus over 12 maanden voor de maandelijkse besparing (bonus ÷ 12).
    Een welkomsbonus die terugbetaald moet worden als je binnen 6 maanden opzegt telt mee, maar alleen voor klanten die minstens 6 maanden blijven.

    TAAK:
    1. Selecteer de 2 voordeligste leveranciers rekening houdend met kWh-tarief ÉN welkomsbonus
    2. Bereken maandelijkse netto besparing t.o.v. de gebruiker:
       (€${userRate?.toFixed(4)} - nieuw_tarief) × ${userKwh} kWh + (welkomsbonus ÷ 12) - eventuele overstapkosten/maand
    3. Geef SWITCH als netto besparing > €10/maand; anders STAY
    4. Reasoning in het NEDERLANDS, max 2 zinnen

    Retourneer ALLEEN geldige JSON.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          top2_providers: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                per_kwh_rate: { type: Type.NUMBER },
                contract_type: { type: Type.STRING },
                welkomsbonus: { type: Type.NUMBER }, // one-time EUR cash bonus, 0 if none
              }
            }
          },
          monthly_savings: { type: Type.NUMBER },
          recommendation: { type: Type.STRING },
          reasoning: { type: Type.STRING }
        }
      }
    }
  });

  const res = JSON.parse(response.text || '{}');

  const top2: MarketProvider[] = ((res.top2_providers as any[]) || []).slice(0, 2).map(p => ({
    name: p.name,
    perKwhRate: p.per_kwh_rate,
    contractType: (p.contract_type === 'variabel' || p.contract_type === 'variable' || p.contract_type === 'dynamisch')
      ? 'variable' : 'fixed',
    welkomsbonus: p.welkomsbonus || 0,
  }));

  return {
    checkedAt: new Date().toISOString(),
    userKwhRate: userRate || 0,
    userKwhPerMonth: userKwh || 0,
    top2,
    cheapestOverall: top2[0] ?? { name: '', perKwhRate: 0, contractType: 'fixed' },
    recommendation: res.recommendation === 'SWITCH' ? 'SWITCH' : 'STAY',
    monthlySavings: res.monthly_savings || 0,
    reasoning: res.reasoning || '',
  };
}
