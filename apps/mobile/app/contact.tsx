import { RefreshControl, StyleSheet, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ScrollView, TouchableOpacity } from "react-native";
import { palette } from "../src/theme";
import { Screen } from "../src/components/Screen";
import { Txt } from "../src/components/Txt";

type IonName = React.ComponentProps<typeof Ionicons>["name"];

export default function Contact() {
  const contactOptions: Array<{
    icon: IonName;
    title: string;
    description: string;
    action: string;
  }> = [
    {
      icon: "mail-outline",
      title: "Email Us",
      description: "Send us an email with your questions",
      action: "mailto:info@kinetech.com",
    },
    {
      icon: "call-outline",
      title: "Call Us",
      description: "Give us a call during business hours",
      action: "tel:+201042031062",
    },
    {
      icon: "chatbubble-ellipses-outline",
      title: "WhatsApp",
      description: "Chat with us on WhatsApp",
      action: "https://wa.me/201042031062",
    },
    {
      icon: "location-outline",
      title: "Visit Us",
      description: "Our office location and directions",
      action: "maps://?q=KineTech+Office",
    },
  ];

  const openContact = (action: string) => {
    // TODO: Implement contact action handling
    console.log("Contact action:", action);
  };

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
          <Txt variant="h1">Contact Us</Txt>
          <Txt variant="small" style={styles.subtitle}>
            We're here to help! Choose your preferred way to get in touch.
          </Txt>
        </View>

        <View style={styles.section}>
          <Txt variant="title">Get in Touch</Txt>
          <View style={styles.options}>
            {contactOptions.map((option, index) => (
              <TouchableOpacity
                key={index}
                style={styles.option}
                onPress={() => openContact(option.action)}
                activeOpacity={0.7}
              >
                <View style={styles.icon}>
                  <Ionicons
                    name={option.icon}
                    size={24}
                    color={palette.accent}
                  />
                </View>
                <View style={styles.optionContent}>
                  <Txt variant="h3">{option.title}</Txt>
                  <Txt variant="small" style={styles.optionDescription}>
                    {option.description}
                  </Txt>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={palette.muted}
                />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Txt variant="title">Business Hours</Txt>
          <View style={styles.hours}>
            <View style={styles.day}>
              <Txt variant="small" style={styles.dayName}>Sunday - Thursday</Txt>
              <Txt variant="small" style={styles.dayTime}>9:00 AM - 6:00 PM</Txt>
            </View>
            <View style={styles.day}>
              <Txt variant="small" style={styles.dayName}>Friday</Txt>
              <Txt variant="small" style={styles.dayTime}>9:00 AM - 4:00 PM</Txt>
            </View>
            <View style={styles.day}>
              <Txt variant="small" style={styles.dayName}>Saturday</Txt>
              <Txt variant="small" style={styles.dayTime}>Closed</Txt>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Txt variant="title">Frequently Asked Questions</Txt>
          <View style={styles.faq}>
            <View style={styles.question}>
              <Txt variant="h3">What courses do you offer?</Txt>
              <Txt variant="small" style={styles.answer}>
                We offer a wide range of courses including programming (Python, JavaScript), 
                data science, robotics, and CAD/SolidWorks. Check our courses page for a 
                complete list.
              </Txt>
            </View>
            <View style={styles.question}>
              <Txt variant="h3">How do I enroll in a course?</Txt>
              <Txt variant="small" style={styles.answer}>
                Simply browse our courses, select the one you're interested in, and click 
                the "Enroll Now" button. You'll need to create an account if you don't 
                already have one.
              </Txt>
            </View>
            <View style={styles.question}>
              <Txt variant="h3">What payment methods do you accept?</Txt>
              <Txt variant="small" style={styles.answer}>
                We accept various payment methods including credit cards, PayPal, and bank 
                transfers. We also offer installment payment plans for selected courses.
              </Txt>
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <Txt variant="small" style={styles.note}>
            We typically respond to emails within 24 business hours. For urgent matters, 
            please call us during business hours.
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
    marginTop: 22,
    marginBottom: 32,
    gap: 8,
  },
  subtitle: {
    color: palette.muted,
    textAlign: "center",
  },
  section: {
    marginBottom: 28,
    gap: 16,
  },
  options: {
    gap: 12,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    padding: 16,
    backgroundColor: palette.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.line,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: palette.bg,
    alignItems: "center",
    justifyContent: "center",
  },
  optionContent: {
    flex: 1,
    gap: 4,
  },
  optionDescription: {
    color: palette.muted,
  },
  hours: {
    gap: 12,
  },
  day: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  dayName: {
    color: palette.fg,
  },
  dayTime: {
    color: palette.muted,
  },
  faq: {
    gap: 20,
  },
  question: {
    gap: 8,
  },
  answer: {
    color: palette.fg,
    lineHeight: 20,
  },
  footer: {
    alignItems: "center",
    marginTop: 32,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: palette.line,
  },
  note: {
    color: palette.muted,
    textAlign: "center",
    maxWidth: 300,
  },
});