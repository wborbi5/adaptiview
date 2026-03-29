/**
 * Clinical Trial Data — CROWN-7 (NSCLC EGFR Phase III)
 *
 * Static reference data for the demo. In production, this module is replaced
 * by live queries to Medidata Rave Web Services:
 *   - AE data:  GET /studies/{studyOID}/subjects/{subjectKey}/forms/AE
 *   - Lab data: parsed from CDISC ODM XML (LB domain)
 *   - SOC mapping: MedDRA v26.0 coded via Rave Coder integration
 *
 * Grade severity follows CTCAE v5.0 (see lib/constants.ts → CTCAE).
 * Hy's Law criteria per FDA DILI Guidance 2009 (see lib/constants.ts → HYS_LAW).
 */

export const SOC_DATA = [
  { soc: 'Gastrointestinal',   g1: 180, g2: 85,  g3: 51, g4: 12 },
  { soc: 'Dermatologic',       g1: 142, g2: 67,  g3: 32, g4: 3  },
  { soc: 'Hepatic',            g1: 89,  g2: 41,  g3: 29, g4: 8  },
  { soc: 'Fatigue/Asthenia',   g1: 160, g2: 72,  g3: 18, g4: 2  },
  { soc: 'Neurologic',         g1: 48,  g2: 22,  g3: 8,  g4: 1  },
  { soc: 'Cardiac',            g1: 31,  g2: 18,  g3: 11, g4: 5  },
  { soc: 'Hematologic',        g1: 97,  g2: 55,  g3: 24, g4: 6  },
];

export const HYS_LAW_POINTS = [
  { pt: 'AV-001-003', alt: 8.2, bili: 3.1, arm: 'Drug',    danger: true  },
  { pt: 'AV-001-019', alt: 4.1, bili: 2.4, arm: 'Drug',    danger: true  },
  { pt: 'AV-002-007', alt: 3.8, bili: 1.6, arm: 'Drug',    danger: false },
  { pt: 'AV-001-045', alt: 2.1, bili: 0.9, arm: 'Control', danger: false },
  { pt: 'AV-002-031', alt: 5.4, bili: 1.1, arm: 'Drug',    danger: false },
  { pt: 'AV-001-062', alt: 1.8, bili: 2.8, arm: 'Control', danger: false },
  { pt: 'AV-003-011', alt: 6.7, bili: 0.7, arm: 'Drug',    danger: false },
];

export const AE_TABLE = [
  { ae: 'Diarrhea',              soc: 'GI',      grade: 3, n: 51,  pct: '8.2%',  arm: 'Drug' },
  { ae: 'ALT Increased',         soc: 'Hepatic', grade: 3, n: 29,  pct: '4.7%',  arm: 'Drug' },
  { ae: 'Rash Maculopapular',    soc: 'Derm',    grade: 3, n: 32,  pct: '5.1%',  arm: 'Drug' },
  { ae: 'QTc Prolongation',      soc: 'Cardiac', grade: 3, n: 11,  pct: '1.8%',  arm: 'Drug' },
  { ae: 'Fatigue',               soc: 'General', grade: 2, n: 72,  pct: '11.5%', arm: 'Drug' },
  { ae: 'Nausea',                soc: 'GI',      grade: 2, n: 85,  pct: '13.6%', arm: 'Drug' },
  { ae: 'Peripheral Neuropathy', soc: 'Neuro',   grade: 2, n: 22,  pct: '3.5%',  arm: 'Drug' },
  { ae: 'Thrombocytopenia',      soc: 'Heme',    grade: 3, n: 18,  pct: '2.9%',  arm: 'Drug' },
  { ae: 'Diarrhea',              soc: 'GI',      grade: 2, n: 85,  pct: '13.6%', arm: 'Drug' },
  { ae: 'Rash',                  soc: 'Derm',    grade: 2, n: 67,  pct: '10.7%', arm: 'Drug' },
  { ae: 'AST Increased',         soc: 'Hepatic', grade: 2, n: 41,  pct: '6.6%',  arm: 'Drug' },
  { ae: 'Neutropenia',           soc: 'Heme',    grade: 3, n: 24,  pct: '3.8%',  arm: 'Drug' },
  { ae: 'Headache',              soc: 'Neuro',   grade: 1, n: 48,  pct: '7.7%',  arm: 'Drug' },
  { ae: 'Hypertension',          soc: 'Cardiac', grade: 2, n: 18,  pct: '2.9%',  arm: 'Drug' },
  { ae: 'Anemia',                soc: 'Heme',    grade: 2, n: 55,  pct: '8.8%',  arm: 'Drug' },
];

export const AE_NARRATIVE = `The CROWN-7 experimental arm demonstrated a 31% rate of Grade 3+ treatment-related adverse events (TRAEs), compared to 18% in the standard-of-care control arm (Risk Difference +13 percentage points; 95% CI 8.4\u201317.6).

Two patients meet Hy\u2019s Law criteria \u2014 concurrent ALT >3\u00d7ULN and total bilirubin >2\u00d7ULN \u2014 representing a potential hepatotoxicity signal requiring medical monitor review. Patient AV-001-003 shows ALT 8.2\u00d7ULN (peak) with bilirubin 3.1\u00d7ULN; Patient AV-001-019 shows ALT 4.1\u00d7ULN with bilirubin 2.4\u00d7ULN. Both patients remain on-study with active hepatic monitoring per protocol amendment v3.2.

The most common Grade 3+ events were diarrhea (8.2%), rash (5.1%), and elevated ALT (4.7%). Treatment discontinuation due to AEs occurred in 12% of the experimental arm versus 7% of control. There were no unexpected safety signals relative to the known drug class profile.`;

export const AE_SIGNALS_NARRATIVE = `Two patients currently meet Hy\u2019s Law criteria (ALT >3\u00d7ULN with concurrent bilirubin >2\u00d7ULN without cholestasis), triggering a hepatotoxicity signal under the DILI framework.

Patient AV-001-003 (Site 04): ALT peaked at 8.2\u00d7ULN on Study Day 84 with total bilirubin 3.1\u00d7ULN. Alkaline phosphatase remained within normal limits, ruling out cholestatic etiology. Drug was temporarily held; ALT trending downward at last assessment (5.1\u00d7ULN).

Patient AV-001-019 (Site 12): ALT 4.1\u00d7ULN with bilirubin 2.4\u00d7ULN on Study Day 112. Currently under hepatology consultation. No prior liver disease history.

Additionally, QTc prolongation >450ms was observed in 8 patients (1.3% of arm), with one patient reaching 487ms \u2014 approaching the 500ms threshold for treatment hold per protocol.`;

export const STUDY_LIST = [
  {
    id: 'crown-7',
    nct: 'NCT04567832',
    phase: 'Phase III',
    title: 'CROWN-7',
    subtitle: 'NSCLC EGFR',
    status: 'active' as const,
    flagged: true,
    sites: 47,
    enrolled: 624,
    target: 800,
    dbl: '15-Jun-2026',
    lastSync: '3m ago',
    aeTrend: [12, 18, 15, 22, 19, 24, 21],
  },
  {
    id: 'beacon-5',
    nct: 'NCT04891023',
    phase: 'Phase II',
    title: 'BEACON-5',
    subtitle: 'Breast/GI Basket',
    status: 'active' as const,
    flagged: false,
    sites: 23,
    enrolled: 312,
    target: 400,
    dbl: '30-Aug-2026',
    lastSync: '12m ago',
    aeTrend: [8, 10, 9, 11, 10, 12, 11],
  },
  {
    id: 'delta-2',
    nct: 'NCT05123456',
    phase: 'Phase I',
    title: 'DELTA-2',
    subtitle: 'First-in-Human',
    status: 'onhold' as const,
    flagged: false,
    sites: 4,
    enrolled: 18,
    target: 48,
    dbl: 'TBD',
    lastSync: '2d ago',
    aeTrend: [3, 2, 4, 3, 5, 4, 3],
  },
  {
    id: 'apex-9',
    nct: 'NCT04234789',
    phase: 'Phase III',
    title: 'APEX-9',
    subtitle: 'Melanoma IO',
    status: 'active' as const,
    flagged: false,
    sites: 62,
    enrolled: 891,
    target: 1000,
    dbl: '01-Dec-2026',
    lastSync: '8m ago',
    aeTrend: [15, 14, 16, 18, 17, 19, 16],
  },
  {
    id: 'meridian-3',
    nct: 'NCT05678901',
    phase: 'Phase II',
    title: 'MERIDIAN-3',
    subtitle: 'Renal Cell',
    status: 'active' as const,
    flagged: false,
    sites: 31,
    enrolled: 205,
    target: 350,
    dbl: '15-Oct-2026',
    lastSync: '25m ago',
    aeTrend: [6, 8, 7, 9, 8, 10, 9],
  },
];

export const GRADE_COLORS: Record<number, string> = {
  1: '#0FC9A0',
  2: '#F59E0B',
  3: '#EA580C',
  4: '#E03C3C',
  5: '#7F1D1D',
};

export const GRADE_CLASSES: Record<number, string> = {
  1: 'grade-1',
  2: 'grade-2',
  3: 'grade-3',
  4: 'grade-4',
  5: 'grade-5',
};
