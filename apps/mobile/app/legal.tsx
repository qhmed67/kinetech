import { RefreshControl, StyleSheet, View } from "react-native";
import { ScrollView } from "react-native";
import { palette } from "../src/theme";
import { Screen } from "../src/components/Screen";
import { Txt } from "../src/components/Txt";

export default function Legal() {
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
          <Txt variant="h1">Legal Information</Txt>
          <Txt variant="small" style={styles.subtitle}>
            Important terms and policies for using KineTech
          </Txt>
        </View>

        <View style={styles.section}>
          <Txt variant="title">Terms of Service</Txt>
          <Txt variant="small" style={styles.text}>
            Welcome to KineTech! These terms and conditions outline the rules and 
            regulations for the use of our mobile application. By accessing this app 
            we assume you accept these terms and conditions. Do not continue to use 
            KineTech if you do not agree to take all of the terms stated on this page.
          </Txt>
          <Txt variant="small" style={styles.text}>
            The following terminology applies to these Terms and Conditions, Privacy 
            Statement and Disclaimer Notice and all Agreements: Client, You and Your 
            refers to you, the person accessing this website and accepted the company's 
            terms and conditions. The Company, Ourselves, We, Our and Us refers to our 
            Company. Party, Parties, or Us, refers to both the Client and ourselves, 
            or either the Client or ourselves. All terms refer to the offer, acceptance 
            and consideration of payment necessary to undertake the process of our 
            assistance to the Client in the most appropriate manner for the express 
            purpose of meeting the Client's needs in respect of provision of the 
            Company's stated services, in accordance with and subject to, prevailing law 
            of Egypt. Any use of the terminology above or other words in the singular, 
            plural, capitalization and/or he/she or they, are taken as interchangeable 
            and therefore as referring to same.
          </Txt>
        </View>

        <View style={styles.section}>
          <Txt variant="title">Privacy Policy</Txt>
          <Txt variant="small" style={styles.text}>
            Your privacy is important to us. It is KineTech's policy to respect your 
            privacy regarding any information we may collect from you across our mobile 
            application, and other sites we own and operate.
          </Txt>
          <Txt variant="small" style={styles.text}>
            We only ask for personal information when we truly need it to provide a 
            service to you. We collect it by fair and lawful means, with your knowledge 
            and consent. We also let you know why we're collecting it and how it will 
            be used.
          </Txt>
          <Txt variant="small" style={styles.text}>
            We only retain collected information for as long as necessary to provide 
            you with your requested service. What data we store, we'll protect within 
            commercially acceptable means to prevent loss and theft, as well as 
            unauthorized access, disclosure, copying, use or modification.
          </Txt>
          <Txt variant="small" style={styles.text}>
            We don't share any personally identifying information publicly or with 
            third-parties, except when required by law. Our website may link to sites 
            operated by other parties. These are subject to their own privacy policies 
            and we do not accept any responsibility or liability for their policies or 
            practices.
          </Txt>
        </View>

        <View style={styles.section}>
          <Txt variant="title">Intellectual Property Rights</Txt>
          <Txt variant="small" style={styles.text}>
            Other than the content you own, under these Terms, KineTech and/or its 
            licensors own all the intellectual property rights and materials contained 
            in this app and all content provided by KineTech. You are granted a limited 
            license only for purposes of viewing the material contained on this app.
          </Txt>
          <Txt variant="small" style={styles.text}>
            Certain features of this app may be subject to additional guidelines, 
            terms and conditions. All supplementary guidelines incorporated by reference 
            are deemed to be a part of these Terms and Conditions.
          </Txt>
        </View>

        <View style={styles.section}>
          <Txt variant="title">Disclaimer</Txt>
          <Txt variant="small" style={styles.text}>
            To the fullest extent permitted by law, we exclude all liability for any 
            loss or damage arising in connection with this app or use of this app 
            (including, without limitation, any liability for loss of data or data 
            being rendered inaccurate or losses sustained by you or any third parties).
          </Txt>
          <Txt variant="small" style={styles.text}>
            Nothing in this disclaimer will limit or exclude our liability for death 
            or personal injury caused by our negligence, or for fraud or fraudulent 
            misrepresentation.
          </Txt>
        </View>

        <View style={styles.section}>
          <Txt variant="title">Changes to These Terms</Txt>
          <Txt variant="small" style={styles.text}>
            We may update our Terms and Conditions from time to time. We will notify 
            you of any changes by posting the new Terms and Conditions on this page 
            and updating the "Last Updated" date at the top. You are advised to review 
            this Terms and Conditions periodically for any changes.
          </Txt>
        </View>

        <View style={styles.footer}>
          <Txt variant="small" style={styles.contact}>
            For questions about these Terms and Conditions, please contact us:
          </Txt>
          <Txt variant="small" style={styles.contactInfo}>
            📧 Email: info@kinetech.com
          </Txt>
          <Txt variant="small" style={styles.contactInfo}>
            📱 WhatsApp: +20 104 203 1062
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
    gap: 12,
  },
  text: {
    lineHeight: 22,
    color: palette.fg,
  },
  footer: {
    alignItems: "center",
    marginTop: 32,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: palette.line,
  },
  contact: {
    color: palette.muted,
    textAlign: "center",
    marginBottom: 8,
  },
  contactInfo: {
    color: palette.fg,
    textAlign: "center",
  },
});