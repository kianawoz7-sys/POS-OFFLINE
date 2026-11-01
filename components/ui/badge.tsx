import { View, StyleSheet } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Colors } from '@/constants/theme';

interface BadgeProps {
  label: string;
  variant?: 'info' | 'success' | 'warning';
}

export function Badge({ label, variant = 'info' }: BadgeProps) {
  const bgColor =
    variant === 'success'
      ? Colors.successBg
      : variant === 'warning'
        ? Colors.warningBg
        : '#e3f2fd';

  const textColor =
    variant === 'success'
      ? Colors.success
      : variant === 'warning'
        ? Colors.warning
        : Colors.tint;

  return (
    <View style={[styles.badge, { backgroundColor: bgColor }]}>
      <ThemedText style={{ color: textColor, fontSize: 11, fontWeight: '600' }}>
        {label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
});
