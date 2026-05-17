/**
 * @jest-environment jsdom
 */
import "@testing-library/jest-dom";
import { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WarehouseFilter } from "./warehouse-filter";

const opcoes = [{ id: 3, nome: "Galpão A" }, { id: 4, nome: "Galpão B" }];

function Controlled({ onChange }: { onChange: (v: string) => void }) {
  const [v, setV] = useState("");
  return (
    <WarehouseFilter
      value={v}
      onChange={(nv) => {
        setV(nv);
        onChange(nv);
      }}
      options={opcoes}
    />
  );
}

describe("WarehouseFilter", () => {
  it("renderiza o rótulo e o trigger", () => {
    render(<WarehouseFilter value="" onChange={() => {}} options={opcoes} />);
    expect(screen.getByText("Armazém")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });
  it("abre o popup com as opções incluindo 'Todos'", () => {
    render(<WarehouseFilter value="" onChange={() => {}} options={opcoes} />);
    fireEvent.click(screen.getByRole("combobox"));
    expect(
      screen.getByRole("option", { name: "Todos os armazéns" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Galpão A" })).toBeInTheDocument();
  });
  it("dispara onChange ao escolher um armazém", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<Controlled onChange={onChange} />);
    fireEvent.click(screen.getByRole("combobox"));
    const opt = await screen.findByRole("option", { name: "Galpão B" });
    await user.click(opt);
    expect(onChange).toHaveBeenCalledWith("4");
  });
});
