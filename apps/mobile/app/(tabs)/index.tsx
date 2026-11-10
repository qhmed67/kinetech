import React from "react";
import { View, Text, Alert } from "react-native";
import { Card, Button, Input } from "@kinetech/ui-native";
import { color } from "@kinetech/tokens";
import { signInWithDb, signUpWithDb } from "../../src/auth";

export default function Home() {
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const handleSignIn = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please enter both email and password");
      return;
    }

    setLoading(true);
    try {
      await signInWithDb(email, password);
      Alert.alert("Success", "Signed in successfully!");
      // Navigation will happen automatically through the auth check
    } catch (error) {
      Alert.alert("Error", "Failed to sign in. Please check your credentials.");
      console.error("Sign in error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async () => {
    if (!email || !password) {
      Alert.alert("Error", "Please enter both email and password");
      return;
    }

    // For simplicity, we'll use the same email for name and track
    const name = email.split("@")[0];
    const phone = "";
    const track = "courses" as const;

    setLoading(true);
    try {
      await signUpWithDb({
        email,
        password,
        name,
        phone,
        track,
      });
      Alert.alert("Success", "Signed up successfully! Please sign in.");
    } catch (error) {
      Alert.alert("Error", "Failed to sign up. Please try again.");
      console.error("Sign up error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.bg, padding: 20 }}>
      <Card style={{ marginBottom: 20 }}>
        <Text style={{ fontSize: 24, marginBottom: 20, fontFamily: "Alexandria", fontWeight: "700" }}>
          Welcome to KineTech
        </Text>
        <Input 
          label="Email" 
          placeholder="Enter your email"
          value={email}
          onChangeText={setEmail}
          style={{ marginBottom: 16 }}
        />
        <Input 
          label="Password" 
          placeholder="Enter your password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          style={{ marginBottom: 20 }}
        />
        <Button 
          title="Sign In" 
          onPress={handleSignIn}
          disabled={loading}
          style={{ marginBottom: 10 }}
        />
        <Button 
          title="Sign Up" 
          variant="secondary"
          onPress={handleSignUp}
          disabled={loading}
        />
      </Card>
    </View>
  );
}
