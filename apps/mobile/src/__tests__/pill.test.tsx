import { Pill } from "@kinetech/ui-native";
import { render } from "@testing-library/react-native";

describe("Pill (ui-native)", () => {
  it("renders the label", async () => {
    const screen = await render(<Pill label="STUDENT" />);
    expect(screen.getByText("STUDENT")).toBeTruthy();
  });

  it("renders in soft tone without throwing", async () => {
    const screen = await render(<Pill label="Baccalaureate" tone="soft" />);
    expect(screen.getByText("Baccalaureate")).toBeTruthy();
  });
});
