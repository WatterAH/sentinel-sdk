# Evidencia S23: Decisión de Piloto y Plan Comercial

## Resumen de Ejecución
- **Fecha:** 2026-09-28
- **Tarea:** S23 — Decisión de piloto y plan comercial
- **Estado:** DONE
- **Dictamen:** `CONDITIONAL_GO_FOR_SUPERVISED_PILOT`

---

## 1. Dictamen Go / No-Go y Alcance Acotado

### Decisión
**CONDITIONAL GO** para la realización de un piloto controlado y supervisado con **1 único socio B2B / plataforma en México** (volumen máximo: $50,000\text{ conversaciones/mes}$).

### Condiciones Mandatorias para Despliegue en Tráfico Real
1. **Designación y Acreditación de Moderador Humano (`rev_XXXX`):** Si el socio o equipo no dispone de un revisor humano capacitado en la bandeja `/moderation`, el sistema conmuta automáticamente a **NO-GO FOR ACTIVE ACTIONS**, operando únicamente en **Modo Sombra Pasivo / Auditoría Histórica**.
2. **Cero Tolerancia a Bloqueos Falsos:** Si ocurre $1$ bloqueo falso comprobado en producción activa, la política conmuta de inmediato a modo observación sin acción de bloqueo automático.
3. **Acuerdo de Procesamiento de Datos (DPA) Firmado:** Consentimiento formal para ingestión seudónima, retención de 30 días de mensajes crudos y aislamiento por `api_key_hash`.

---

## 2. Economía Unitaria y Estructura de Costos (por 1,000 Conversaciones)

Basado en las mediciones empíricas de los benchmarks y ensayos controlados (S12, S14, S16, S20):

| Componente de Costo | Base de Cálculo / Métricas Medidas | Costo por 1,000 Conversaciones (USD) |
|---|---|---|
| **Cómputo Local & SDK** | Inferencia determinista CPU local ($p95 = 0.88\text{ ms}$) + Infraestructura VPS | $\approx \$0.80\text{ USD}$ |
| **Inferencia LLM (Escalación)** | Tasa de escalación $3.32\%$ ($33.2 / 1,000$), modelo LLaMA 3.3 70B ($\approx 1\text{k tokens}$) | $\approx \$0.08\text{ USD}$ |
| **Moderación Humana Supervisada** | $33.2\text{ fichas / 1k convs}$, $45\text{ seg/ficha}$, tarifa $\$12\text{ USD/hora}$ | $\approx \$4.98\text{ USD}$ |
| **Total Costo Operativo Directo** | **Suma de cómputo, IA y supervisión humana** | **$\approx \$5.86\text{ USD} / 1,000\text{ convs}$** |

> [!NOTE]
> El $85\%$ del costo operativo corresponde a la revisión humana de moderación, no al cómputo de IA. La hipótesis de precio para un esquema B2B sustentable se sitúa en $\$15 - \$25\text{ USD} / 1,000\text{ conversaciones}$ (incluyendo soporte y auditoría mensual).

---

## 3. Matriz de Propiedad Intelectual y Licencias

1. **Sentinel Core SDK (`@sentinel-sdk/typescript`):** Código propietario privado perteneciente a Sentinel.
2. **Laya Multilingüe (`convaiinnovations/laya-multilingual@v1.2.0`):** Licencia de código abierto Apache-2.0; integrado de forma no bloqueante y modular en modo sombra.
3. **Corpus de Entrenamiento y Evaluación:** Datasets sintéticos y pares contrastivos mexicanos protegidos bajo licencia CC-BY 4.0 con linaje y procedencia verificados en `data_sources` (S08, S09, S10).
4. **Firmas y Artefactos:** Autenticación criptográfica de complementos y diccionarios mediante firmas Ed25519 en servidor.

---

## 4. Criterios de Parada Inmediata (Kill Switches)

1. $\ge 1$ falso bloqueo en producción activa.
2. Exposición de datos inter-tenant o fallo en la derivación `api_key_hash`.
3. Gasto acumulado de llamadas a LLM superior a $\$50\text{ USD/semana}$.
4. Retraso en la resolución de la cola de moderación superior a $24\text{ horas}$.

---

## 5. Reporte y Verificación

- Reporte JSON estructurado: [`evidence/S23/commercial_plan_report.json`](file:///Users/luismerida/Documents/Sentinel%20-%20DreamTeam/sentinel-sdk/docs/plan-2026-09/evidence/S23/commercial_plan_report.json).
- Evaluador determinista: [`sentinel-sdk/scripts/evaluate_commercial_plan.py`](file:///Users/luismerida/Documents/Sentinel%20-%20DreamTeam/sentinel-sdk/scripts/evaluate_commercial_plan.py) ($\text{exit}=0$).
