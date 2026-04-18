/**
 * FIFA 3-letter team code → ISO 3166-1 alpha-2 country code mapping.
 * Used to look up flag SVGs from country-flag-icons.
 *
 * Two codes (ENG, SCO) don't map to ISO countries — they're rendered
 * with inline custom SVGs in the Flag component.
 */
export const FIFA_TO_ISO: Record<string, string> = {
  // Group A
  MEX: "MX",
  RSA: "ZA",
  KOR: "KR",
  CZE: "CZ",
  // Group B
  CAN: "CA",
  BIH: "BA",
  QAT: "QA",
  SUI: "CH",
  // Group C
  BRA: "BR",
  HAI: "HT",
  MAR: "MA",
  // SCO — custom
  // Group D
  AUS: "AU",
  PAR: "PY",
  TUR: "TR",
  USA: "US",
  // Group E
  GER: "DE",
  CUR: "CW",
  CIV: "CI",
  ECU: "EC",
  // Group F
  NED: "NL",
  JPN: "JP",
  SWE: "SE",
  TUN: "TN",
  // Group G
  BEL: "BE",
  EGY: "EG",
  IRN: "IR",
  NZL: "NZ",
  // Group H
  ESP: "ES",
  CPV: "CV",
  KSA: "SA",
  URU: "UY",
  // Group I
  FRA: "FR",
  SEN: "SN",
  IRQ: "IQ",
  NOR: "NO",
  // Group J
  ARG: "AR",
  ALG: "DZ",
  AUT: "AT",
  JOR: "JO",
  // Group K
  POR: "PT",
  COD: "CD",
  UZB: "UZ",
  COL: "CO",
  // Group L
  // ENG — custom
  CRO: "HR",
  GHA: "GH",
  PAN: "PA",
};
