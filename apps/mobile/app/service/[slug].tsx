/* Web ServicePage port (apps/web/src/pages/ServicePage.tsx): title + lead,
 * items/gets panels (deep gets card), cross-links to the other services,
 * process steps grid, selected-work tiles, CTA, admin posts grid. Data
 * from the same DB tables the web syncs (service_translations etc.). */

import { useEffect, useState } from "react";
import { Image, Linking, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useLang } from "../../src/lang";
import { getService, getProcess, listServiceTitles, SERVICE_SLUGS, type ServiceSlug } from "../../src/lib/db/services";
import { ktGradient, palette } from "../../src/theme";
import { LinearGradient } from "expo-linear-gradient";
import { Footer } from "../../src/components/web/Footer";
import { TopBar } from "../../src/components/web/TopBar";
import { Txt } from "../../src/components/Txt";
import { Button } from "@kinetech/ui-native";

const WA = "https://wa.me/201042031062";

export default function ServicePageScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const { t, lang } = useLang();
  const s = t.services;
  const key = (SERVICE_SLUGS as readonly string[]).includes(String(slug)) ? (String(slug) as ServiceSlug) : "marketing";

  const [data, setData] = useState<Awaited<ReturnType<typeof getService>> | null>(null);
  const [process, setProcess] = useState<Awaited<ReturnType<typeof getProcess>>>([]);
  const [others, setOthers] = useState<Record<ServiceSlug, string> | null>(null);

  useEffect(() => {
    let alive = true;
    setData(null);
    void Promise.all([getService(key, lang), getProcess(lang), listServiceTitles(lang)])
      .then(([d, p, titles]) => {
        if (!alive) return;
        setData(d);
        setProcess(p);
        setOthers(titles);
      })
      .catch(() => alive && setData(null));
    return () => {
      alive = false;
    };
  }, [key, lang]);

  return (
    <View style={styles.root}>
      <TopBar />
      <ScrollView contentContainerStyle={{ paddingBottom: 0 }}>
        <View style={styles.section}>
          <Txt style={styles.eyebrow}>{s.eyebrow}</Txt>
          <Txt variant="h2">{data?.title ?? ""}</Txt>
          <Txt variant="lead" style={{ marginTop: 12 }}>
            {data?.desc ?? ""}
          </Txt>

          {/* items + gets panels */}
          <View style={{ marginTop: 32, gap: 24 }}>
            <View style={styles.panel}>
              <Txt variant="h3">{s.noteH}</Txt>
              <View style={{ marginTop: 16, gap: 12 }}>
                {(data?.items ?? []).map((item) => (
                  <View key={item} style={styles.checkRow}>
                    <View style={styles.badgeDot}>
                      <Txt style={{ color: palette.white, fontSize: 12, fontWeight: "700" }}>✓</Txt>
                    </View>
                    <Txt variant="body" style={{ flexShrink: 1 }}>
                      {item}
                    </Txt>
                  </View>
                ))}
              </View>
            </View>
            <View style={styles.panelDeep}>
              <Txt variant="h3" style={{ color: palette.white }}>
                {s.gets}
              </Txt>
              <View style={{ marginTop: 16, gap: 12 }}>
                {(data?.gets ?? []).map((g) => (
                  <View key={g} style={styles.getsRow}>
                    <View style={styles.getsTick}>
                      <Txt style={{ color: palette.deep, fontSize: 11, fontWeight: "700" }}>✓</Txt>
                    </View>
                    <Txt variant="body" style={{ color: palette.white, fontWeight: "700", flexShrink: 1 }}>
                      {g}
                    </Txt>
                  </View>
                ))}
              </View>
              <Button
                title={s.noteCta}
                variant="light"
                onPress={() => void Linking.openURL(WA).catch(() => {})}
                style={{ marginTop: 24, alignSelf: "flex-start" }}
              />
            </View>
          </View>

          {/* cross-links */}
          {others && (
            <View style={{ marginTop: 32, flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
              {SERVICE_SLUGS.filter((x) => x !== key).map((x) => (
                <Button
                  key={x}
                  title={others[x]}
                  variant="secondary"
                  onPress={() => router.push(`/service/${x}` as never)}
                />
              ))}
            </View>
          )}

          {/* process */}
          {process.length > 0 && (
            <>
              <Txt variant="h2" style={{ fontSize: 26, marginTop: 56 }}>
                {s.processT}
              </Txt>
              <View style={{ marginTop: 24, gap: 16 }}>
                {process.map((p, i) => (
                  <View key={p.t} style={styles.stepCard}>
                    <View style={[styles.stepNum, i === 1 && { backgroundColor: palette.teal }]}>
                      <Txt style={{ color: i === 1 ? palette.deep : "#fff", fontSize: 16, fontWeight: "700" }}>
                        {i + 1}
                      </Txt>
                    </View>
                    <Txt variant="h4" style={{ marginTop: 12 }}>
                      {p.t}
                    </Txt>
                    <Txt variant="small" tone="muted" style={{ marginTop: 6, lineHeight: 20 }}>
                      {p.d}
                    </Txt>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* selected work */}
          {(data?.gets ?? []).length > 0 && (
            <>
              <Txt variant="h2" style={{ fontSize: 26, marginTop: 56 }}>
                {s.portfolioT}
              </Txt>
              <View style={{ marginTop: 24, gap: 16 }}>
                {(data?.gets ?? []).map((g, i) => (
                  <View
                    key={g}
                    style={[
                      styles.workTile,
                      i === 1 && { backgroundColor: palette.deep },
                      i === 2 && { backgroundColor: palette.surface },
                    ]}
                  >
                    {i === 0 && (
                      <LinearGradient
                        colors={ktGradient as unknown as readonly [string, string, ...string[]]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={StyleSheet.absoluteFill}
                      />
                    )}
                    <Txt
                      variant="body"
                      style={{
                        fontWeight: "700",
                        color: i === 2 ? palette.fg : "#fff",
                        fontFamily: "Valley Sans 700",
                      }}
                    >
                      {g}
                    </Txt>
                  </View>
                ))}
              </View>
            </>
          )}

          <Button
            title={s.noteCta}
            variant="primary"
            onPress={() => void Linking.openURL(WA).catch(() => {})}
            style={{ marginTop: 40, alignSelf: "center", paddingHorizontal: 40 }}
          />

          {/* admin posts */}
          {(data?.posts ?? []).length > 0 && (
            <>
              <Txt variant="h2" style={{ fontSize: 26, marginTop: 56 }}>
                {t.admin.postsT}
              </Txt>
              <View style={{ marginTop: 24, gap: 16 }}>
                {(data?.posts ?? []).map((p, i) => (
                  <View key={`${p.title}-${i}`} style={styles.postCard}>
                    {p.image !== "" && (
                      <Image source={{ uri: p.image }} style={styles.postImg} resizeMode="cover" />
                    )}
                    <View style={{ padding: 20 }}>
                      <Txt variant="h4">{p.title}</Txt>
                      {p.text !== "" && (
                        <Txt variant="small" tone="muted" style={{ marginTop: 6, lineHeight: 20 }}>
                          {p.text}
                        </Txt>
                      )}
                      {p.link !== "" && (
                        <Pressable onPress={() => void Linking.openURL(p.link).catch(() => {})}>
                          <Txt variant="small" tone="accent" style={{ fontWeight: "700", marginTop: 12 }}>
                            →
                          </Txt>
                        </Pressable>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            </>
          )}
        </View>

        <Footer />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.white },
  section: {
    paddingVertical: 48,
    paddingHorizontal: 16,
  },
  eyebrow: {
    color: palette.accent,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 14,
    fontFamily: "Valley Sans 700",
  },
  panel: {
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.white,
    padding: 28,
  },
  panelDeep: {
    borderRadius: 22,
    backgroundColor: palette.deep,
    padding: 28,
  },
  checkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  badgeDot: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: palette.teal,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  getsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  getsTick: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: palette.teal,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  stepCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.white,
    padding: 24,
  },
  stepNum: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: palette.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  workTile: {
    minHeight: 150,
    borderRadius: 20,
    justifyContent: "flex-end",
    padding: 20,
    overflow: "hidden",
    backgroundColor: palette.white,
  },
  postCard: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.white,
    overflow: "hidden",
  },
  postImg: {
    width: "100%",
    height: 176,
    backgroundColor: palette.surface,
  },
});
