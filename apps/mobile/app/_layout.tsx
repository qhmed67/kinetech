import { Stack } from "expo-router";
import { useFonts } from "expo-font";
import {
  ValleySans_400Regular,
  ValleySans_500Medium,
  ValleySans_600SemiBold,
  ValleySans_700Bold,
} from "@expo-google-fonts/valley-sans";
import { Alexandria_500Medium, Alexandria_700Bold } from "@expo-google-fonts/alexandria";
import { Pacifico_400Regular } from "@expo-google-fonts/pacifico";
import { I18nManager, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { LangProvider } from "../src/lang";
import { AuthProvider } from "../src/auth";
import { ErrorBoundary } from "../src/components/ErrorBoundary";
import { OfflineBanner } from "../src/components/OfflineBanner";

// Web font stack bundled (OFL/Google Fonts allow it): Valley Sans (Latin,
// body 500 / display 700) + Alexandria (Arabic 500/700) + Pacifico (script).
// The app direction follows the web's document dir (ar => RTL); the actual
// switch happens in src/lang.tsx (applyDirection) because React Native needs a
// restart for I18nManager.forceRTL to take effect.
I18nManager.allowRTL(true);
// left/right stay physical (the web positions the drawer/badge with logical
// `end`/`right` rules we mirror per language instead of relying on the
// platform-specific swap).
I18nManager.swapLeftAndRightInRTL(false);

export default function RootLayout() {
  const [loaded] = useFonts({
    "Valley Sans 400": ValleySans_400Regular,
    "Valley Sans 500": ValleySans_500Medium,
    "Valley Sans 600": ValleySans_600SemiBold,
    "Valley Sans 700": ValleySans_700Bold,
    Alexandria: Alexandria_500Medium,
    "Alexandria 700": Alexandria_700Bold,
    Pacifico: Pacifico_400Regular,
  });
  if (!loaded) return null;
  return (
    <LangProvider>
      <AuthProvider>
        <ErrorBoundary>
          <View style={{ flex: 1, backgroundColor: "#fff" }}>
            <OfflineBanner />
            <StatusBar style="dark" />
            <Stack
              screenOptions={{
                headerShown: false,
                contentStyle: { backgroundColor: "#FFFFFF" },
              }}
            />
          </View>
        </ErrorBoundary>
      </AuthProvider>
    </LangProvider>
  );
}
