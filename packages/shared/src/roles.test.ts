import { describe, expect, it } from "vitest";
import { loginSchema } from "./auth";
import { CALL_STATUS_TO_STAGE, CALL_STATUSES, nextStageForCallStatus } from "./catalog";
import { hasRole } from "./roles";
import { createUserSchema } from "./users";

describe("hasRole", () => {
  it("respecte la hiérarchie ADMIN > MANAGER > AGENT > VIEWER", () => {
    expect(hasRole("ADMIN", "MANAGER")).toBe(true);
    expect(hasRole("MANAGER", "MANAGER")).toBe(true);
    expect(hasRole("AGENT", "MANAGER")).toBe(false);
    expect(hasRole("VIEWER", "AGENT")).toBe(false);
    expect(hasRole("VIEWER", "VIEWER")).toBe(true);
  });
});

describe("catalogue", () => {
  it("PB NUMERO n'a pas de correspondance d'étape (règle EXG-F-053)", () => {
    expect(CALL_STATUS_TO_STAGE["PB NUMERO"]).toBeUndefined();
    expect(CALL_STATUS_TO_STAGE["RDV fixé"]).toBe("RDV programmé");
    expect(CALL_STATUS_TO_STAGE.PI).toBe("Perdu");
    for (const s of CALL_STATUSES) {
      const stage = CALL_STATUS_TO_STAGE[s];
      if (stage) expect(typeof stage).toBe("string");
    }
  });
});

describe("schémas", () => {
  it("normalise l'e-mail de connexion", () => {
    const r = loginSchema.parse({ email: "  Kate@Example.COM ", password: "x" });
    expect(r.email).toBe("kate@example.com");
  });
  it("refuse un mot de passe trop court à la création", () => {
    const r = createUserSchema.safeParse({ email: "a@b.fr", name: "A", role: "AGENT", password: "court" });
    expect(r.success).toBe(false);
  });
});

describe("nextStageForCallStatus", () => {
  it("fait avancer un lead sans étape", () => {
    expect(nextStageForCallStatus(null, "NRP")).toBe("Contacté");
    expect(nextStageForCallStatus(null, "RDV fixé")).toBe("RDV programmé");
    expect(nextStageForCallStatus(null, "PI")).toBe("Perdu");
  });
  it("ne fait jamais reculer un lead plus avancé", () => {
    expect(nextStageForCallStatus("Négociation", "NRP")).toBe("Négociation");
    expect(nextStageForCallStatus("RDV effectué", "REPONDEUR")).toBe("RDV effectué");
    expect(nextStageForCallStatus("Contacté", "RDV fixé")).toBe("RDV programmé");
  });
  it("ne touche jamais aux états finaux ni aux statuts sans correspondance", () => {
    expect(nextStageForCallStatus("Gagné", "PI")).toBe("Gagné");
    expect(nextStageForCallStatus("Perdu", "RDV fixé")).toBe("Perdu");
    expect(nextStageForCallStatus("Contacté", "PB NUMERO")).toBe("Contacté");
    expect(nextStageForCallStatus("Répondu", null)).toBe("Répondu");
  });
});
