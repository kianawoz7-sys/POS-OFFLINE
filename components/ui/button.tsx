import { Pressable, StyleSheet, type PressableProps } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { Colors, Shadows } from '@/constants/theme';

interface ButtonProps extends PressableProps {
  title: string;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger';
  size?: 'sm' | 'md' | 'lg';
}

export function Button({
  title,
  variant = 'primary',
  size = 'md',
  style,
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        styles[`size_${size}` as keyof typeof styles],
        pressed && styles.pressed,
        disabled && styles.disabled,
        style as any,
      ]}
      disabled={disabled}
      {...rest}
    >
      <ThemedText
        style={[
          styles.text,
          variant === 'outline' && { color: Colors.tint },
          variant === 'secondary' && { color: Colors.text },
          variant === 'primary' && { color: '#fff' },
          variant === 'danger' && { color: '#fff' },
          size === 'sm' && { fontSize: 12 },
          size === 'lg' && { fontSize: 16 },
        ]}
      >
        {title}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: {
    backgroundColor: Colors.tint,
    ...Shadows.sm,
  },
  secondary: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  outline: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: Colors.tint,
  },
  danger: {
    backgroundColor: Colors.danger,
  },
  size_sm: { paddingVertical: 6, paddingHorizontal: 12 },
  size_md: { paddingVertical: 12, paddingHorizontal: 20 },
  size_lg: { paddingVertical: 16, paddingHorizontal: 28 },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.4 },
  text: {
    fontWeight: '600',
  },
});
