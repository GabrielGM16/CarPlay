/**
 * What a region shows when it has nothing in it.
 *
 * An empty screen is an instruction, not a mood: each one says what is missing
 * and gives the single action that fixes it.
 */
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Glyph, type GlyphName } from './Glyph';
import { color, radius, space, TOUCH, type } from '../theme';

export interface EmptyStateProps {
  icon: GlyphName;
  title: string;
  /** One sentence on what to do about it. */
  detail: string;
  action?: { label: string; onPress: () => void };
}

export function EmptyState({ icon, title, detail, action }: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      <Glyph name={icon} size={44} color={color.faint} weight={1.4} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.detail}>{detail}</Text>

      {action ? (
        <Pressable
          accessibilityRole="button"
          onPress={action.onPress}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <Text style={styles.buttonLabel}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
    padding: space.xl,
  },
  title: {
    ...type.subtitle,
    color: color.illum,
    textAlign: 'center',
  },
  detail: {
    ...type.body,
    color: color.dim,
    textAlign: 'center',
    // Comfortable measure at this size; well under 80 characters a line.
    maxWidth: 380,
  },
  button: {
    marginTop: space.sm,
    minHeight: TOUCH - 8,
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    borderRadius: radius.key,
    backgroundColor: color.illum,
  },
  pressed: {
    backgroundColor: '#C3D0D6',
  },
  buttonLabel: {
    ...type.bodyMedium,
    color: color.well,
  },
});
