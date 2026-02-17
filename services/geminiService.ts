
import { GoogleGenAI, Type } from "@google/genai";
import { UserProfile, ComparisonResult, BillExtraction } from "../types";

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

export async function compareMarketPrices(profile: UserProfile): Promise<ComparisonResult> {
  const ai = getAI();
  
  const marketPrices = [
    { provider: "Essent", monthly_cost: profile.monthlyCost * 0.9, per_kwh_rate: 0.41, contract_type: "fixed" },
    { provider: "Engie", monthly_cost: profile.monthlyCost * 0.85, per_kwh_rate: 0.38, contract_type: "fixed" },
    { provider: "Vattenfall", monthly_cost: profile.monthlyCost * 1.1, per_kwh_rate: 0.49, contract_type: "flexible" },
    { provider: "BudgetEnergie", monthly_cost: profile.monthlyCost * 0.95, per_kwh_rate: 0.43, contract_type: "fixed" }
  ];

  const prompt = `
    Vergelijk dit energiecontract van de gebruiker met markopties.
    GEBRUIKER: ${JSON.stringify({
      provider: profile.currentProvider,
      cost: profile.monthlyCost,
      kwh: profile.isVerified ? profile.verifiedKwhPerMonth : profile.estimatedKwhPerMonth,
      rate: profile.isVerified ? profile.verifiedPerKwhRate : profile.estimatedPerKwhRate
    })}
    MARKT: ${JSON.stringify(marketPrices)}
    
    REGELS:
    - Adviseer alleen als besparing > €10/maand is.
    - Geef de voorkeur aan hetzelfde contracttype.
    - Houd rekening met €50 overstapkosten.
    - Je antwoord (reasoning) moet in het NEDERLANDS zijn.
    
    Retourneer JSON met: cheapest_provider, cheapest_monthly_cost, savings_eur, recommendation (SWITCH|STAY|CONSIDER), reasoning.
  `;

  const response = await ai.models.generateContent({
    model: 'gemini-3-flash-preview',
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          cheapest_provider: { type: Type.STRING },
          cheapest_monthly_cost: { type: Type.NUMBER },
          savings_eur: { type: Type.NUMBER },
          recommendation: { type: Type.STRING },
          reasoning: { type: Type.STRING }
        }
      }
    }
  });

  const res = JSON.parse(response.text || '{}');
  return {
    cheapestProvider: res.cheapest_provider,
    cheapestMonthlyCost: res.cheapest_monthly_cost,
    savingsEur: res.savings_eur,
    recommendation: res.recommendation,
    reasoning: res.reasoning
  };
}
