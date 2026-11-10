import React from "react";
import { View, Text, Alert } from "react-native";
import { useRouter } from "expo-router";
import { Card, Button, Input } from "@kinetech/ui-native";
import { color } from "@kinetech/tokens";
import { signInWithDb } from "../../src/auth";

export default function SignIn() {
  const router = useRouter();
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
      // Navigate to home after successful sign-in
      router.replace("/(tabs)");
    } catch (error) {
      Alert.alert("Error", "Failed to sign in. Please check your credentials.");
      console.error("Sign in error:", error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: color.bg, padding: 20 }}>
      <Card style={{ marginBottom: 20 }}>
        <Text style={{ fontSize: 24, marginBottom: 20, fontFamily: "Alexandria", fontWeight: "700" }}>
          Sign In
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
        />
      </Card>
    </View>
  );
}