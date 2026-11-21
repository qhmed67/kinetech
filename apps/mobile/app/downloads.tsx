/* Offline lesson list (2027-architecture.md §4, phase 4).
 *
 * Native-only screen. It lists id + timestamp, never a media URL or token.
 * Drive / YouTube lessons are absent by design (PRODUCT-RULES rule 5).
 */

import { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  listOfflineLessons,
  removeOfflineLesson,
  type OfflineLesson,
} from "../src/downloads";

export default function Downloads() {
  const insets = useSafeAreaInsets();
  const [rows, setRows] = useState<OfflineLesson[]>([]);

  const refresh = useCallback(() => setRows(listOfflineLessons()), []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const open = useCallback((lessonId: string) => {
    router.push(
      `/player?lessonId=${encodeURIComponent(lessonId)}&offline=1` as never,
    );
  }, []);

  const remove = useCallback(
    (lessonId: string) => {
      removeOfflineLesson(lessonId);
      refresh();
    },
    [refresh],
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top + 16 }]}>
      <View style={styles.head}>
        <Text style={styles.title}>Offline lessons</Text>
        <Pressable onPress={() => router.replace("/" as never)} style={styles.back}>
          <Text style={styles.backText}>Done</Text>
        </Pressable>
      </View>
      <Text style={styles.note}>
        Saved inside the app. Drive and YouTube lessons cannot be saved.
      </Text>
      <ScrollView contentContainerStyle={styles.list}>
        {rows.length === 0 ? (
          <Text style={styles.empty}>No saved lessons yet.</Text>
        ) : (
          rows.map((row) => (
            <View key={row.lessonId} style={styles.row}>
              <Pressable
                onPress={() => open(row.lessonId)}
                style={styles.rowMain}
                accessibilityRole="button"
              >
                <Text style={styles.lesson}>{row.lessonId}</Text>
                <Text style={styles.date}>
                  {row.downloadedAt ? new Date(row.downloadedAt).toLocaleString() : ""}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => remove(row.lessonId)}
                style={styles.delete}
                accessibilityRole="button"
                accessibilityLabel="Delete offline lesson"
              >
                <Text style={styles.deleteText}>Delete</Text>
              </Pressable>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FFFFFF", paddingHorizontal: 20 },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  title: { color: "#1A1A1A", fontSize: 22, fontWeight: "700" },
  back: { borderRadius: 999, backgroundColor: "#F0ECF6", paddingHorizontal: 14, paddingVertical: 8 },
  backText: { color: "#6E4E9C", fontSize: 13, fontWeight: "700" },
  note: { color: "#5B5B66", fontSize: 13, lineHeight: 19, marginTop: 8 },
  list: { paddingTop: 18, paddingBottom: 32 },
  empty: { color: "#8A8A94", fontSize: 15, textAlign: "center", marginTop: 48 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E2EA",
    paddingVertical: 12,
  },
  rowMain: { flex: 1 },
  lesson: { color: "#1A1A1A", fontSize: 15, fontWeight: "600" },
  date: { color: "#8A8A94", fontSize: 12, marginTop: 3 },
  delete: { borderRadius: 999, backgroundColor: "#FDECEC", paddingHorizontal: 12, paddingVertical: 7 },
  deleteText: { color: "#B42318", fontSize: 12, fontWeight: "700" },
});
