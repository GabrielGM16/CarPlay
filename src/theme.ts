import type { TextStyle } from 'react-native';

/**
 * Instrument-cluster tokens.
 *
 * Two separate illuminations, the way a real dash has two: cool `dial` light
 * for anything carrying audio, warm `armed` light for a control that is
 * switched on. Nothing else gets to glow.
 */
export const color = {
  /** Recessed background behind every panel. */
  well: '#06070A',
  /** Dash-plastic panel face. */
  graphite: '#0C0E10',
  /** One step up from the panel, for rows and wells that need separation. */
  raised: '#13171A',
  /** Hairline seam between panels. Structure, never decoration. */
  seam: '#1F262B',
  /** A seam catching the dial light — used only on the active edge. */
  seamLit: '#2C4A57',

  /** Instrument backlight. Primary text, needles, glyph strokes. */
  illum: '#E9F2F6',
  /**
   * Secondary text: labels, counts, durations. Measured at 5.0:1 on the panel
   * face and 4.7:1 on a raised row, so it clears AA at label sizes on both.
   */
  dim: '#76848C',
  /**
   * Disabled controls, icon placeholders and the unlit half of the seek dial.
   * At ~2:1 this is deliberately below text contrast — never use it for words.
   */
  faint: '#3A454B',

  /** Hi-fi amplifier blue. The audio signal colour. */
  dial: '#37B6E9',
  dialDeep: '#12617F',
  /** Tell-tale amber. A control that is currently on. */
  armed: '#FF9E2C',
  /** Destructive / removal affordance. */
  alert: '#E8564A',
} as const;

/** 4pt base. Car UI needs the big end of the scale far more than the small. */
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  huge: 48,
} as const;

/**
 * Minimum touch target while driving. Google's 48dp is a phone-at-rest
 * number; a moving car needs more, so nothing interactive goes below this.
 */
export const TOUCH = 64;

export const radius = {
  /** Panels and wells. Restrained — this is moulded plastic, not a bubble. */
  panel: 14,
  /** Rows inside a list. */
  row: 10,
  /** Keys on the rail and transport. */
  key: 18,
  pill: 999,
} as const;

export const font = {
  /** Barlow Semi Condensed — titles, numerals, anything read at a glance. */
  display: 'BarlowSemiCondensed_600SemiBold',
  displayMedium: 'BarlowSemiCondensed_500Medium',
  /** Barlow — running text, labels, list rows. */
  body: 'Barlow_400Regular',
  bodyMedium: 'Barlow_500Medium',
  bodySemi: 'Barlow_600SemiBold',
} as const;

/**
 * Type scale, ~1.25 ratio, anchored at 17 for body so list rows stay legible
 * at arm's length on a 7" panel.
 *
 * `satisfies` rather than `as const`: it checks each entry against `TextStyle`
 * while still letting `fontVariant` be inferred as RN's own union, which a
 * readonly tuple would not be assignable to.
 */
export const type = {
  hero: { fontFamily: font.display, fontSize: 40, lineHeight: 44 },
  title: { fontFamily: font.display, fontSize: 27, lineHeight: 32 },
  subtitle: { fontFamily: font.displayMedium, fontSize: 21, lineHeight: 26 },
  body: { fontFamily: font.body, fontSize: 17, lineHeight: 24 },
  bodyMedium: { fontFamily: font.bodyMedium, fontSize: 17, lineHeight: 24 },
  label: { fontFamily: font.bodyMedium, fontSize: 14, lineHeight: 18 },
  /** Times and counts. Tabular so digits don't jitter as they tick. */
  numeral: {
    fontFamily: font.displayMedium,
    fontSize: 16,
    lineHeight: 20,
    fontVariant: ['tabular-nums'],
  },
} satisfies Record<string, TextStyle>;
