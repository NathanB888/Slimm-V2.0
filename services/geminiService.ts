
import { GoogleGenAI, Type } from "@google/genai";
import { UserProfile, ComparisonResult, BillExtraction, MarketProvider, PriceCheckResult } from "../types";

const getAI = () => new GoogleGenAI({ apiKey: process.env.API_KEY });

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

  // Step 1: Grounded Google Search for live Dutch energy prices
  let marketContext = '';
  try {
    const searchResponse = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: `Zoek de actuele kWh-tarieven voor elektriciteit van Nederlandse energieleveranciers (${new Date().toLocaleDateString('nl-NL')}). Geef tarieven per kWh voor zowel variabele als vaste contracten van leveranciers zoals Vattenfall, Essent, Eneco, Engie, Budget Energie, Greenchoice, Frank Energie, Tibber, Vandebron, Hollandsnieuwe, United Consumers, Pure Energie. Vermeld voor elke leverancier de naam, het tarief per kWh en het contracttype.`,
      config: {
        tools: [{ googleSearch: {} }],
      }
    });
    marketContext = searchResponse.text || '';
  } catch {
    // Fallback: realistic Dutch market prices if grounded search fails
    marketContext = `
      Huidige Nederlandse elektriciteitsprijzen (marktschatting):
      - Frank Energie: €0.27/kWh variabel
      - Tibber: €0.26/kWh dynamisch/variabel
      - Greenchoice: €0.32/kWh vast
      - Budget Energie: €0.31/kWh vast
      - Vattenfall: €0.34/kWh vast
      - Essent: €0.35/kWh vast
      - Eneco: €0.36/kWh vast
      - Engie: €0.33/kWh vast
    `;
  }

  // Step 2: Structured analysis — find top 2 and calculate savings
  const prompt = `
    Je bent een Nederlandse energieprijzen expert. Gebruik de onderstaande live marktdata om de 2 goedkoopste energieleveranciers te identificeren en te vergelijken met de gebruiker.

    LIVE MARKTDATA:
    ${marketContext}

    GEBRUIKERSPROFIEL:
    - Huidige leverancier: ${profile.currentProvider}
    - Huidig tarief: €${userRate?.toFixed(4)}/kWh
    - Contracttype: ${profile.currentContractType}
    - Maandverbruik: ${userKwh} kWh

    TAAK:
    1. Selecteer de 2 goedkoopste leveranciers uit de marktdata (zowel variabele als vaste contracten mogen voorkomen)
    2. Bereken maandelijkse besparing: (€${userRate?.toFixed(4)} - goedkoopste_tarief) × ${userKwh} kWh
    3. Geef SWITCH als netto besparing (na €75 overstapkosten gespreid over 12 maanden) > €10/maand; anders STAY
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
