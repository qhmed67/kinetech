import { Component, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { Button } from "@kinetech/ui-native";
import { palette } from "../theme";
import { Txt } from "./Txt";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Client-side error boundary: shows an honest, student-facing message and a
 *  retry action. Logs to console only (no PII, no gated URLs). */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    // Structured console log — kept minimal, no user data.
    console.error(
      JSON.stringify({
        event: "ui_error_boundary",
        error: { name: error.name, message: error.message },
        hasInfo: Boolean(info),
      }),
    );
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <View style={styles.container}>
        <View style={styles.card}>
          <Txt variant="h2" center>
            Something went wrong
          </Txt>
          <Txt variant="small" center style={styles.note}>
            An unexpected error occurred. Please try again — your progress is
            saved on our servers.
          </Txt>
          <Button
            title="Try again"
            onPress={() => this.setState({ error: null })}
          />
        </View>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: palette.bg,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderWidth: 1,
    borderColor: palette.line,
    borderRadius: 18,
    padding: 22,
    gap: 12,
    alignItems: "center",
  },
  note: {
    color: palette.muted,
  },
});
