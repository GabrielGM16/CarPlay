/**
 * The hard keys.
 *
 * A head unit has physical buttons down the side and across the bottom, and
 * this is the software version: a moulded face, a hairline seam, and a
 * tell-tale lamp that lights when the function is engaged. Everything
 * interactive in the app is one of these, so touch targets never fall below
 * `TOUCH` and pressed feedback is the same everywhere.
 */
import React from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { Glyph, type GlyphName } from './Glyph';
import { color, radius, space, TOUCH, type } from '../theme';

export type KeyVariant =
  /** Side-rail navigation key: icon over a label. */
  | 'rail'
  /** Transport key: icon only. */
  | 'transport'
  /** Play/pause: larger, lit face. */
  | 'primary'
  /** Inline action inside a list row. */
  | 'inline';

export interface KeyProps {
  icon: GlyphName;
  /** Shown under the icon on `rail` keys, and read by screen readers on all. */
  label: string;
  onPress: () => void;
  onLongPress?: () => void;
  variant?: KeyVariant;
  /**
   * The function is engaged — shuffle on, this screen selected. Lights the
   * tell-tale and the seam.
   */
  active?: boolean;
  /** Colour of the tell-tale when active. Amber by default. */
  activeColor?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

const SIZES: Record<KeyVariant, { box: number; glyph: number }> = {
  rail: { box: TOUCH + 12, glyph: 26 },
  transport: { box: TOUCH, glyph: 27 },
  primary: { box: TOUCH + 16, glyph: 34 },
  inline: { box: TOUCH - 8, glyph: 22 },
};

export function Key({
  icon,
  label,
  onPress,
  onLongPress,
  variant = 'transport',
  active = false,
  activeColor = color.armed,
  disabled = false,
  style,
}: KeyProps) {
  const { box, glyph } = SIZES[variant];
  const isPrimary = variant === 'primary';

  const glyphColor = disabled
    ? color.faint
    : active
      ? activeColor
      : isPrimary
        ? color.well
        : color.illum;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active, disabled }}
      disabled={disabled}
      onPress={onPress}
      onLongPress={onLongPress}
      hitSlop={6}
      style={({ pressed }) => [
        styles.base,
        {
          minWidth: box,
          minHeight: variant === 'rail' ? box + 16 : box,
          borderRadius: isPrimary ? box : radius.key,
        },
        isPrimary ? styles.primaryFace : styles.face,
        active && !isPrimary && styles.activeFace,
        pressed && (isPrimary ? styles.primaryPressed : styles.pressed),
        disabled && styles.disabled,
        style,
      ]}
    >
      <Glyph name={icon} size={glyph} color={glyphColor} />

      {variant === 'rail' ? (
        <Text
          numberOfLines={1}
          style={[styles.label, active && { color: activeColor }]}
        >
          {label}
        </Text>
      ) : null}

      {/*
        The tell-tale lamp. A lit icon alone is ambiguous at a glance in
        sunlight, so engaged functions also get a lamp under the key — the same
        signal a dashboard uses.
      */}
      {active && !isPrimary ? (
        <View style={[styles.lamp, { backgroundColor: activeColor }]} />
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
  },
  face: {
    backgroundColor: color.raised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.seam,
  },
  activeFace: {
    borderColor: color.seamLit,
    backgroundColor: '#171C20',
  },
  primaryFace: {
    // The one bright face in the interface: it is the control you reach for
    // without looking.
    backgroundColor: color.illum,
  },
  pressed: {
    backgroundColor: '#1C2226',
    opacity: 0.92,
  },
  primaryPressed: {
    backgroundColor: '#C3D0D6',
  },
  disabled: {
    opacity: 0.45,
  },
  label: {
    ...type.label,
    color: color.dim,
    marginTop: space.xs + 2,
  },
  lamp: {
    position: 'absolute',
    bottom: 5,
    width: 16,
    height: 2,
    borderRadius: 1,
  },
});
