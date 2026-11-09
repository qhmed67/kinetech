import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { color, font, radius, spacing } from "@kinetech/tokens";

export interface SheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
}

export function Sheet({ isOpen, onClose, children, title }: SheetProps) {
  return (
    <Modal
      visible={isOpen}
      onRequestClose={onClose}
      animationType="slide"
      transparent
      presentationStyle="overFullScreen"
      supportedOrientations={["portrait", "landscape"]}
    >
      <>
        <Pressable style={styles.overlay} onPress={onClose} />
        <View style={styles.sheet}>
          <Pressable onPress={onClose} style={styles.handleContainer}>
            <View style={styles.handle} />
          </Pressable>
          {title && (
            <View style={styles.header}>
              <Text style={styles.headerText}>{title}</Text>
              <Pressable onPress={onClose} style={styles.closeButton}>
                <Text style={styles.closeText}>✕</Text>
              </Pressable>
            </View>
          )}
          <View style={styles.content}>{children}</View>
        </View>
      </>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: color.bg,
    borderTopLeftRadius: radius.panel,
    borderTopRightRadius: radius.panel,
    paddingTop: 16,
    paddingHorizontal: spacing.gapMd,
    minHeight: 300,
    maxHeight: "85%",
  },
  handleContainer: {
    alignItems: "center",
    paddingVertical: 8,
  },
  handle: {
    width: 40,
    height: 5,
    backgroundColor: color.border,
    borderRadius: radius.badge,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.gapMd,
  },
  headerText: {
    fontFamily: font.displayMobile,
    fontWeight: font.weightDisplay,
    fontSize: 18,
    color: color.fg,
  },
  closeButton: {
    padding: 8,
  },
  closeText: {
    fontFamily: font.displayMobile,
    fontWeight: font.weightDisplay,
    fontSize: 20,
    color: color.muted,
  },
  content: {
    paddingBottom: spacing.gap2xl,
  },
});
