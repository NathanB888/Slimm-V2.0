
export type HouseholdSize = '1' | '2' | '3-4' | '5+';
export type HouseType = 'apartment' | 'townhouse' | 'single_family' | 'other';
export type ContractType = 'fixed' | 'flexible' | 'dynamic' | 'unknown';
export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface UserProfile {
  email: string;
  zipcode: string;
  houseNumber: string;
  householdSize: HouseholdSize;
  houseType: HouseType;
  currentProvider: string;
  currentContractType: ContractType;
  monthlyCost: number;
  behaviors: {
    workFromHome: boolean;
    heatPump: boolean;
    districtHeating: boolean;
    solarPanels: boolean;
  };
  motivation?: string;
  
  // AI Estimates
  estimatedKwhPerMonth?: number;
  estimatedPerKwhRate?: number;
  estimateConfidence?: ConfidenceLevel;
  
  // Verified Data
  isVerified: boolean;
  verifiedKwhPerMonth?: number;
  verifiedPerKwhRate?: number;
  verifiedProvider?: string;
  verifiedContractType?: ContractType;
}

export interface ComparisonResult {
  cheapestProvider: string;
  cheapestMonthlyCost: number;
  savingsEur: number;
  recommendation: 'SWITCH' | 'STAY' | 'CONSIDER';
  reasoning: string;
}

export interface BillExtraction {
  annualKwh: number | null;
  monthlyKwh: number | null;
  annualCostEur: number | null;
  monthlyCostEur: number | null;
  perKwhRate: number | null;
  contractType: ContractType;
  providerName: string | null;
  confidence: ConfidenceLevel;
  warnings: string[];
}
