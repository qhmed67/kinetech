import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  View,
  Dimensions,
  Platform,
} from "react-native";
import * as Haptics from "expo-haptics";
import { WebView } from "react-native-webview";
import { Button } from "@kinetech/ui-native";
import { useLang } from "../lang";
import { palette } from "../theme";
import { Screen } from "./Screen";
import { Txt } from "./Txt";

interface GatedPlayerProps {
  videoId: string;
  minutes?: number;
  onEnded?: (watched: number, duration: number) => void;
}

export function GatedPlayer({ videoId, minutes, onEnded }: GatedPlayerProps) {
  const { t } = useLang();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const videoUrl = `https://drive.google.com/file/d/${videoId}/preview`;

  const onMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      
      if (data.type === "progress") {
        setProgress(data.progress);
        setDuration(data.duration);
      } else if (data.type === "ended") {
        setIsPlaying(false);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        onEnded?.(data.watched || 0, data.duration || 0);
      } else if (data.type === "error") {
        setError(true);
        setLoading(false);
      }
    } catch (e) {
      console.error("Error parsing message:", e);
    }
  };

  const handleRefresh = () => {
    setLoading(true);
    setError(false);
    setProgress(0);
    setDuration(0);
  };

  if (error) {
    return (
      <Screen>
        <View style={styles.container}>
          <Txt variant="h2" style={styles.title}>
            {t.watch.errorT}
          </Txt>
          <Txt variant="small" style={styles.description}>
            {t.watch.errorD}
          </Txt>
          <Button
            title={t.watch.retryBtn}
            onPress={handleRefresh}
          />
        </View>
      </Screen>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.player}>
        {loading && (
          <View style={styles.loading}>
            <ActivityIndicator color={palette.accent} size="large" />
            <Txt variant="small" style={styles.loadingText}>
              {t.watch.loading}
            </Txt>
          </View>
        )}
        
        <WebView
          source={{ uri: videoUrl }}
          style={styles.webview}
          onLoadStart={() => setLoading(true)}
          onLoadEnd={() => setLoading(false)}
          onError={() => {
            setError(true);
            setLoading(false);
          }}
          onMessage={onMessage}
          allowsFullscreenVideo
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled
          mixedContentMode="compatibility"
          sharedCookiesEnabled
          originWhitelist={["*"]}
          scalesPageToFit={Platform.OS === "android"}
          startInLoadingState
        />
      </View>

      {minutes && (
        <View style={styles.info}>
          <View style={styles.infoRow}>
            <Txt variant="meta">{t.watch.duration}</Txt>
            <Txt variant="meta">{minutes} {t.watch.min}</Txt>
          </View>
          <View style={styles.infoRow}>
            <Txt variant="meta">{t.watch.progress}</Txt>
            <Txt variant="meta">
              {Math.round((progress / duration) * 100)}%
            </Txt>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  player: {
    width: "100%",
    aspectRatio: 16 / 9,
    backgroundColor: palette.bg,
    borderRadius: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: palette.line,
  },
  webview: {
    flex: 1,
  },
  loading: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#000000B3",
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  loadingText: {
    color: palette.white,
    textAlign: "center",
  },
  info: {
    padding: 16,
    gap: 12,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: {
    marginBottom: 8,
  },
  description: {
    color: palette.muted,
    textAlign: "center",
    marginBottom: 16,
  },
});