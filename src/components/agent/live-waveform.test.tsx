/** @jest-environment jsdom */
import { render } from "@testing-library/react";

import { LiveWaveform } from "./live-waveform";

describe("LiveWaveform", () => {
  test("renderiza exatamente barCount barras", () => {
    const { container } = render(
      <LiveWaveform stream={null} active={false} barCount={12} />,
    );
    // cada barra é um <span>; o container raiz é um <div>.
    expect(container.querySelectorAll("span").length).toBe(12);
  });

  test("não quebra sem AudioContext (jsdom) com stream null e active", () => {
    expect(() =>
      render(<LiveWaveform stream={null} active barCount={8} />),
    ).not.toThrow();
  });

  test("usa 24 barras por padrão", () => {
    const { container } = render(<LiveWaveform stream={null} active={false} />);
    expect(container.querySelectorAll("span").length).toBe(24);
  });
});
