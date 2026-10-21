// Cuentas de la demo (ver supabase/migrations/0005_demo.sql).
// La demo solo aparece si DEMO_PASSWORD está configurada en el servidor.
export const CUENTAS_DEMO = {
  admin: "demo-admin@example.com",
  familia: "demo-familia@example.com",
} as const;

export const demoActiva = () => Boolean(process.env.DEMO_PASSWORD);

export const esCuentaDemo = (email: unknown) =>
  typeof email === "string" && (Object.values(CUENTAS_DEMO) as string[]).includes(email);
