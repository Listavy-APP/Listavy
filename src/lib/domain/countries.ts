/**
 * Complete list of calling codes (ITU-T E.164), one entry per code. Every country can sign up:
 * the picker offers all codes, so no country is blocked.
 * Codes are digits only; the stored phone is E.164 ("+" + code + number, 8 to 15 digits in total).
 *
 * digits: [min, max] local digits (after the code, no trunk 0). Set only where the count is
 *   already known and in use. All other codes use the fallback range (see digitRange).
 * placeholder: example shown in the number field. Generic where the local format is not known.
 * Shared codes are one entry; the label lists the territories that use it.
 */
export type PhoneCountry = {
  code: string;
  label: string;
  digits?: readonly [number, number];
  placeholder: string;
};

const G = "Número sin código de país";

export const PHONE_COUNTRIES: readonly PhoneCountry[] = [
  { code: "93", label: "+93 Afganistán", placeholder: G },
  { code: "355", label: "+355 Albania", placeholder: G },
  { code: "213", label: "+213 Argelia", placeholder: G },
  { code: "376", label: "+376 Andorra", placeholder: G },
  { code: "244", label: "+244 Angola", placeholder: G },
  { code: "1", label: "+1 República Dominicana / EE. UU. / Canadá / Puerto Rico y otros", digits: [10, 10], placeholder: "809 555 1234" },
  { code: "54", label: "+54 Argentina", placeholder: G },
  { code: "374", label: "+374 Armenia", placeholder: G },
  { code: "297", label: "+297 Aruba", placeholder: G },
  { code: "61", label: "+61 Australia / Islas Cocos y Navidad", placeholder: G },
  { code: "43", label: "+43 Austria", placeholder: G },
  { code: "994", label: "+994 Azerbaiyán", placeholder: G },
  { code: "973", label: "+973 Baréin", placeholder: G },
  { code: "880", label: "+880 Bangladés", placeholder: G },
  { code: "375", label: "+375 Bielorrusia", placeholder: G },
  { code: "32", label: "+32 Bélgica", placeholder: G },
  { code: "501", label: "+501 Belice", placeholder: G },
  { code: "229", label: "+229 Benín", placeholder: G },
  { code: "975", label: "+975 Bután", placeholder: G },
  { code: "591", label: "+591 Bolivia", placeholder: G },
  { code: "387", label: "+387 Bosnia y Herzegovina", placeholder: G },
  { code: "267", label: "+267 Botsuana", placeholder: G },
  { code: "55", label: "+55 Brasil", placeholder: G },
  { code: "673", label: "+673 Brunéi", placeholder: G },
  { code: "359", label: "+359 Bulgaria", placeholder: G },
  { code: "226", label: "+226 Burkina Faso", placeholder: G },
  { code: "257", label: "+257 Burundi", placeholder: G },
  { code: "238", label: "+238 Cabo Verde", placeholder: G },
  { code: "855", label: "+855 Camboya", placeholder: G },
  { code: "237", label: "+237 Camerún", placeholder: G },
  { code: "235", label: "+235 Chad", placeholder: G },
  { code: "56", label: "+56 Chile", placeholder: G },
  { code: "86", label: "+86 China", placeholder: G },
  { code: "357", label: "+357 Chipre", placeholder: G },
  { code: "57", label: "+57 Colombia", digits: [10, 10], placeholder: "300 123 4567" },
  { code: "269", label: "+269 Comoras", placeholder: G },
  { code: "242", label: "+242 Congo", placeholder: G },
  { code: "243", label: "+243 Congo (República Democrática)", placeholder: G },
  { code: "850", label: "+850 Corea del Norte", placeholder: G },
  { code: "82", label: "+82 Corea del Sur", placeholder: G },
  { code: "225", label: "+225 Costa de Marfil", placeholder: G },
  { code: "506", label: "+506 Costa Rica", placeholder: G },
  { code: "385", label: "+385 Croacia", placeholder: G },
  { code: "53", label: "+53 Cuba", placeholder: G },
  { code: "599", label: "+599 Curazao / Bonaire", placeholder: G },
  { code: "45", label: "+45 Dinamarca", placeholder: G },
  { code: "253", label: "+253 Yibuti", placeholder: G },
  { code: "593", label: "+593 Ecuador", placeholder: G },
  { code: "20", label: "+20 Egipto", placeholder: G },
  { code: "503", label: "+503 El Salvador", digits: [8, 8], placeholder: "7012 3456" },
  { code: "971", label: "+971 Emiratos Árabes Unidos", placeholder: G },
  { code: "291", label: "+291 Eritrea", placeholder: G },
  { code: "421", label: "+421 Eslovaquia", placeholder: G },
  { code: "386", label: "+386 Eslovenia", placeholder: G },
  { code: "34", label: "+34 España", digits: [9, 9], placeholder: "600 123 456" },
  { code: "372", label: "+372 Estonia", placeholder: G },
  { code: "268", label: "+268 Esuatini", placeholder: G },
  { code: "251", label: "+251 Etiopía", placeholder: G },
  { code: "63", label: "+63 Filipinas", placeholder: G },
  { code: "358", label: "+358 Finlandia", placeholder: G },
  { code: "679", label: "+679 Fiyi", placeholder: G },
  { code: "33", label: "+33 Francia", digits: [9, 9], placeholder: "6 12 34 56 78" },
  { code: "241", label: "+241 Gabón", placeholder: G },
  { code: "220", label: "+220 Gambia", placeholder: G },
  { code: "995", label: "+995 Georgia", placeholder: G },
  { code: "233", label: "+233 Ghana", placeholder: G },
  { code: "350", label: "+350 Gibraltar", placeholder: G },
  { code: "30", label: "+30 Grecia", placeholder: G },
  { code: "299", label: "+299 Groenlandia", placeholder: G },
  { code: "502", label: "+502 Guatemala", placeholder: G },
  { code: "590", label: "+590 Guadalupe / San Martín / San Bartolomé", placeholder: G },
  { code: "594", label: "+594 Guayana Francesa", placeholder: G },
  { code: "224", label: "+224 Guinea", placeholder: G },
  { code: "240", label: "+240 Guinea Ecuatorial", placeholder: G },
  { code: "245", label: "+245 Guinea-Bisáu", placeholder: G },
  { code: "592", label: "+592 Guyana", placeholder: G },
  { code: "509", label: "+509 Haití", placeholder: G },
  { code: "504", label: "+504 Honduras", placeholder: G },
  { code: "852", label: "+852 Hong Kong", placeholder: G },
  { code: "36", label: "+36 Hungría", placeholder: G },
  { code: "91", label: "+91 India", placeholder: G },
  { code: "62", label: "+62 Indonesia", placeholder: G },
  { code: "98", label: "+98 Irán", placeholder: G },
  { code: "964", label: "+964 Irak", placeholder: G },
  { code: "353", label: "+353 Irlanda", placeholder: G },
  { code: "354", label: "+354 Islandia", placeholder: G },
  { code: "500", label: "+500 Islas Malvinas", placeholder: G },
  { code: "298", label: "+298 Islas Feroe", placeholder: G },
  { code: "682", label: "+682 Islas Cook", placeholder: G },
  { code: "677", label: "+677 Islas Salomón", placeholder: G },
  { code: "692", label: "+692 Islas Marshall", placeholder: G },
  { code: "972", label: "+972 Israel", placeholder: G },
  { code: "39", label: "+39 Italia / Ciudad del Vaticano", digits: [9, 10], placeholder: "312 345 6789" },
  { code: "81", label: "+81 Japón", placeholder: G },
  { code: "962", label: "+962 Jordania", placeholder: G },
  { code: "7", label: "+7 Rusia / Kazajistán", placeholder: G },
  { code: "254", label: "+254 Kenia", placeholder: G },
  { code: "996", label: "+996 Kirguistán", placeholder: G },
  { code: "686", label: "+686 Kiribati", placeholder: G },
  { code: "383", label: "+383 Kosovo", placeholder: G },
  { code: "965", label: "+965 Kuwait", placeholder: G },
  { code: "856", label: "+856 Laos", placeholder: G },
  { code: "266", label: "+266 Lesoto", placeholder: G },
  { code: "371", label: "+371 Letonia", placeholder: G },
  { code: "961", label: "+961 Líbano", placeholder: G },
  { code: "231", label: "+231 Liberia", placeholder: G },
  { code: "218", label: "+218 Libia", placeholder: G },
  { code: "423", label: "+423 Liechtenstein", placeholder: G },
  { code: "370", label: "+370 Lituania", placeholder: G },
  { code: "352", label: "+352 Luxemburgo", placeholder: G },
  { code: "853", label: "+853 Macao", placeholder: G },
  { code: "389", label: "+389 Macedonia del Norte", placeholder: G },
  { code: "261", label: "+261 Madagascar", placeholder: G },
  { code: "60", label: "+60 Malasia", placeholder: G },
  { code: "265", label: "+265 Malaui", placeholder: G },
  { code: "960", label: "+960 Maldivas", placeholder: G },
  { code: "223", label: "+223 Malí", placeholder: G },
  { code: "356", label: "+356 Malta", placeholder: G },
  { code: "212", label: "+212 Marruecos / Sahara Occidental", placeholder: G },
  { code: "596", label: "+596 Martinica", placeholder: G },
  { code: "230", label: "+230 Mauricio", placeholder: G },
  { code: "222", label: "+222 Mauritania", placeholder: G },
  { code: "262", label: "+262 Reunión / Mayotte", placeholder: G },
  { code: "691", label: "+691 Micronesia", placeholder: G },
  { code: "373", label: "+373 Moldavia", placeholder: G },
  { code: "377", label: "+377 Mónaco", placeholder: G },
  { code: "976", label: "+976 Mongolia", placeholder: G },
  { code: "382", label: "+382 Montenegro", placeholder: G },
  { code: "258", label: "+258 Mozambique", placeholder: G },
  { code: "95", label: "+95 Myanmar", placeholder: G },
  { code: "264", label: "+264 Namibia", placeholder: G },
  { code: "674", label: "+674 Nauru", placeholder: G },
  { code: "977", label: "+977 Nepal", placeholder: G },
  { code: "505", label: "+505 Nicaragua", placeholder: G },
  { code: "227", label: "+227 Níger", placeholder: G },
  { code: "234", label: "+234 Nigeria", placeholder: G },
  { code: "47", label: "+47 Noruega / Svalbard y Jan Mayen", placeholder: G },
  { code: "687", label: "+687 Nueva Caledonia", placeholder: G },
  { code: "64", label: "+64 Nueva Zelanda / Pitcairn", placeholder: G },
  { code: "968", label: "+968 Omán", placeholder: G },
  { code: "31", label: "+31 Países Bajos", placeholder: G },
  { code: "92", label: "+92 Pakistán", placeholder: G },
  { code: "680", label: "+680 Palaos", placeholder: G },
  { code: "970", label: "+970 Palestina", placeholder: G },
  { code: "507", label: "+507 Panamá", placeholder: G },
  { code: "675", label: "+675 Papúa Nueva Guinea", placeholder: G },
  { code: "595", label: "+595 Paraguay", placeholder: G },
  { code: "51", label: "+51 Perú", placeholder: G },
  { code: "689", label: "+689 Polinesia Francesa", placeholder: G },
  { code: "48", label: "+48 Polonia", placeholder: G },
  { code: "351", label: "+351 Portugal", placeholder: G },
  { code: "974", label: "+974 Catar", placeholder: G },
  { code: "44", label: "+44 Reino Unido / Guernsey / Jersey / Isla de Man", digits: [10, 10], placeholder: "7700 900123" },
  { code: "236", label: "+236 República Centroafricana", placeholder: G },
  { code: "420", label: "+420 República Checa", placeholder: G },
  { code: "250", label: "+250 Ruanda", placeholder: G },
  { code: "40", label: "+40 Rumanía", placeholder: G },
  { code: "685", label: "+685 Samoa", placeholder: G },
  { code: "378", label: "+378 San Marino", placeholder: G },
  { code: "508", label: "+508 San Pedro y Miquelón", placeholder: G },
  { code: "290", label: "+290 Santa Elena / Tristán de Acuña", placeholder: G },
  { code: "239", label: "+239 Santo Tomé y Príncipe", placeholder: G },
  { code: "221", label: "+221 Senegal", placeholder: G },
  { code: "381", label: "+381 Serbia", placeholder: G },
  { code: "248", label: "+248 Seychelles", placeholder: G },
  { code: "232", label: "+232 Sierra Leona", placeholder: G },
  { code: "65", label: "+65 Singapur", placeholder: G },
  { code: "963", label: "+963 Siria", placeholder: G },
  { code: "252", label: "+252 Somalia", placeholder: G },
  { code: "94", label: "+94 Sri Lanka", placeholder: G },
  { code: "27", label: "+27 Sudáfrica", placeholder: G },
  { code: "249", label: "+249 Sudán", placeholder: G },
  { code: "211", label: "+211 Sudán del Sur", placeholder: G },
  { code: "46", label: "+46 Suecia", placeholder: G },
  { code: "41", label: "+41 Suiza", placeholder: G },
  { code: "597", label: "+597 Surinam", placeholder: G },
  { code: "66", label: "+66 Tailandia", placeholder: G },
  { code: "886", label: "+886 Taiwán", placeholder: G },
  { code: "255", label: "+255 Tanzania", placeholder: G },
  { code: "992", label: "+992 Tayikistán", placeholder: G },
  { code: "670", label: "+670 Timor Oriental", placeholder: G },
  { code: "228", label: "+228 Togo", placeholder: G },
  { code: "690", label: "+690 Tokelau", placeholder: G },
  { code: "676", label: "+676 Tonga", placeholder: G },
  { code: "216", label: "+216 Túnez", placeholder: G },
  { code: "993", label: "+993 Turkmenistán", placeholder: G },
  { code: "90", label: "+90 Turquía", placeholder: G },
  { code: "688", label: "+688 Tuvalu", placeholder: G },
  { code: "380", label: "+380 Ucrania", placeholder: G },
  { code: "256", label: "+256 Uganda", placeholder: G },
  { code: "598", label: "+598 Uruguay", placeholder: G },
  { code: "998", label: "+998 Uzbekistán", placeholder: G },
  { code: "678", label: "+678 Vanuatu", placeholder: G },
  { code: "58", label: "+58 Venezuela", digits: [10, 10], placeholder: "412 123 4567" },
  { code: "84", label: "+84 Vietnam", placeholder: G },
  { code: "681", label: "+681 Wallis y Futuna", placeholder: G },
  { code: "967", label: "+967 Yemen", placeholder: G },
  { code: "260", label: "+260 Zambia", placeholder: G },
  { code: "263", label: "+263 Zimbabue", placeholder: G },
  { code: "247", label: "+247 Ascensión", placeholder: G },
  { code: "246", label: "+246 Territorio Británico del Océano Índico", placeholder: G },
  { code: "49", label: "+49 Alemania", digits: [10, 11], placeholder: "1512 3456789" },
  { code: "52", label: "+52 México", digits: [10, 10], placeholder: "55 1234 5678" },
];

/** Fallback digit range for codes without a known count: total length stays within E.164 (8 to 15). */
export function digitRange(entry: PhoneCountry): readonly [number, number] {
  return entry.digits ?? [Math.max(1, 8 - entry.code.length), 15 - entry.code.length];
}

export const DEFAULT_PHONE_COUNTRY = "1";

/**
 * Builds the value the normalizer checks. If the local field already starts with "+",
 * the user typed a full international number, so it is used as it is.
 */
export function composePhone(country: string, local: string): string {
  const trimmed = local.trim();
  if (trimmed.startsWith("+")) return trimmed;
  return `+${country}${trimmed.replace(/\D/g, "")}`;
}

/** Longest calling code that prefixes the digits, or null. Codes are prefix-free, so this is unambiguous. */
export function countryCodeOf(digits: string): string | null {
  const codes = PHONE_COUNTRIES.map((c) => c.code).sort((a, b) => b.length - a.length);
  return codes.find((code) => digits.startsWith(code)) ?? null;
}

/**
 * Checks the local digit count. A value that starts with "+" is a full number: its country is read
 * from its digits. Returns a Spanish message, or null when the count is fine.
 */
export function phoneLengthError(country: string, local: string): string | null {
  const trimmed = local.trim();
  const isFull = trimmed.startsWith("+");
  const allDigits = trimmed.replace(/\D/g, "");
  const code = isFull ? countryCodeOf(allDigits) : country;
  const entry = PHONE_COUNTRIES.find((c) => c.code === code);
  if (!entry) return null;
  const digits = isFull ? allDigits.length - entry.code.length : allDigits.length;
  const [min, max] = digitRange(entry);
  if (digits >= min && digits <= max) return null;
  const expected = entry.digits
    ? min === max ? `${min}` : `${min} o ${max}`
    : `entre ${min} y ${max}`;
  return `El número para +${entry.code} debe tener ${expected} dígitos. Revisa el número.`;
}

/** Placeholder for the selected country's number field. */
export function phonePlaceholder(country: string): string {
  return PHONE_COUNTRIES.find((c) => c.code === country)?.placeholder ?? "";
}
