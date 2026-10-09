import { describe, expect, it } from "vitest";
import { renderEmail } from "../src/mail/template";

const id = {
  fromName: "Equipe Test",
  fromAddress: "equipe@exemple-test.fr",
  agendaText: "agenda.exemple-test.fr/30min",
  signature: "Prénom NOM\nFonction",
};

describe("gabarit d'e-mail", () => {
  it("insère l'agenda avant la formule de politesse, puis la signature", () => {
    const m = renderEmail({ subject: " Objet ", body: "Bonjour A,\n\nCorps.\n\nCordialement," }, id);
    expect(m.subject).toBe("Objet");
    expect(m.from).toBe("Equipe Test <equipe@exemple-test.fr>");
    expect(m.paragraphs.map((p) => p.type)).toEqual(["text", "text", "agenda", "text", "signature"]);
    expect(m.text).toBe(
      "Bonjour A,\n\nCorps.\n\nPour échanger : agenda.exemple-test.fr/30min\n\nCordialement,\n\nPrénom NOM\nFonction",
    );
  });

  it("place l'agenda à la fin sans formule de politesse", () => {
    const m = renderEmail({ subject: "x", body: "Bonjour,\r\n\r\nUn seul message." }, id);
    expect(m.paragraphs.map((p) => p.type)).toEqual(["text", "text", "agenda", "signature"]);
  });

  it("échappe le HTML du corps (aucune injection)", () => {
    const m = renderEmail({ subject: "x", body: 'Bonjour <script>alert("x")</script> & co' }, id);
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.html).toContain("&amp; co");
  });

  it("conserve les retours à la ligne simples dans un paragraphe", () => {
    const m = renderEmail({ subject: "x", body: "Ligne 1\nLigne 2" }, id);
    expect(m.html).toContain("Ligne 1<br>Ligne 2");
  });
});
