// Mobile unit test setup. Keep mocks minimal — tests target pure logic.
jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => null),
  setItemAsync: jest.fn(async () => undefined),
  deleteItemAsync: jest.fn(async () => undefined),
}));

jest.mock("react-native", () => {
  const RN = jest.requireActual("react-native");
  // AppState listener used by src/lib/supabase.ts at import time.
  RN.AppState.addEventListener = jest.fn(() => ({ remove: jest.fn() }));
  return RN;
});

jest.mock("expo-haptics", () => ({
  notificationAsync: jest.fn(async () => undefined),
  NotificationFeedbackType: { Success: "success" },
}));

// Deterministic env for the anon-key role assertion.
process.env.EXPO_PUBLIC_SUPABASE_URL = "https://test.supabase.co";
process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = [
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
  Buffer.from(JSON.stringify({ role: "anon" })).toString("base64url"),
  "sig",
].join(".");
