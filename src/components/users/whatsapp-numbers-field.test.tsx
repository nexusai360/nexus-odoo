/** @jest-environment jsdom */
/**
 * Cobre o campo de números de WhatsApp em modo rascunho (criação de usuário):
 * país padrão Brasil, composição do E.164 a partir de DDI + número nacional, e
 * o chip exibido já formatado. Modo rascunho não chama Server Actions, então o
 * teste é determinístico e não precisa de mocks de rede.
 */
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// Modo rascunho não chama Server Actions, mas o import do módulo "use server"
// arrasta `next/cache`, que não carrega no jsdom. Mockamos para isolar a UI.
jest.mock("@/lib/actions/user-whatsapp", () => ({
  addWhatsappNumber: jest.fn(),
  listWhatsappNumbers: jest.fn(),
  removeWhatsappNumber: jest.fn(),
}));

import { WhatsappNumbersField } from "./whatsapp-numbers-field";

describe("WhatsappNumbersField (rascunho)", () => {
  test("começa com o Brasil (+55) selecionado por padrão", () => {
    render(<WhatsappNumbersField onDraftChange={() => {}} />);
    expect(
      screen.getByRole("button", { name: /País: Brasil/ }),
    ).toBeInTheDocument();
  });

  test("adiciona um número compondo o E.164 e exibe o chip formatado", async () => {
    const user = userEvent.setup();
    const onDraftChange = jest.fn();
    render(<WhatsappNumbersField onDraftChange={onDraftChange} />);

    await user.type(
      screen.getByPlaceholderText("11 99123-4567"),
      "11991234567",
    );
    await user.click(screen.getByRole("button", { name: "Adicionar número" }));

    expect(onDraftChange).toHaveBeenLastCalledWith(["+5511991234567"]);
    expect(screen.getByText("+55 11 99123-4567")).toBeInTheDocument();
  });

  test("rejeita número brasileiro com quantidade de dígitos inválida", async () => {
    const user = userEvent.setup();
    render(<WhatsappNumbersField onDraftChange={() => {}} />);

    await user.type(screen.getByPlaceholderText("11 99123-4567"), "119");
    await user.click(screen.getByRole("button", { name: "Adicionar número" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      /DDD \+ número \(10 ou 11 dígitos\)/,
    );
  });
});
