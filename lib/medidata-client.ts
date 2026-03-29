/**
 * Medidata Rave REST API Client
 *
 * Simulates the Medidata Rave Web Services integration layer.
 * In production, this module:
 *   - Authenticates via OAuth2 client credentials flow against Medidata Identity
 *   - Fetches study metadata:  GET /RaveWebServices/studies
 *   - Fetches AE CRF data:     GET /RaveWebServices/studies/{studyOID}/datasets/AE
 *   - Parses CDISC ODM XML responses into typed domain objects
 *   - Caches responses with ETags for incremental sync
 *
 * All network delays below simulate real-world latency for demo purposes.
 */

export interface MedidataStudy {
  studyOid: string;
  studyName: string;
  nctNumber: string;
  phase: string;
  status: 'ACTIVE' | 'ON_HOLD' | 'COMPLETED';
  holdReason?: string;
  dataLockDate: string;
  lastSyncedAt: string;
  sites: number;
  enrolled: number;
  target: number;
  hasSafetyFlag: boolean;
}

export interface MedidataAEResponse {
  studyOid: string;
  dataAsOf: string;
  subjectCount: number;
  armBreakdown: { drug: number; control: number };
  socSummary: { socCode: string; socName: string; g1: number; g2: number; g3: number; g4: number }[];
  hysLawCases: { subjectId: string; altXuln: number; biliXuln: number; arm: string; danger: boolean; siteId: string }[];
  aeTable: { ae: string; socCode: string; grade: number; n: number; pct: string; arm: string }[];
  narrative: string;
  efficacy: {
    primaryEndpoint: string;
    mPFS_drug: string;
    mPFS_control: string;
    hazardRatio: number;
    hrCI: string;
    pValue: string;
    orr_drug: string;
    orr_control: string;
  };
}

const MEDIDATA_STUDIES: MedidataStudy[] = [
  {
    studyOid: 'CROWN-7',
    studyName: 'CROWN-7: NSCLC EGFR Phase III',
    nctNumber: 'NCT04567832',
    phase: 'Phase III',
    status: 'ACTIVE',
    dataLockDate: '15-Jun-2026',
    lastSyncedAt: new Date().toISOString(),
    sites: 47,
    enrolled: 624,
    target: 800,
    hasSafetyFlag: true,
  },
  {
    studyOid: 'BEACON-5',
    studyName: 'BEACON-5: Breast/GI Basket Phase II',
    nctNumber: 'NCT04891023',
    phase: 'Phase II',
    status: 'ACTIVE',
    dataLockDate: '30-Aug-2026',
    lastSyncedAt: new Date().toISOString(),
    sites: 23,
    enrolled: 312,
    target: 400,
    hasSafetyFlag: false,
  },
  {
    studyOid: 'DELTA-2',
    studyName: 'DELTA-2: First-in-Human Phase I',
    nctNumber: 'NCT05123456',
    phase: 'Phase I',
    status: 'ON_HOLD',
    holdReason: 'Protocol amendment v3.2 pending IRB approval',
    dataLockDate: '15-Dec-2026',
    lastSyncedAt: new Date().toISOString(),
    sites: 8,
    enrolled: 34,
    target: 60,
    hasSafetyFlag: false,
  },
];

const CROWN7_AE_DATA: MedidataAEResponse = {
  studyOid: 'CROWN-7',
  dataAsOf: '15-Mar-2026',
  subjectCount: 1247,
  armBreakdown: { drug: 624, control: 623 },
  socSummary: [
    { socCode: 'GI',      socName: 'Gastrointestinal', g1: 180, g2: 85,  g3: 51, g4: 12 },
    { socCode: 'DERM',    socName: 'Dermatologic',     g1: 142, g2: 67,  g3: 32, g4: 3  },
    { socCode: 'HEP',     socName: 'Hepatic',          g1: 89,  g2: 41,  g3: 29, g4: 8  },
    { socCode: 'FATIGUE', socName: 'Fatigue/Asthenia', g1: 160, g2: 72,  g3: 18, g4: 2  },
    { socCode: 'NEURO',   socName: 'Neurologic',       g1: 48,  g2: 22,  g3: 8,  g4: 1  },
    { socCode: 'CARD',    socName: 'Cardiac',          g1: 31,  g2: 18,  g3: 11, g4: 5  },
    { socCode: 'HEME',    socName: 'Hematologic',      g1: 97,  g2: 55,  g3: 24, g4: 6  },
  ],
  hysLawCases: [
    { subjectId: 'AV-001-003', altXuln: 8.2, biliXuln: 3.1, arm: 'Drug',    danger: true,  siteId: '04' },
    { subjectId: 'AV-001-019', altXuln: 4.1, biliXuln: 2.4, arm: 'Drug',    danger: true,  siteId: '04' },
    { subjectId: 'AV-002-007', altXuln: 3.8, biliXuln: 1.6, arm: 'Drug',    danger: false, siteId: '12' },
    { subjectId: 'AV-001-045', altXuln: 2.1, biliXuln: 0.9, arm: 'Control', danger: false, siteId: '07' },
    { subjectId: 'AV-002-031', altXuln: 5.4, biliXuln: 1.1, arm: 'Drug',    danger: false, siteId: '12' },
    { subjectId: 'AV-001-062', altXuln: 1.8, biliXuln: 2.8, arm: 'Control', danger: false, siteId: '03' },
    { subjectId: 'AV-003-011', altXuln: 6.7, biliXuln: 0.7, arm: 'Drug',    danger: false, siteId: '09' },
  ],
  aeTable: [
    { ae: 'Diarrhea',              socCode: 'GI',      grade: 3, n: 51, pct: '8.2%',  arm: 'Drug' },
    { ae: 'ALT Increased',         socCode: 'HEP',     grade: 3, n: 29, pct: '4.7%',  arm: 'Drug' },
    { ae: 'Rash Maculopapular',    socCode: 'DERM',    grade: 3, n: 32, pct: '5.1%',  arm: 'Drug' },
    { ae: 'QTc Prolongation',      socCode: 'CARD',    grade: 3, n: 11, pct: '1.8%',  arm: 'Drug' },
    { ae: 'Fatigue',               socCode: 'FATIGUE', grade: 2, n: 72, pct: '11.5%', arm: 'Drug' },
    { ae: 'Nausea',                socCode: 'GI',      grade: 2, n: 85, pct: '13.6%', arm: 'Drug' },
    { ae: 'Peripheral Neuropathy', socCode: 'NEURO',   grade: 2, n: 22, pct: '3.5%',  arm: 'Drug' },
    { ae: 'Thrombocytopenia',      socCode: 'HEME',    grade: 3, n: 18, pct: '2.9%',  arm: 'Drug' },
  ],
  narrative: `The CROWN-7 experimental arm demonstrated a 31% rate of Grade 3+ treatment-related adverse events (TRAEs), compared to 18% in the standard-of-care control arm (Risk Difference +13 percentage points; 95% CI 8.4\u201317.6).

Two patients meet Hy\u2019s Law criteria \u2014 concurrent ALT >3\u00d7ULN and total bilirubin >2\u00d7ULN \u2014 representing a potential hepatotoxicity signal requiring medical monitor review. Patient AV-001-003 shows ALT 8.2\u00d7ULN (peak) with bilirubin 3.1\u00d7ULN; Patient AV-001-019 shows ALT 4.1\u00d7ULN with bilirubin 2.4\u00d7ULN. Both patients remain on-study with active hepatic monitoring per protocol amendment v3.2.

The most common Grade 3+ events were diarrhea (8.2%), rash (5.1%), and elevated ALT (4.7%). Treatment discontinuation due to AEs occurred in 12% of the experimental arm versus 7% of control.`,
  efficacy: {
    primaryEndpoint: 'mPFS',
    mPFS_drug: '18.9 mo',
    mPFS_control: '9.2 mo',
    hazardRatio: 0.43,
    hrCI: '(0.35\u20130.54)',
    pValue: 'p<0.0001',
    orr_drug: '74%',
    orr_control: '31%',
  },
};

function simulateNetworkDelay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function getMedidataStudies(): Promise<MedidataStudy[]> {
  await simulateNetworkDelay(280);
  return MEDIDATA_STUDIES;
}

export async function getMedidataAEData(studyOid: string): Promise<MedidataAEResponse> {
  await simulateNetworkDelay(420);
  if (studyOid.toUpperCase() === 'CROWN-7') return CROWN7_AE_DATA;
  throw new Error(`Study ${studyOid} not found in Medidata mock`);
}
