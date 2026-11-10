import { RefreshControl, StyleSheet, View } from "react-native";
import { ScrollView } from "react-native";
import { palette } from "../src/theme";
import { Screen } from "../src/components/Screen";
import { Txt } from "../src/components/Txt";

export default function About() {
  return (
    <Screen
      refreshControl={
        <RefreshControl
          refreshing={false}
          tintColor={palette.accent}
        />
      }
    >
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Txt variant="h1">KineTech</Txt>
          <Txt variant="small" style={styles.tagline}>
            Engineering & Technology Education
          </Txt>
        </View>

        <View style={styles.section}>
          <Txt variant="title">About Us</Txt>
          <Txt variant="small" style={styles.text}>
            KineTech is a leading educational platform specializing in engineering and technology courses. 
            We provide high-quality training in programming, data science, robotics, and CAD/SolidWorks 
            to help students build successful careers in the tech industry.
          </Txt>
        </View>

        <View style={styles.section}>
          <Txt variant="title">Our Mission</Txt>
          <Txt variant="small" style={styles.text}>
            To make engineering and technology education accessible to everyone, regardless of their 
            background or location. We believe that with the right skills and knowledge, anyone can 
            achieve their dreams in the tech industry.
          </Txt>
        </View>

        <View style={styles.section}>
          <Txt variant="title">What We Offer</Txt>
          <View style={styles.list}>
            <View style={styles.listItem}>
              <Txt variant="small" style={styles.listText}>
                • Comprehensive programming courses (Python, JavaScript, etc.)
              </Txt>
            </View>
            <View style={styles.listItem}>
              <Txt variant="small" style={styles.listText}>
                • Data science and machine learning training
              </Txt>
            </View>
            <View style={styles.listItem}>
              <Txt variant="small" style={styles.listText}>
                • Robotics and automation courses
              </Txt>
            </View>
            <View style={styles.listItem}>
              <Txt variant="small" style={styles.listText}>
                • CAD/SolidWorks certification programs
              </Txt>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Txt variant="title">Why Choose KineTech?</Txt>
          <View style={styles.list}>
            <View style={styles.listItem}>
              <Txt variant="small" style={styles.listText}>
                • Industry-exp instructors with real-world experience
              </Txt>
            </View>
            <View style={styles.listItem}>
              <Txt variant="small" style={styles.listText}>
                • Hands-on projects and practical learning
              </Txt>
            </View>
            <View style={styles.listItem}>
              <Txt variant="small" style={styles.listText}>
                • Flexible learning schedules to fit your lifestyle
              </Txt>
            </View>
            <View style={styles.listItem}>
              <Txt variant="small" style={styles.listText}>
                • Affordable pricing with payment plans available
              </Txt>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Txt variant="title">Contact Us</Txt>
          <Txt variant="small" style={styles.text}>
            For more information about our courses or to speak with an advisor, please contact us:
          </Txt>
          <View style={styles.contact}>
            <Txt variant="small" style={styles.contactItem}>
              📧 Email: info@kinetech.com
            </Txt>
            <Txt variant="small" style={styles.contactItem}>
              📱 WhatsApp: +20 104 203 1062
            </Txt>
            <Txt variant="small" style={styles.contactItem}>
              🌐 Website: www.kinetech.com
            </Txt>
          </View>
        </View>

        <View style={styles.footer}>
          <Txt variant="small" style={styles.copyright}>
            © 2026 KineTech. All rights reserved.
          </Txt>
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 22,
    paddingBottom: 40,
  },
  header: {
    alignItems: "center",
    marginTop: 22,
    marginBottom: 32,
    gap: 8,
  },
  tagline: {
    color: palette.muted,
    textAlign: "center",
  },
  section: {
    marginBottom: 28,
    gap: 12,
  },
  text: {
    lineHeight: 22,
    color: palette.fg,
  },
  list: {
    gap: 8,
  },
  listItem: {
    paddingLeft: 16,
    borderLeftWidth: 2,
    borderLeftColor: palette.accent,
  },
  listText: {
    color: palette.fg,
  },
  contact: {
    gap: 8,
    marginTop: 12,
  },
  contactItem: {
    color: palette.fg,
  },
  footer: {
    alignItems: "center",
    marginTop: 32,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: palette.line,
  },
  copyright: {
    color: palette.muted,
  },
});