// Texto de la política de cancelación (mismo cálculo que el servidor).
function textoPolitica(cfg) {
  cfg = cfg || {};
  if (cfg.politicaTexto && String(cfg.politicaTexto).trim()) return String(cfg.politicaTexto).trim();
  const n = parseInt(cfg.cancelarDias, 10), dias = Number.isFinite(n) && n >= 0 ? n : 1;
  const antes = dias <= 1 ? "hasta el día anterior a tu cita" : `hasta ${dias} días antes de tu cita`;
  return `Puedes cancelar o cambiar tu cita ${antes} y se te devuelve el pago completo. Si cancelas ${dias <= 1 ? "el mismo día de la cita" : "después de ese plazo"}, el pago no es reembolsable.`;
}
