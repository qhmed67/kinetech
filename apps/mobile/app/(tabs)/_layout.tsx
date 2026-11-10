import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { type ColorValue } from "react-native";

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: ({ color, size }) => <Ionicons name="home" size={size} color={typeof color === "string" ? color : "#000"} /> }} />
      <Tabs.Screen name="courses" options={{ title: "Courses", tabBarIcon: ({ color, size }) => <Ionicons name="book" size={size} color={typeof color === "string" ? color : "#000"} /> }} />
      <Tabs.Screen name="dashboard" options={{ title: "Dashboard", tabBarIcon: ({ color, size }) => <Ionicons name="grid" size={size} color={typeof color === "string" ? color : "#000"} /> }} />
    </Tabs>
  );
}
