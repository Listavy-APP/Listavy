import assert from "node:assert/strict";
import { test } from "node:test";
import { CLIENT_TOUR_STEPS, CLIENT_TOUR_STRINGS } from "./clientTour.ts";

test("the tour has three steps, each with kicker, title, subtitle and description", () => {
  assert.equal(CLIENT_TOUR_STEPS.length, 3);
  assert.deepEqual(CLIENT_TOUR_STEPS.map((s) => s.id), ["pide", "compara", "paga"]);
  for (const s of CLIENT_TOUR_STEPS) {
    assert.ok(s.kicker && s.title && s.subtitle && s.body, `step ${s.id} is complete`);
    assert.equal(s.kicker, s.kicker.toUpperCase(), `kicker of ${s.id} is all caps`);
  }
});

test("final copy, step by step", () => {
  const [a, b, c] = CLIENT_TOUR_STEPS;
  assert.equal(a.kicker, "TU LISTA DE PENDIENTES EMPIEZA AQUÍ");
  assert.equal(a.title, "Cuéntanos qué necesitas.");
  assert.equal(b.kicker, "ENCUENTRA A TU PERSONA");
  assert.equal(b.title, "Buena gente. Buen trabajo.");
  assert.equal(c.kicker, "ES UNA MENOS");
  assert.equal(c.title, "Hecho. Qué bien se siente.");
});

test("step 3 keeps the payment-protection sentence", () => {
  const c = CLIENT_TOUR_STEPS[2];
  assert.ok(c.body.startsWith("Elige a tu profesional, termina el trabajo y tacha una cosa más de tu lista."));
  assert.ok(c.body.endsWith("Tu pago queda retenido y se libera solo cuando apruebas el trabajo terminado."));
});

test("buttons, intro and footer strings", () => {
  assert.equal(CLIENT_TOUR_STRINGS.next, "Siguiente");
  assert.equal(CLIENT_TOUR_STRINGS.finish, "Empecemos");
  assert.equal(CLIENT_TOUR_STRINGS.skip, "Saltar");
  assert.equal(CLIENT_TOUR_STRINGS.introWordmark, "listavy");
  assert.equal(CLIENT_TOUR_STRINGS.introLine, "La vida es ajetreada. Hacemos que resolver sea más fácil.");
  assert.equal(CLIENT_TOUR_STRINGS.footer, "Tu lista de pendientes. Nuestra gente.");
  assert.equal(CLIENT_TOUR_STRINGS.stepOf(2, 3), "Paso 2 de 3");
});

console.log("client tour copy tests passed");
