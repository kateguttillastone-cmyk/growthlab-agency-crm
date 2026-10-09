import { describe, expect, it } from "vitest";
import { loginSchema } from "./auth";
import { planCall } from "./calls";
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

describe("planCall", () => {
  const fresh = { stage: null, callStatus: null, followup1: null, followup2: null } as const;

  it("range les essais successifs dans l'appel puis les relances, et devient injoignable au 3e sans réponse", () => {
    const first = planCall(fresh, "NRP");
    expect(first).toMatchObject({
      slot: "callStatus",
      callState: "À appeler",
      stage: "Contacté",
      attempts: 1,
    });
    const second = planCall({ ...fresh, callStatus: "NRP", stage: "Contacté" }, "REPONDEUR");
    expect(second).toMatchObject({ slot: "followup1", callState: "À appeler", attempts: 2 });
    const third = planCall({ ...fresh, callStatus: "NRP", followup1: "REPONDEUR", stage: "Contacté" }, "NRP");
    expect(third).toMatchObject({ slot: "followup2", callState: "Injoignable", attempts: 3 });
  });

  it("les issues définitives sortent de la file", () => {
    expect(planCall(fresh, "RDV fixé")).toMatchObject({ callState: "RDV fixé", stage: "RDV programmé" });
    expect(planCall(fresh, "PI")).toMatchObject({ callState: "Pas intéressé", stage: "Perdu" });
    expect(planCall(fresh, "PB NUMERO").callState).toBe("Injoignable");
    expect(planCall(fresh, "A RAP").callState).toBe("Répondu");
  });

  it("ne fait jamais reculer l'étape du pipeline", () => {
    expect(planCall({ ...fresh, stage: "RDV programmé" }, "NRP").stage).toBe("RDV programmé");
    expect(planCall({ ...fresh, stage: "Gagné" }, "PI").stage).toBe("Gagné");
  });

  it("réécrit la dernière relance quand toutes les cases sont pleines", () => {
    const full = { stage: "Contacté", callStatus: "NRP", followup1: "NRP", followup2: "NRP" } as const;
    expect(planCall(full, "RDV fixé")).toMatchObject({ slot: "followup2", callState: "RDV fixé" });
  });
});
