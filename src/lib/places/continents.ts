// Deterministic ISO 3166-1 alpha-2 country code to continent code mapping.
// Used to derive Place.continentCode from a provider-verified country code, and
// later to aggregate statistics by continent. It is a static, reviewed table:
// no heuristic, no runtime lookup, no external service. Unknown or missing codes
// return null so callers never fabricate a continent.
//
// Continent codes: AF Africa, AN Antarctica, AS Asia, EU Europe,
// NA North America, OC Oceania, SA South America.
// Transcontinental countries are assigned their commonly used single continent
// (for example TR and the Caucasus/Arabian-peninsula states map to AS).

export type ContinentCode = "AF" | "AN" | "AS" | "EU" | "NA" | "OC" | "SA";

const COUNTRY_TO_CONTINENT: Readonly<Record<string, ContinentCode>> = {
  // Africa
  AO: "AF", BF: "AF", BI: "AF", BJ: "AF", BW: "AF", CD: "AF", CF: "AF", CG: "AF",
  CI: "AF", CM: "AF", CV: "AF", DJ: "AF", DZ: "AF", EG: "AF", EH: "AF", ER: "AF",
  ET: "AF", GA: "AF", GH: "AF", GM: "AF", GN: "AF", GQ: "AF", GW: "AF", KE: "AF",
  KM: "AF", LR: "AF", LS: "AF", LY: "AF", MA: "AF", MG: "AF", ML: "AF", MR: "AF",
  MU: "AF", MW: "AF", MZ: "AF", NA: "AF", NE: "AF", NG: "AF", RW: "AF", SC: "AF",
  SD: "AF", SL: "AF", SN: "AF", SO: "AF", SS: "AF", ST: "AF", SZ: "AF", TD: "AF",
  TG: "AF", TN: "AF", TZ: "AF", UG: "AF", YT: "AF", ZA: "AF", ZM: "AF", ZW: "AF",
  RE: "AF",

  // Antarctica
  AQ: "AN", BV: "AN", GS: "AN", HM: "AN", TF: "AN",

  // Asia
  AE: "AS", AF: "AS", AM: "AS", AZ: "AS", BD: "AS", BH: "AS", BN: "AS", BT: "AS",
  CN: "AS", GE: "AS", HK: "AS", ID: "AS", IL: "AS", IN: "AS", IQ: "AS", IR: "AS",
  JO: "AS", JP: "AS", KG: "AS", KH: "AS", KP: "AS", KR: "AS", KW: "AS", KZ: "AS",
  LA: "AS", LB: "AS", LK: "AS", MM: "AS", MN: "AS", MO: "AS", MV: "AS", MY: "AS",
  NP: "AS", OM: "AS", PH: "AS", PK: "AS", PS: "AS", QA: "AS", SA: "AS", SG: "AS",
  SY: "AS", TH: "AS", TJ: "AS", TL: "AS", TM: "AS", TR: "AS", TW: "AS", UZ: "AS",
  VN: "AS", YE: "AS",

  // Europe
  AD: "EU", AL: "EU", AT: "EU", AX: "EU", BA: "EU", BE: "EU", BG: "EU", BY: "EU",
  CH: "EU", CY: "EU", CZ: "EU", DE: "EU", DK: "EU", EE: "EU", ES: "EU", FI: "EU",
  FO: "EU", FR: "EU", GB: "EU", GG: "EU", GI: "EU", GR: "EU", HR: "EU", HU: "EU",
  IE: "EU", IM: "EU", IS: "EU", IT: "EU", JE: "EU", LI: "EU", LT: "EU", LU: "EU",
  LV: "EU", MC: "EU", MD: "EU", ME: "EU", MK: "EU", MT: "EU", NL: "EU", NO: "EU",
  PL: "EU", PT: "EU", RO: "EU", RS: "EU", RU: "EU", SE: "EU", SI: "EU", SK: "EU",
  SM: "EU", UA: "EU", VA: "EU", XK: "EU",

  // North America
  AG: "NA", AI: "NA", AW: "NA", BB: "NA", BL: "NA", BM: "NA", BS: "NA", BZ: "NA",
  CA: "NA", CR: "NA", CU: "NA", CW: "NA", DM: "NA", DO: "NA", GD: "NA", GL: "NA",
  GP: "NA", GT: "NA", HN: "NA", HT: "NA", JM: "NA", KN: "NA", KY: "NA", LC: "NA",
  MF: "NA", MQ: "NA", MS: "NA", MX: "NA", NI: "NA", PA: "NA", PM: "NA", PR: "NA",
  SV: "NA", SX: "NA", TC: "NA", TT: "NA", US: "NA", VC: "NA", VG: "NA", VI: "NA",

  // Oceania
  AS: "OC", AU: "OC", CK: "OC", FJ: "OC", FM: "OC", GU: "OC", KI: "OC", MH: "OC",
  MP: "OC", NC: "OC", NF: "OC", NR: "OC", NU: "OC", NZ: "OC", PF: "OC", PG: "OC",
  PW: "OC", SB: "OC", TK: "OC", TO: "OC", TV: "OC", VU: "OC", WF: "OC", WS: "OC",

  // South America
  AR: "SA", BO: "SA", BR: "SA", CL: "SA", CO: "SA", EC: "SA", FK: "SA", GF: "SA",
  GY: "SA", PE: "SA", PY: "SA", SR: "SA", UY: "SA", VE: "SA",
};

export function continentCodeForCountry(countryCode: string | null | undefined): ContinentCode | null {
  if (!countryCode) return null;
  const key = countryCode.trim().toUpperCase();
  return COUNTRY_TO_CONTINENT[key] ?? null;
}
