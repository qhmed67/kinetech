import { RefreshControl, StyleSheet, View } from "react-native";
import { ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { palette } from "../../src/theme";
import { Screen } from "../../src/components/Screen";
import { Txt } from "../../src/components/Txt";
import { Button } from "@kinetech/ui-native";

const services = {
  marketing: {
    title: "Digital Marketing",
    description: "Comprehensive digital marketing solutions to grow your business online",
    features: [
      "Social Media Marketing",
      "Search Engine Optimization (SEO)",
      "Pay-Per-Click Advertising",
      "Content Marketing Strategy",
      "Email Marketing Campaigns",
      "Analytics & Reporting"
    ],
    icon: "megaphone-outline",
  },
  software: {
    title: "Software Development",
    description: "Custom software solutions tailored to your business needs",
    features: [
      "Web Application Development",
      "Mobile App Development",
      "E-commerce Solutions",
      "API Development & Integration",
      "Database Design & Management",
      "Software Maintenance & Support"
    ],
    icon: "code-slash-outline",
  },
  design: {
    title: "UI/UX Design",
    description: "Beautiful and intuitive design solutions for your digital products",
    features: [
      "User Research & Analysis",
      "Wireframing & Prototyping",
      "UI Design Systems",
      "User Testing & Optimization",
      "Brand Identity Design",
      "Responsive Web Design"
    ],
    icon: "palette-outline",
  }
};

export default function ServicePage() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const service = services[slug as keyof typeof services];

  if (!service) {
    return (
      <Screen
        refreshControl={
          <RefreshControl
            refreshing={false}
            tintColor={palette.accent}
          />
        }
      >
        <View style={styles.container}>
          <Txt variant="h1">Service Not Found</Txt>
          <Txt variant="small" style={styles.text}>
            The requested service could not be found.
          </Txt>
        </View>
      </Screen>
    );
  }

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
          <View style={styles.icon}>
            <Ionicons
              name={service.icon}
              size={40}
              color={palette.accent}
            />
          </View>
          <Txt variant="h1">{service.title}</Txt>
          <Txt variant="small" style={styles.description}>
            {service.description}
          </Txt>
        </View>

        <View style={styles.section}>
          <Txt variant="title">What We Offer</Txt>
          <View style={styles.features}>
            {service.features.map((feature, index) => (
              <View key={index} style={styles.feature}>
                <Ionicons
                  name="checkmark-circle"
                  size={16}
                  color={palette.teal}
                />
                <Txt variant="small" style={styles.featureText}>
                  {feature}
                </Txt>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Txt variant="title">Why Choose Our Service?</Txt>
          <View style={styles.benefits}>
            <View style={styles.benefit}>
              <Ionicons
                name="people-outline"
                size={20}
                color={palette.accent}
              />
              <Txt variant="small" style={styles.benefitText}>
                Experienced professionals with industry expertise
              </Txt>
            </View>
            <View style={styles.benefit}>
              <Ionicons
                name="trending-up-outline"
                size={20}
                color={palette.accent}
              />
              <Txt variant="small" style={styles.benefitText}>
                Proven track record of successful projects
              </Txt>
            </View>
            <View style={styles.benefit}>
              <Ionicons
                name="time-outline"
                size={20}
                color={palette.accent}
              />
              <Txt variant="small" style={styles.benefitText}>
                Timely delivery and ongoing support
              </Txt>
            </View>
            <View style={styles.benefit}>
              <Ionicons
                name="diamond-outline"
                size={20}
                color={palette.accent}
              />
              <Txt variant="small" style={styles.benefitText}>
                Competitive pricing with flexible packages
              </Txt>
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <Txt variant="title">Process Overview</Txt>
          <View style={styles.process}>
            <View style={styles.step}>
              <View style={styles.stepNumber}>
                <Txt variant="meta" style={styles.stepText}>1</Txt>
              </View>
              <View style={styles.stepContent}>
                <Txt variant="h3" style={styles.stepTitle}>Consultation</Txt>
                <Txt variant="small" style={styles.stepDesc}>
                  We start with a detailed consultation to understand your needs and goals
                </Txt>
              </View>
            </View>
            <View style={styles.step}>
              <View style={styles.stepNumber}>
                <Txt variant="meta" style={styles.stepText}>2</Txt>
              </View>
              <View style={styles.stepContent}>
                <Txt variant="h3" style={styles.stepTitle}>Planning</Txt>
                <Txt variant="small" style={styles.stepDesc}>
                  We create a comprehensive plan with timelines and deliverables
                </Txt>
              </View>
            </View>
            <View style={styles.step}>
              <View style={styles.stepNumber}>
                <Txt variant="meta" style={styles.stepText}>3</Txt>
              </View>
              <View style={styles.stepContent}>
                <Txt variant="h3" style={styles.stepTitle}>Execution</Txt>
                <Txt variant="small" style={styles.stepDesc}>
                  Our team implements the solution with regular updates and feedback
                </Txt>
              </View>
            </View>
            <View style={styles.step}>
              <View style={styles.stepNumber}>
                <Txt variant="meta" style={styles.stepText}>4</Txt>
              </View>
              <View style={styles.stepContent}>
                <Txt variant="h3" style={styles.stepTitle">Delivery & Support</Txt>
                <Txt variant="small" style={styles.stepDesc}>
                  We deliver the final product and provide ongoing support
                </Txt>
              </View>
            </View>
          </View>
        </View>

        <View style={styles.cta}>
          <Button
            title="Get Started"
            onPress={() => {
              // TODO: Implement contact flow
            }}
          />
          <Txt variant="small" style={styles.ctaText}>
            or contact us at info@kinetech.com
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
    gap: 12,
  },
  icon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: palette.bg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  description: {
    color: palette.muted,
    textAlign: "center",
    lineHeight: 22,
  },
  section: {
    marginBottom: 32,
    gap: 16,
  },
  features: {
    gap: 12,
  },
  feature: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  featureText: {
    flex: 1,
    lineHeight: 20,
  },
  benefits: {
    gap: 16,
  },
  benefit: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  benefitText: {
    flex: 1,
    lineHeight: 20,
  },
  process: {
    gap: 20,
  },
  step: {
    flexDirection: "row",
    gap: 16,
  },
  stepNumber: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: palette.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  stepText: {
    color: palette.white,
    fontSize: 16,
  },
  stepContent: {
    flex: 1,
    gap: 4,
  },
  stepTitle: {
    color: palette.fg,
  },
  stepDesc: {
    color: palette.muted,
    lineHeight: 20,
  },
  cta: {
    alignItems: "center",
    marginTop: 16,
    gap: 12,
  },
  ctaText: {
    color: palette.muted,
    textAlign: "center",
  },
});