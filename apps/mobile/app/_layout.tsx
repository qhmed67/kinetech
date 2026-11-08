import { Stack } from "expo-router";
import { useFonts } from "@expo-google-fonts/alexandria";
import { Alexandria_500Medium, Alexandria_700Bold } from "@expo-google-fonts/alexandria";
import { I18nManager, View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

// Valley Sans (Latin) + Alexandria (Arabic) in web order. OFL allows bundling.
// Weights web actually uses: Valley Sans variable 100..900 (body 500, display 700 shipped as variable); Alexandria 500/700.
export default function RootLayout() {
  // expo-font loads Alexandria; Valley Sans via Google Fonts CDN at runtime is web-only.
  // Mobile ships Alexandria 500/700 (bundled); Valley Sans pending asset (see DECISIONS).
  const [loaded] = useFonts({ Alexandria_500Medium, Alexandria_700Bold });
  if (!loaded) return null;
  if (I18nManager.isRTL === false) I18nManager.allowRTL(true);
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={{ flex: 1, fontFamily: "Alexandria_500Medium" }}>
        <Stack screenOptions={{ headerShown: false }} />
      </View>
    </GestureHandlerRootView>
  );
}
