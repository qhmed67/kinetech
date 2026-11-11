import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button } from "@kinetech/ui-native";
import { useLang } from "../../../src/lang";
import { useAuth } from "../../../src/auth";
import { getWatchState, touchUnlocked, completeVideo, type WatchRow } from "../../../src/lib/db/watch";
import { palette } from "../../../src/theme";
import { Screen } from "../../../src/components/Screen";
import { Divider } from "../../../src/components/Section";
import { Txt } from "../../../src/components/Txt";
import { EmptyState } from "../../../src/components/States";
import { GatedPlayer } from "../../../src/components/GatedPlayer";

export default function WatchScreen() {
  const { slug, video } = useLocalSearchParams<{ slug: string; video?: string }>();
  const idx = Number(video ?? 0) || 0;
  const { t, lang } = useLang();
  const { user, ready, refresh } = useAuth();
  const router = useRouter();
  const w = t.watch;

  const [rows, setRows] = useState<WatchRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  const load = useCallback(async () => {
    if (!slug) return;
    try {
      const data = await getWatchState(slug, lang);
      setRows(data);
      setFailed(false);
    } catch {
      setRows([]);
      setFailed(true);
    }
  }, [slug, lang]);

  useEffect(() => {
    setRows(null);
    void load();
  }, [load, user?.email, tick]);

  const current = useMemo(
    () => rows?.find((r) => r.sort_order === idx) ?? rows?.[0] ?? null,
    [rows, idx],
  );

  // Sticky unlock: opening an entitled part keeps it open (no view burned).
  useEffect(() => {
    if (!current?.unlocked || !current.video_id) return;
    void touchUnlocked(current.video_id).catch(() => {
      /* display already correct; server sync retries */
    });
  }, [current?.video_id, current?.unlocked]);

  const isEnrolled = Boolean(
    user && (user.role === "admin" || user.enrolled.includes(slug ?? "")),
  );

  const onEnded = async (watched: number, duration: number) => {
    if (!current) return;
    try {
      await completeVideo(current.video_id, watched, duration, true);
      await Haptics.notificationAsync(
        Haptics.NotificationFeedbackType.Success,
      ).catch(() => {});
      setTick((n) => n + 1);
    } catch {
      /* keep watching; retry on next mount */
    }
  };

  if (!ready) {
    return (
      <Screen>
        <View style={styles.loading}>
          <ActivityIndicator color={palette.accent} />
        </View>
      </Screen>
    );
  }

  if (!user) {
    return (
      <Screen>
        <EmptyState
          title={lang === "ar" ? "سجّل الدخول للمشاهدة" : "Sign in to watch"}
          note={
            lang === "ar"
              ? "الدروس متاحة للطلاب المسجلين فقط."
              : "Lessons are available to signed-in students."
          }
          actionLabel={t.nav.signin}
          onAction={() => router.push("/sign-in")}
          icon="lock-closed-outline"
        />
      </Screen>
    );
  }

  if (rows === null) {
    return (
      <Screen>
        <View style={styles.loading}>
          <ActivityIndicator color={palette.accent} />
        </View>
      </Screen>
    );
  }

  if (!isEnrolled) {
    return (
      <Screen>
        <Txt
          variant="small"
          tone="accent"
          onPress={() => router.push(`/course/${slug}`)}
          style={styles.back}
        >
          {w.backToCourse}
        </Txt>
        <EmptyState
          title={w.noAccessT}
          note={w.noAccessD}
          actionLabel={w.retryBtn}
          onAction={() => {
            setBusy(true);
            void refresh().finally(() => setBusy(false));
          }}
          icon="lock-closed-outline"
        />
        {busy ? <ActivityIndicator color={palette.accent} style={styles.retrySpinner} /> : null}
      </Screen>
    );
  }

  if (rows.length === 0 || !current) {
    return (
      <Screen>
        <Txt
          variant="small"
          tone="accent"
          onPress={() => router.push(`/course/${slug}`)}
          style={styles.back}
        >
          {w.backToCourse}
        </Txt>
        <EmptyState
          title={failed ? w.noCourseT : w.emptyT}
          note={failed ? w.noCourseD : w.emptyD}
          actionLabel={w.retryBtn}
          onAction={() => setTick((n) => n + 1)}
          icon="videocam-off-outline"
        />
      </Screen>
    );
  }

  return (
    <Screen>
      <Txt
        variant="small"
        tone="accent"
        onPress={() => router.push(`/course/${slug}`)}
        style={styles.back}
      >
        {w.backToCourse}
      </Txt>

      <Txt variant="h2" style={styles.title}>
        {current.title}
      </Txt>
      {current.description ? (
        <Txt variant="small" style={styles.desc}>
          {current.description}
        </Txt>
      ) : null}

      <View style={styles.viewsRow}>
        <View style={styles.viewsDot} />
        <Txt variant="meta">
          {w.remaining.replace("{n}", String(current.views_left))}
        </Txt>
      </View>

      <View style={styles.playerWrap}>
        {current.unlocked ? (
          <GatedPlayer
            key={current.video_id}
            videoId={current.video_id}
            minutes={current.mins}
            onEnded={(watched, duration) => void onEnded(watched, duration)}
          />
        ) : (
          <View style={styles.locked}>
            <View style={styles.lockCircle}>
              <Ionicons name="lock-closed" size={22} color={palette.accent} />
            </View>
            <Txt variant="title" center>
              {w.lockedT}
            </Txt>
            <Txt variant="small" center style={styles.lockedNote}>
              {w.lockedD}
            </Txt>
          </View>
        )}
      </View>

      {current.assign_url || current.exam_url ? (
        <View style={styles.resources}>
          <Txt variant="title">{w.resourcesT}</Txt>
          <View style={styles.resourceRow}>
            {current.assign_url ? (
              <Button
                title={w.assignL}
                variant="secondary"
                size="sm"
                onPress={() => void Linking.openURL(current.assign_url as string)}
              />
            ) : null}
            {current.exam_url ? (
              <Button
                title={w.examL}
                variant="secondary"
                size="sm"
                onPress={() => void Linking.openURL(current.exam_url as string)}
              />
            ) : null}
          </View>
        </View>
      ) : null}

      <Txt variant="title" style={styles.contentTitle}>
        {w.contentT}
      </Txt>

      <View style={styles.parts}>
        {rows.map((row, i) => {
          const active = row.video_id === current.video_id;
          return (
            <View key={row.video_id}>
              {i > 0 ? <Divider /> : null}
              <Pressable
                onPress={() =>
                  router.setParams({ video: String(row.sort_order) })
                }
                style={({ pressed }) => [
                  styles.partRow,
                  active && styles.partActive,
                  pressed && styles.partPressed,
                ]}
              >
                <View style={[styles.partNum, active && styles.partNumActive]}>
                  <Txt
                    variant="meta"
                    style={[styles.partNumText, active && styles.partNumTextActive]}
                  >
                    {String(i + 1).padStart(2, "0")}
                  </Txt>
                </View>
                <View style={styles.flex}>
                  <Txt variant="small" style={styles.partTitle} numberOfLines={2}>
                    {row.title}
                  </Txt>
                  <Txt variant="meta" style={styles.partMeta}>
                    {row.mins} {w.min}
                    {row.done
                      ? ` · ${t.dashboard.doneLessons}`
                      : ` · ${row.views_count}/3`}
                  </Txt>
                </View>
                <Ionicons
                  name={
                    row.done
                      ? "checkmark-circle"
                      : row.unlocked
                        ? "play-circle-outline"
                        : "lock-closed-outline"
                  }
                  size={20}
                  color={
                    row.done
                      ? palette.teal
                      : row.unlocked
                        ? palette.accent
                        : palette.border
                  }
                />
              </Pressable>
            </View>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  loading: { paddingTop: 60, alignItems: "center" },
  back: { marginTop: 14 },
  title: { marginTop: 8 },
  desc: { color: palette.muted, marginTop: 6 },
  viewsRow: { flexDirection: "row", alignItems: "center", gap: 7, marginTop: 10 },
  viewsDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: palette.teal,
  },
  playerWrap: { marginTop: 14 },
  locked: {
    aspectRatio: 16 / 9,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surface,
    alignItems: "center",
    justifyContent: "center",
    padding: 22,
    gap: 8,
  },
  lockCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: palette.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  lockedNote: { maxWidth: 280 },
  resources: { marginTop: 20, gap: 9 },
  resourceRow: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  contentTitle: { marginTop: 26 },
  parts: { marginTop: 8 },
  partRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 13,
  },
  partActive: {
    backgroundColor: `${palette.accent}0F`,
    borderRadius: 12,
    paddingHorizontal: 8,
    marginHorizontal: -8,
  },
  partPressed: { opacity: 0.85 },
  partNum: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: palette.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  partNumActive: { backgroundColor: palette.accent },
  partNumText: { fontSize: 11, color: palette.muted },
  partNumTextActive: { color: palette.white },
  partTitle: { color: palette.fg },
  partMeta: { fontSize: 11, marginTop: 3 },
  flex: { flex: 1 },
  retrySpinner: { marginTop: 12 },
});
