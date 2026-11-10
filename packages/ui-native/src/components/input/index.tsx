import React from "react";
import {
  TextInput,
  Text,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { color, font, radius } from "@kinetech/tokens";

export interface InputProps {
  value?: string;
  onChangeText?: (text: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "numeric" | "email-address" | "phone-pad";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  autoCorrect?: boolean;
  disabled?: boolean;
  label?: string;
  error?: string;
  style?: StyleProp<ViewStyle>;
}

export function Input({
  value,
  onChangeText,
  placeholder,
  secureTextEntry = false,
  keyboardType,
  autoCapitalize = "sentences",
  autoCorrect = false,
  disabled = false,
  label,
  error,
  style,
}: InputProps) {
  const [internalValue, setInternalValue] = React.useState(value ?? "");
  
  React.useEffect(() => {
    if (value !== undefined) {
      setInternalValue(value);
    }
  }, [value]);

  const handleTextChange = (text: string) => {
    setInternalValue(text);
    onChangeText?.(text);
  };

  return (
    <View style={[styles.container, style]}>
      {label && (
        <Text style={styles.label}>{label}</Text>
      )}
      <TextInput
        value={internalValue}
        onChangeText={handleTextChange}
        placeholder={placeholder}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={autoCorrect}
        editable={!disabled}
        style={[
          styles.input,
          disabled && styles.disabled,
          error && styles.error,
        ]}
      />
      {error && (
        <Text style={styles.errorText}>{error}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  label: {
    fontFamily: font.displayMobile,
    fontWeight: font.weightDisplay,
    fontSize: 14,
    color: color.fg,
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: color.border,
    borderRadius: radius.badge,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 48,
    fontFamily: font.displayMobile,
    fontWeight: font.weightBody,
    fontSize: 16,
    color: color.fg,
  },
  disabled: {
    backgroundColor: color.surface,
    borderColor: color.border,
    opacity: 0.5,
  },
  error: {
    borderColor: color.accent,
  },
  errorText: {
    fontFamily: font.displayMobile,
    fontWeight: font.weightBody,
    fontSize: 12,
    color: color.accent,
    marginTop: 6,
    marginLeft: 4,
  },
});
