import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, StyleSheet, View } from "react-native";
import { palette } from "../theme";
import { Txt } from "./Txt";
import { useLang } from "../lang";

/** Dep-free offline detection: probe the configured backend on mount and on
 *  app foreground. Shows an honest banner — never mentions the video host. */
export function OfflineBanner() {
  const { t } = useLang();
  const [offline, setOffline] = useState(false);
  const probing = useRef(false);

  const probe = useCallback(async () => {
    if (probing.current) return;
    probing.current = true;
    try {
      const base = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
      if (!base) return;
      // Lightweight reachability check: Supabase REST root returns quickly.
      await fetch(base, { method: "HEAD", signal: AbortSignal.timeout(6000) });
      setOffline(false);
    } catch {
      setOffline(true);
    } finally {
      probing.current = false;
    }
  }, []);

  useEffect(() => {
    void probe();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void probe();
    });
    return () => sub.remove();
  }, [probe]);

  if (!offline) return null;

  return (
    <View style={styles.banner} accessibilityRole="alert">
      <Txt variant="meta" tone="white" center>
        {t.offline.banner}
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: palette.muted,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
});
