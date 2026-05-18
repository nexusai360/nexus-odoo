/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FamilyFilter } from "./family-filter";

const opcoes = [{ id: 2, nome: "Esteiras" }, { id: 5, nome: "Anilhas" }];

function Controlled({ onChange }: { onChange: (v: string) => void }) {
  const [v, setV] = useState("");
  return (
    <FamilyFilter
      value={v}
      onChange={(nv) => {
        setV(nv);
        onChange(nv);
      }}
      options={opcoes}
    />
  );
}

describe("FamilyFilter", () => {
  it("renderiza o rótulo e o trigger", () => {
    render(<FamilyFilter value="" onChange={() => {}} options={opcoes} />);
    expect(screen.getByText("Família")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });
  it("abre o popup com a opção 'Todas as famílias'", () => {
    render(<FamilyFilter value="" onChange={() => {}} options={opcoes} />);
    fireEvent.click(screen.getByRole("combobox"));
    expect(
      screen.getByRole("option", { name: "Todas as famílias" }),
    ).toBeInTheDocument();
  });
  it("dispara onChange ao escolher uma família", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<Controlled onChange={onChange} />);
    fireEvent.click(screen.getByRole("combobox"));
    const opt = await screen.findByRole("option", { name: "Esteiras" });
    await user.click(opt);
    expect(onChange).toHaveBeenCalledWith("2");
  });
});
