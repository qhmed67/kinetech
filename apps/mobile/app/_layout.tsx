import { Stack } from "expo-router";
import { useFonts } from "@expo-google-fonts/alexandria";
import { Alexandria_500Medium, Alexandria_700Bold } from "@expo-google-fonts/alexandria";
import { I18nManager, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { LangProvider } from "../src/lang";
import { AuthProvider } from "../src/auth";
import { ErrorBoundary } from "../src/components/ErrorBoundary";
import { OfflineBanner } from "../src/components/OfflineBanner";

// Valley Sans (Latin) + Alexandria (Arabic) in web order. OFL allows bundling.
// Weights web actually uses: Valley Sans variable 100..900 (body 500, display 700 shipped as variable); Alexandria 500/700.
export default function RootLayout() {
  // expo-font loads Alexandria; Valley Sans via Google Fonts CDN at runtime is web-only.
  // Mobile ships Alexandria 500/700 (bundled); Valley Sans pending asset (see DECISIONS).
  const [loaded] = useFonts({ Alexandria_500Medium, Alexandria_700Bold });
  if (!loaded) return null;
  if (I18nManager.isRTL === false) I18nManager.allowRTL(true);
  return (
    <LangProvider>
      <AuthProvider>
        <ErrorBoundary>
          <View style={{ flex: 1 }}>
            <OfflineBanner />
            <StatusBar style="dark" />
            <Stack screenOptions={{ headerShown: false }} />
          </View>
        </ErrorBoundary>
      </AuthProvider>
    </LangProvider>
  );
}
