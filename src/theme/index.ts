// ─── Tea Farm World Class Theme ───────────────────────────────────────────────
// Colors inspired by tea leaves, soil, morning mist and Kenyan highlands

export const colors = {
  // Primary — deep tea green
  primary:        "#1B5E20",
  primaryLight:   "#2E7D32",
  primaryLighter: "#388E3C",
  primaryPale:    "#C8E6C9",

  // Secondary — golden tea / harvest
  secondary:      "#F9A825",
  secondaryLight: "#FBC02D",
  secondaryPale:  "#FFF9C4",

  // Accent — morning mist / dew
  accent:         "#00ACC1",
  accentLight:    "#26C6DA",
  accentPale:     "#E0F7FA",

  // Earth tones — soil, bark
  earth:          "#5D4037",
  earthLight:     "#795548",
  earthPale:      "#D7CCC8",

  // Backgrounds
  background:     "#F1F8E9",
  backgroundDark: "#0D1F0D",
  surface:        "#FFFFFF",
  surfaceDark:    "#1A2E1A",
  card:           "#FFFFFF",
  cardDark:       "#162316",

  // Status colors
  success:        "#2E7D32",
  successLight:   "#E8F5E9",
  warning:        "#F57F17",
  warningLight:   "#FFF8E1",
  error:          "#C62828",
  errorLight:     "#FFEBEE",
  info:           "#01579B",
  infoLight:      "#E3F2FD",

  // Text
  textPrimary:    "#1A1A1A",
  textSecondary:  "#4A4A4A",
  textMuted:      "#757575",
  textLight:      "#FFFFFF",
  textOnPrimary:  "#FFFFFF",

  // Borders
  border:         "#C8E6C9",
  borderDark:     "#2E7D32",
  divider:        "#E8F5E9",

  // Overlays
  overlay:        "rgba(0,0,0,0.5)",
  overlayLight:   "rgba(0,0,0,0.2)",

  // Role colors
  adminColor:     "#6A1B9A",
  adminLight:     "#F3E5F5",
  collectorColor: "#1565C0",
  collectorLight: "#E3F2FD",
  salesColor:     "#E65100",
  salesLight:     "#FBE9E7",
  supervisorColor:"#37474F",
  supervisorLight:"#ECEFF1",
};

export const fonts = {
  regular:    "System",
  medium:     "System",
  bold:       "System",
  sizes: {
    xs:   11,
    sm:   13,
    md:   15,
    lg:   17,
    xl:   20,
    xxl:  24,
    xxxl: 32,
    huge: 48,
  },
};

export const spacing = {
  xs:   4,
  sm:   8,
  md:   16,
  lg:   24,
  xl:   32,
  xxl:  48,
};

export const radius = {
  sm:   8,
  md:   12,
  lg:   16,
  xl:   24,
  full: 999,
};

export const shadows = {
  sm: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  md: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  lg: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 16,
    elevation: 8,
  },
};

export const theme = { colors, fonts, spacing, radius, shadows };
export default theme;