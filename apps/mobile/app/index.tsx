import React, { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { getSupabase } from "../src/lib/supabase";
import { Card, Button, Input } from "@kinetech/ui-native";
import { color } from "@kinetech/tokens";

type Status = "loading" | "signedIn" | "signedOut";

export default function Index() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sb = getSupabase();
        const session = sb ? (await sb.auth.getSession()).data.session : null;
        if (cancelled) return;
        if (session) {
          setStatus("signedIn");
        } else {
          setStatus("signedOut");
          router.replace("/sign-in");
        }
      } catch {
        if (!cancelled) {
          setStatus("signedOut");
          router.replace("/sign-in");
        }
      }
    })();
    return () => { cancelled = true; };
  }, [router]);

  if (status === "loading") {
    return <View style={{ flex: 1 }} />;
  }

  if (status === "signedOut") {
    return <View style={{ flex: 1 }} />;
  }

  // Signed in — render home screen content
  return (
    <View style={{ flex: 1, backgroundColor: color.bg, padding: 20 }}>
      <Card style={{ marginBottom: 20 }}>
        <Text style={{ fontSize: 24, marginBottom: 20, fontFamily: "Alexandria", fontWeight: "700" }}>
          Welcome to KineTech
        </Text>
        <Input
          label="Email"
          placeholder="Enter your email"
          style={{ marginBottom: 16 }}
        />
        <Input
          label="Password"
          placeholder="Enter your password"
          secureTextEntry
          style={{ marginBottom: 20 }}
        />
        <Button
          title="Sign In"
          onPress={() => {}}
          style={{ marginBottom: 10 }}
        />
        <Button
          title="Sign Up"
          variant="secondary"
          onPress={() => {}}
        />
      </Card>
    </View>
  );
}
