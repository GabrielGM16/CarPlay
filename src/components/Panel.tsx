/**
 * Surfaces and the seams between them.
 *
 * The console is one moulded piece, so panels are separated by hairline seams
 * rather than floated as cards with shadows. A seam can be lit, which is how
 * the interface shows which region is active without resorting to a glow or a
 * coloured background.
 */
import React from 'react';
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { color, radius, space, type } from '../theme';

export interface PanelProps {
  children: React.ReactNode;
  /** Raises the face one step, for a well inside another panel. */
  inset?: boolean;
  /** Lights the border, marking this panel as the active region. */
  lit?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Panel({ children, inset = false, lit = false, style }: PanelProps) {
  return (
    <View
      style={[
        styles.panel,
        inset && styles.inset,
        lit && styles.lit,
        style,
      ]}
    >
      {children}
    </View>
  );
}

/** A horizontal or vertical hairline. */
export function Seam({
  vertical = false,
  lit = false,
}: {
  vertical?: boolean;
  lit?: boolean;
}) {
  return (
    <View
      style={[
        vertical ? styles.seamVertical : styles.seamHorizontal,
        { backgroundColor: lit ? color.seamLit : color.seam },
      ]}
    />
  );
}

/**
 * A heading for a region, with an optional count on the right.
 *
 * Set in sentence case at body weight rather than as a tracked-out all-caps
 * eyebrow: this is a label on a panel, and it should read as quietly as the
 * lettering silk-screened onto a dashboard.
 */
export function SectionHeader({
  title,
  meta,
  action,
}: {
  title: string;
  meta?: string;
  action?: React.ReactNode;
}) {
  return (
    <View style={styles.header}>
      <Text style={styles.headerTitle} numberOfLines={1}>
        {title}
      </Text>
      {meta ? <Text style={styles.headerMeta}>{meta}</Text> : null}
      {action ? <View style={styles.headerAction}>{action}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: color.graphite,
    borderRadius: radius.panel,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.seam,
    overflow: 'hidden',
  },
  inset: {
    backgroundColor: color.raised,
  },
  lit: {
    borderColor: color.seamLit,
  },
  seamHorizontal: {
    height: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
  },
  seamVertical: {
    width: StyleSheet.hairlineWidth,
    alignSelf: 'stretch',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  headerTitle: {
    ...type.subtitle,
    color: color.illum,
    flexShrink: 1,
  },
  headerMeta: {
    ...type.label,
    color: color.dim,
  },
  headerAction: {
    marginLeft: 'auto',
  },
});
