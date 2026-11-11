/* Web course card port — the Academy rail card (.course via w-[82vw] card
 * markup) plus the expanded modal variant. Same pieces: photo, designation
 * (11px uppercase tracking .12em accent), name, quote (clamp 3 lines),
 * WhatsApp CTA + details link. */

import { Image, Linking, Modal, Pressable, StyleSheet, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import { useLang } from "../../lang";
import { ktFont, palette } from "../../theme";
import { Txt } from "../Txt";
import { Button } from "@kinetech/ui-native";

export const WA = "https://wa.me/201042031062";

export type CourseCardData = {
  slug: string;
  name: string;
  designation: string;
  quote: string;
  cta: string;
  photoCard: string;
};

function CloseX() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path d="M18 6l-12 12M6 6l12 12" stroke={palette.black} strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

export function CourseCard({
  course,
  onPress,
  style,
}: {
  course: CourseCardData;
  onPress?: () => void;
  style?: object;
}) {
  const { t } = useLang();
  return (
    <Pressable
      onPress={onPress}
      style={[styles.card, style]}
      accessibilityRole="button"
      accessibilityLabel={course.name}
    >
      <View style={styles.imgBox}>
        {course.photoCard ? (
          <Image source={{ uri: course.photoCard }} style={styles.img} resizeMode="cover" />
        ) : null}
      </View>
      <View style={styles.body}>
        <Txt style={styles.desig}>{course.designation}</Txt>
        <Txt variant="h3">{course.name}</Txt>
        <Txt variant="small" tone="muted" numberOfLines={3} style={{ lineHeight: 22 }}>
          {course.quote}
        </Txt>
        <View style={styles.actions}>
          <Button
            title={course.cta}
            variant="primary"
            onPress={() => void Linking.openURL(WA).catch(() => {})}
          />
          <Pressable onPress={onPress}>
            <Txt variant="small" tone="accent" style={{ fontWeight: "700" }}>
              {t.catalog.details}
            </Txt>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

/** Expanded card — the Academy/Courses modal (image top, scroll body). */
export function CourseModal({
  course,
  onClose,
  onDetails,
}: {
  course: CourseCardData | null;
  onClose: () => void;
  onDetails?: (slug: string) => void;
}) {
  const { t } = useLang();
  return (
    <Modal visible={!!course} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable onPress={onClose} style={styles.closeBtn} accessibilityLabel="Close">
          <CloseX />
        </Pressable>
        {course && (
          <View style={styles.modalCard}>
            <Image source={{ uri: course.photoCard }} style={styles.modalImg} resizeMode="cover" />
            <View style={styles.modalBody}>
              <Txt style={styles.desig}>{course.designation}</Txt>
              <Txt variant="h2" style={{ marginTop: 4 }}>
                {course.name}
              </Txt>
              <Txt variant="small" tone="muted" style={{ marginTop: 8, lineHeight: 22 }}>
                {course.quote}
              </Txt>
              <Button
                title={course.cta}
                variant="primary"
                onPress={() => void Linking.openURL(WA).catch(() => {})}
                style={{ marginTop: 20 }}
              />
              <Pressable
                onPress={() => {
                  onClose();
                  onDetails?.(course.slug);
                }}
                style={{ marginTop: 12, alignSelf: "center" }}
              >
                <Txt variant="small" tone="accent" style={{ fontWeight: "700", textAlign: "center" }}>
                  {t.catalog.details}
                </Txt>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 300,
    maxWidth: 340,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.white,
    overflow: "hidden",
  },
  imgBox: {
    height: 224,
    backgroundColor: palette.surface,
  },
  img: { width: "100%", height: "100%" },
  body: {
    padding: 24,
    gap: 8,
  },
  desig: {
    color: palette.accent,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.32, // .12em
    textTransform: "uppercase",
    fontFamily: ktFont(700),
  },
  actions: {
    marginTop: 12,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 16,
  },
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.25)",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
  },
  closeBtn: {
    position: "absolute",
    right: 16,
    top: 48,
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: palette.white,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: palette.black,
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    zIndex: 2,
  },
  modalCard: {
    width: "100%",
    maxWidth: 500,
    borderRadius: 24,
    backgroundColor: palette.white,
    overflow: "hidden",
    maxHeight: "88%",
  },
  modalImg: {
    width: "100%",
    height: 300,
    backgroundColor: palette.surface,
  },
  modalBody: { padding: 24 },
});
