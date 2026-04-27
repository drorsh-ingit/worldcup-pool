/**
 * football-data.org integer team IDs keyed by our short team code.
 * Single source of truth — imported by both the server-side fetcher
 * and the client-side team badge component.
 */
export const FD_CLUB_IDS: Record<string, number> = {
  MCI: 65,    RMA: 86,    BAY: 5,     PSG: 524,   LIV: 64,    BAR: 81,
  ARS: 57,    INT: 108,   CHE: 61,    B04: 3,     ATM: 78,    JUV: 109,
  BVB: 4,     MIL: 98,    ATA: 102,   NAP: 113,   TOT: 73,    SLB: 1903,
  OM:  516,   SCP: 498,   SGE: 19,    CLB: 851,   VIL: 94,    PSV: 674,
  ASM: 548,   GAL: 610,   LIL: 521,   AJX: 678,   SHK: 1064,  USG: 3929,
  YB:  385,   FCK: 1876,  RSB: 3549,  SLP: 930,   BOD: 5721,  OLY: 654,
  AVL: 58,    FEY: 675,   RBL: 721,   CEL: 732,   GNK: 755,
  // Real UCL 2025-26 participants we previously missed
  NEW: 67,    // Newcastle United
  ATH: 77,    // Athletic Bilbao
  QAR: 611,   // Qarabağ Ağdam FK
  PAF: 11034, // Paphos FC
  KAI: 10601, // FK Kairat Almaty
};
