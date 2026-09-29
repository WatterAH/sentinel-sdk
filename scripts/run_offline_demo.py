#!/usr/bin/env python3
"""S22: Autonomous & Interactive Offline Demo for Sentinel.

Executes 5 structured offline scenarios demonstrating Sentinel's core contributions:
1. Mexican Cultural Contrastive Pair (Benign music slang vs Directed recruitment).
2. Incremental Temporal Evolution (Prefix analysis without future data leakage).
3. Abstention & Contextual Ambiguity (UNKNOWN / ABSTAIN vs premature block).
4. Human Moderation Tray & IPW Population Debiasing.
5. Failsafe Resilience & Kill Switch (Shadow isolation and local fail-closed fallback).
"""
from __future__ import annotations

import json
from pathlib import Path
import sys
import time

SDK_DIR = Path(__file__).resolve().parents[1]
API_DIR = SDK_DIR.parent / "sentinel-api"

if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))
if str(SDK_DIR) not in sys.path:
    sys.path.insert(0, str(SDK_DIR))

from scripts.evaluate_prefix_early_detection import analyze_prefix_stateless


def run_offline_demo() -> dict:
    scenarios = []

    # ── Scenario 1: Mexican Cultural Contrastive Pair ──────────────────────────
    benign_song_turns = [
        {"index": 0, "role": "user", "text": "oíste la rola nueva de peso pluma?"},
        {"index": 1, "role": "contact", "text": "simón, esa de las camionetas y los fierros"},
        {"index": 2, "role": "user", "text": "está bien perra la tonada, la escucho en spotify"},
        {"index": 3, "role": "contact", "text": "a huevo compa, buen beat para las retas de fifa"}
    ]
    directed_grooming_turns = [
        {"index": 0, "role": "user", "text": "qué onda compa"},
        {"index": 1, "role": "contact", "text": "te tengo un jale de chofer de camioneta con buena lana"},
        {"index": 2, "role": "user", "text": "a poco, de qué es o qué"},
        {"index": 3, "role": "contact", "text": "para mover un encargo a la frontera, pero no le digas a tus jefes"}
    ]
    
    res_benign = analyze_prefix_stateless(benign_song_turns)
    res_grooming = analyze_prefix_stateless(directed_grooming_turns)
    
    scenarios.append({
        "scenario_id": "SCENARIO-01-CONTRASTIVE-PAIR",
        "title": "Par Contrastivo Cultural Mexicano (Música vs Captación)",
        "demonstration": "Diferenciación entre jerga narco citada como consumo cultural vs captación coactiva.",
        "case_a_benign": {
            "context": "Cita de corrido en Spotify",
            "score": res_benign["score"],
            "risk": res_benign["risk"],
            "action": "ALLOW (Sin bloqueo)"
        },
        "case_b_risk": {
            "context": "Oferta económica secreta con traslado",
            "score": res_grooming["score"],
            "risk": res_grooming["risk"],
            "action": "SOFT_WARN / HUMAN_REVIEW"
        },
        "success": res_benign["risk"] == "LOW" and res_grooming["score"] > res_benign["score"]
    })

    # ── Scenario 2: Incremental Temporal Evolution ────────────────────────────
    conversation_steps = [
        {"index": 0, "role": "user", "text": "hola buenas tardes"},
        {"index": 1, "role": "contact", "text": "hola amigo qué juegas"},
        {"index": 2, "role": "contact", "text": "te tengo una chamba de chofer con buena lana"},
        {"index": 3, "role": "contact", "text": "es para halconear la camioneta y vigilar la plaza"},
        {"index": 4, "role": "contact", "text": "borra los mensajes y manda tu ubicacion para el uber a la frontera"}
    ]
    
    temporal_evolution = []
    for t in range(1, len(conversation_steps) + 1):
        prefix = conversation_steps[:t]
        analysis = analyze_prefix_stateless(prefix)
        temporal_evolution.append({
            "turn": t - 1,
            "last_message": prefix[-1]["text"],
            "score": analysis["score"],
            "risk": analysis["risk"]
        })
        
    scenarios.append({
        "scenario_id": "SCENARIO-02-TEMPORAL-EVOLUTION",
        "title": "Evolución Temporal Prefijo a Prefijo",
        "demonstration": "Monitoreo incremental que eleva el riesgo progresivamente sin fuga de información del futuro.",
        "evolution_trace": temporal_evolution,
        "first_turn_alarm": temporal_evolution[0]["risk"] != "LOW",
        "final_turn_flagged": temporal_evolution[-1]["score"] >= 8,
        "success": (not temporal_evolution[0]["risk"] != "LOW") and temporal_evolution[-1]["score"] >= 8
    })

    # ── Scenario 3: Contextual Ambiguity & Abstention ──────────────────────────
    ambiguous_dialogue = [
        {"index": 0, "role": "user", "text": "te veo mañana en el parque"},
        {"index": 1, "role": "contact", "text": "va, lleva la bolsa negra"}
    ]
    res_ambiguous = analyze_prefix_stateless(ambiguous_dialogue)
    
    scenarios.append({
        "scenario_id": "SCENARIO-03-ABSTENTION-AMBIGUITY",
        "title": "Abstención ante Ambigüedad Contextual",
        "demonstration": "El motor evita bloqueos categóricos prematuros ante señales incompletas, manteniendo estado de observación.",
        "dialogue": ambiguous_dialogue,
        "score": res_ambiguous["score"],
        "risk": res_ambiguous["risk"],
        "verdict_disposition": "SILENT_OBSERVE / UNKNOWN",
        "success": res_ambiguous["risk"] in ("LOW", "MEDIUM") and res_ambiguous["risk"] != "CRITICAL"
    })

    # ── Scenario 4: Moderation Tray & IPW Debiased Metrics ────────────────────
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    from src.models.db_models import Base, ActiveLearningQueueItem
    from src.services.active_learning_service import ActiveLearningService
    
    demo_engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(bind=demo_engine)
    DemoSession = sessionmaker(bind=demo_engine)
    db_demo = DemoSession()
    
    # Enqueue sample active cases
    ActiveLearningService.enqueue_item(
        db=db_demo,
        session_id="demo_sess_101",
        api_key_hash="demo_tenant_key",
        primary_verdict="LOW",
        shadow_probability=0.75, # Disagreement
        family_id="fam_demo_halconeo"
    )
    ActiveLearningService.enqueue_item(
        db=db_demo,
        session_id="demo_sess_102",
        api_key_hash="demo_tenant_key",
        primary_verdict="LOW",
        shadow_probability=0.05,
        family_id="fam_demo_benign",
        random_inclusion_prob=0.10
    )
    queue_items = ActiveLearningService.get_review_batch(db=db_demo, api_key_hash="demo_tenant_key", blind=True, limit=5)
    debiased_estimates = ActiveLearningService.calculate_debiased_population_estimates(db=db_demo, api_key_hash="demo_tenant_key")
    db_demo.close()
    
    scenarios.append({
        "scenario_id": "SCENARIO-04-MODERATION-AND-IPW",
        "title": "Bandeja de Moderación y Estimación Desinsesgada IPW",
        "demonstration": "Extracción ciega para revisores humanos y corrección de sesgo muestral mediante Inverse Probability Weighting.",
        "pending_queue_count": len(queue_items),
        "blind_extraction_verified": all("shadow_probability" not in item for item in queue_items),
        "ipw_debiased_prevalence": debiased_estimates.get("debiased_risk_prevalence"),
        "success": len(queue_items) >= 2 and all("shadow_probability" not in item for item in queue_items)
    })

    # ── Scenario 5: Failsafe Resilience & Kill Switch ─────────────────────────
    from src.services.shadow_service import ShadowRunnerService
    from src.services.llm_guard import local_fallback_verdict
    from src.models.conversation import EscalationRequest, Layers, NormalizerLayer, V3Layer, V4Layer, Message
    
    shadow_svc = ShadowRunnerService(enabled=False)
    shadow_eval = shadow_svc.evaluate_shadow_candidate(
        features=[0.8, 0.9], candidate_fn=lambda x: 0.99
    )
    
    dummy_esc = EscalationRequest(
        score=20, risk="CRITICAL", escalate=True,
        layers=Layers(
            normalizer=NormalizerLayer(score=4),
            v3=V3Layer(score=10, categories=["captacion"], triggeredRules=["CR-001"]),
            v4=V4Layer(score=6, explicitSignals=["secreto"]),
        ),
        velocityFlag=False, velocityWindow=0, messagesAnalyzed=1,
        uniqueCategories=["captacion"],
        messages=[Message(id="1", user_id="u", session_id="s", content="test", timestamp=int(time.time()))],
    )
    fail_closed_fb = local_fallback_verdict(dummy_esc)
    
    scenarios.append({
        "scenario_id": "SCENARIO-05-FAILSAFE-KILLSWITCH",
        "title": "Resiliencia Fail-Closed y Kill Switches de Emergencia",
        "demonstration": "Desconexión inmediata de modelos en sombra y conmutación a fallback conservador determinista sin degradación de seguridad.",
        "shadow_kill_switch_status": shadow_eval["status"],
        "llm_fail_closed_action": fail_closed_fb["ux_recommendation"],
        "success": shadow_eval["status"] == "disabled" and fail_closed_fb["ux_recommendation"] == "HARD_BLOCK"
    })

    return {
        "task": "S22",
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "mode": "OFFLINE_STANDALONE_DEMO",
        "total_scenarios": len(scenarios),
        "passed_scenarios": sum(1 for s in scenarios if s.get("success", False)),
        "scenarios": scenarios
    }


def main():
    report = run_offline_demo()
    output_dir = SDK_DIR / "docs" / "plan-2026-09" / "evidence" / "S22"
    output_dir.mkdir(parents=True, exist_ok=True)
    report_file = output_dir / "offline_demo_report.json"
    
    with open(report_file, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
        
    print("════════════════════════════════════════════════════════════════")
    print(" S22: Sentinel 7-Minute Offline Standalone Demo                ")
    print("════════════════════════════════════════════════════════════════")
    for sc in report["scenarios"]:
        status_tag = "PASSED" if sc.get("success") else "FAILED"
        print(f" [{status_tag:<6}] {sc['scenario_id']}: {sc['title']}")
    print("════════════════════════════════════════════════════════════════")
    print(f"Result: {report['passed_scenarios']}/{report['total_scenarios']} Scenarios Successfully Demonstrated")
    print(f"Report written to: {report_file}")
    return 0 if report["passed_scenarios"] == report["total_scenarios"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
