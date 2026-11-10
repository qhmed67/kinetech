import { useEffect, useState } from "react";
import {
  Modal,
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { palette } from "../theme";
import { Txt } from "./Txt";

interface ExamSheetProps {
  videoId: string | null;
  kind: "exam" | "assignment";
  onClose: () => void;
  onSubmitted?: () => void;
}

export function ExamSheet({ videoId, kind, onClose, onSubmitted }: ExamSheetProps) {
  const [visible, setVisible] = useState(false);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (videoId) {
      setVisible(true);
    } else {
      setVisible(false);
    }
  }, [videoId]);

  const questions = [
    {
      id: 1,
      text: "What is the main purpose of the course?",
      options: [
        "To teach programming basics",
        "To introduce robotics concepts",
        "To provide CAD/SolidWorks training",
        "To cover all of the above",
      ],
    },
    {
      id: 2,
      text: "Which programming language is primarily used?",
      options: ["Python", "JavaScript", "C++", "Java"],
    },
    {
      id: 3,
      text: "What is the duration of the course?",
      options: ["3 months", "6 months", "9 months", "12 months"],
    },
  ];

  const handleAnswer = (questionId: number, option: string) => {
    setAnswers(prev => ({
      ...prev,
      [questionId]: option,
    }));
  };

  const handleSubmit = () => {
    setSubmitted(true);
    // TODO: Submit answers to backend
    console.log("Submitted answers:", answers);
    setTimeout(() => {
      setVisible(false);
      onClose();
      onSubmitted?.();
    }, 1000);
  };

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Txt variant="h2">
              {kind === "exam" ? "Final Exam" : "Assignment"}
            </Txt>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Ionicons name="close" size={24} color={palette.fg} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.content}>
            {questions.map((question) => (
              <View key={question.id} style={styles.question}>
                <Txt variant="h3">{question.id}. {question.text}</Txt>
                <View style={styles.options}>
                  {question.options.map((option, index) => {
                    const isSelected = answers[question.id] === option;
                    return (
                      <TouchableOpacity
                        key={index}
                        style={[
                          styles.option,
                          isSelected && styles.optionSelected,
                        ]}
                        onPress={() => handleAnswer(question.id, option)}
                      >
                        <View style={[
                          styles.optionRadio,
                          isSelected && styles.optionRadioSelected,
                        ]}>
                          {isSelected && (
                            <View style={styles.optionRadioDot} />
                          )}
                        </View>
                        <Txt variant="small">{option}</Txt>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            ))}
          </ScrollView>

          {submitted ? (
            <View style={styles.submitContainer}>
              <Txt variant="h3" tone="teal">
                Submitted Successfully!
              </Txt>
            </View>
          ) : (
            <View style={styles.submitContainer}>
              <TouchableOpacity
                style={[
                  styles.submitButton,
                  Object.keys(answers).length < questions.length && styles.submitButtonDisabled,
                ]}
                onPress={handleSubmit}
                disabled={Object.keys(answers).length < questions.length}
              >
                <Txt variant="h3" tone="white">
                  Submit {kind === "exam" ? "Exam" : "Assignment"}
                </Txt>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  container: {
    backgroundColor: palette.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: palette.line,
  },
  closeButton: {
    padding: 8,
  },
  content: {
    flex: 1,
    padding: 20,
  },
  question: {
    marginBottom: 24,
  },
  options: {
    gap: 12,
    marginTop: 12,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    backgroundColor: palette.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: palette.line,
  },
  optionSelected: {
    backgroundColor: palette.accent + "10",
    borderColor: palette.accent,
  },
  optionRadio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: palette.line,
  },
  optionRadioSelected: {
    borderColor: palette.accent,
  },
  optionRadioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: palette.accent,
  },
  submitContainer: {
    padding: 20,
    borderTopWidth: 1,
    borderTopColor: palette.line,
  },
  submitButton: {
    backgroundColor: palette.accent,
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  submitButtonDisabled: {
    backgroundColor: palette.muted,
  },
});