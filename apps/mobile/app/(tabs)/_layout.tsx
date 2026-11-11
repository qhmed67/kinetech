import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { color } from "@kinetech/tokens";

type IonName = React.ComponentProps<typeof Ionicons>["name"];

function tabBarIcon(name: IonName) {
  return ({ color: c, size }: { focused: boolean; color: any; size: number }) => (
    <Ionicons name={name} size={size} color={typeof c === "string" ? c : color.ktBlack} />
  );
}

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: tabBarIcon("home") }} />
      <Tabs.Screen name="courses" options={{ title: "Courses", tabBarIcon: tabBarIcon("book") }} />
      <Tabs.Screen name="dashboard" options={{ title: "Dashboard", tabBarIcon: tabBarIcon("grid") }} />
    </Tabs>
  );
}
