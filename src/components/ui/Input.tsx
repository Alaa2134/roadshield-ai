import { Ionicons } from '@expo/vector-icons';
import { forwardRef, useState } from 'react';
import { Pressable, TextInput, View, type TextInputInstance, type TextInputProps } from 'react-native';
import { useTheme } from '@/theme/ThemeProvider';
import type { IconName } from './Button';
import { Text } from './Text';

type Props = TextInputProps & {
  label?: string;
  error?: string;
  hint?: string;
  icon?: IconName;
  secure?: boolean;
};

export const Input = forwardRef<TextInputInstance, Props>(function Input(
  { label, error, hint, icon, secure, style, multiline, ...rest },
  ref,
) {
  const { p, font, lang } = useTheme();
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(!!secure);
  const border = error ? p.danger : focused ? p.primary : p.border;
  return (
    <View style={{ gap: 6 }}>
      {label ? (
        <Text variant="label" tone="muted">
          {label}
        </Text>
      ) : null}
      <View
        style={{
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          gap: 10,
          minHeight: 52,
          paddingHorizontal: 14,
          paddingVertical: multiline ? 12 : 0,
          borderRadius: 16,
          borderWidth: 1.5,
          borderColor: border,
          backgroundColor: p.surface,
        }}
      >
        {icon ? <Ionicons name={icon} size={19} color={focused ? p.primary : p.textFaint} /> : null}
        <TextInput
          ref={ref}
          placeholderTextColor={p.textFaint}
          selectionColor={p.primary}
          secureTextEntry={hidden}
          multiline={multiline}
          accessibilityLabel={label}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          {...rest}
          style={[
            {
              flex: 1,
              color: p.text,
              fontFamily: font.regular,
              fontSize: 15,
              minHeight: multiline ? 96 : 48,
              textAlignVertical: multiline ? 'top' : 'center',
              textAlign: lang === 'ar' ? 'right' : 'left',
              writingDirection: lang === 'ar' ? 'rtl' : 'ltr',
            },
            style,
          ]}
        />
        {secure ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
            onPress={() => setHidden((h) => !h)}
            hitSlop={10}
          >
            <Ionicons name={hidden ? 'eye-outline' : 'eye-off-outline'} size={20} color={p.textFaint} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="faint">
          {hint}
        </Text>
      ) : null}
    </View>
  );
});
