import { useEffect } from "react";
import { View } from "react-native";
import { useRouter } from "expo-router";
import { getSupabase } from "../../src/lib/supabase";

export default function Index() {
  const router = useRouter();
  useEffect(() => {
    const sb = getSupabase();
    sb?.auth.getSession().then(({ data }) => {
      router.replace(data.session ? "/(tabs)" : "/(auth)/sign-in");
    });
  }, [router]);
  return <View style={{ flex: 1 }} />;
}
