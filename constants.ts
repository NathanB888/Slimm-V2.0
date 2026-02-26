
// Feature flags — set to true to re-enable
export const FEATURE_VERBRUIK_VALIDEREN = false;

export const ENERGY_PROVIDERS = [
  'Essent',
  'Engie',
  'Vattenfall',
  'Eneco',
  'Nuon',
  'Zonneplan',
  'GreenChoice',
  'BudgetEnergie',
  'United Consumers',
  'Pure Energie',
  'Gewoon Energie',
  'Anders'
];

export const HOUSE_TYPES_LABELS: Record<string, string> = {
  apartment: 'Appartement',
  townhouse: 'Rijtjeshuis',
  single_family: 'Vrijstaande woning',
  other: 'Anders'
};

export const HOUSEHOLD_SIZE_LABELS: Record<string, string> = {
  '1': '1 persoon',
  '2': '2 personen',
  '3-4': '3-4 personen',
  '5+': '5 of meer personen'
};

export const CONTRACT_TYPE_LABELS: Record<string, string> = {
  fixed: 'Vast',
  flexible: 'Variabel',
  dynamic: 'Dynamisch',
  unknown: 'Onbekend'
};

export const DUTCH_BASELINES = {
  apartment: [180, 220],
  singleFamily: [250, 300],
  wfhAdd: [40, 60],
  heatingAdd: [100, 200],
  hotWaterAdd: [50, 80],
  electricCarAdd: [100, 150],
  avgRate: 0.45
};

export const ZIPCODE_REGEX = /^\d{4}[A-Z]{2}$/;
