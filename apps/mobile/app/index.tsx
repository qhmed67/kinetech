import { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { useRouter } from "expo-router";
import { getSupabase } from "../src/lib/supabase";

export default function Index() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const sb = getSupabase();
        if (!sb) {
          router.replace("/(auth)/sign-in");
          return;
        }

        const { data } = await sb.auth.getSession();
        if (data.session) {
          router.replace("/(tabs)");
        } else {
          router.replace("/(auth)/sign-in");
        }
      } catch (error) {
        console.error("Auth check error:", error);
        router.replace("/(auth)/sign-in");
      } finally {
        setIsLoading(false);
      }
    };

    checkAuth();
  }, [router]);

  if (isLoading) {
    return <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text>Loading...</Text>
    </View>;
  }

  return <View style={{ flex: 1 }} />;
}
