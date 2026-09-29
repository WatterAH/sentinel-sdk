#!/usr/bin/env python3
"""S21: Pilot Runbook & Operational Reproducibility Evaluation.

Tests and verifies:
1. Environment configuration sanity (.env.example audit, zero leaked secrets).
2. Idempotent database schema migration.
3. Database backup and disaster recovery restoration with integrity verification.
4. Message retention purge respecting Legal Hold on evidence packages.
5. Kill switch behavior: shadow model deactivation & LLM provider fail-closed fallback.
6. Health check response verification.
"""
from __future__ import annotations

import json
import os
import shutil
import sqlite3
import sys
import tempfile
import time
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

SDK_DIR = Path(__file__).resolve().parents[1]
API_DIR = SDK_DIR.parent / "sentinel-api"

if str(API_DIR) not in sys.path:
    sys.path.insert(0, str(API_DIR))
if str(SDK_DIR) not in sys.path:
    sys.path.insert(0, str(SDK_DIR))


def run_evaluation() -> dict:
    results: list[dict] = []
    
    # ─── 1. Audit .env.example for zero secrets ────────────────────────────────
    env_example_path = API_DIR / ".env.example"
    assert env_example_path.exists(), ".env.example does not exist"
    
    with open(env_example_path, "r", encoding="utf-8") as f:
        env_content = f.read()
        
    forbidden_tokens = ["sk-", "ghp_", "bearer ", "AIzaSy", "xoxb-"]
    leaked = [t for t in forbidden_tokens if t in env_content]
    assert len(leaked) == 0, f"Found leaked secret prefix in .env.example: {leaked}"
    
    results.append({
        "step": "CONFIG_AUDIT",
        "description": "Auditoría de .env.example: variables documentadas sin credenciales reales",
        "status": "PASSED",
        "details": {"file": ".env.example", "leaks_detected": 0}
    })

    # ─── 2. Idempotent Database Schema Creation ───────────────────────────────
    with tempfile.TemporaryDirectory() as tmpdir:
        test_db_path = os.path.join(tmpdir, "sentinel_test.db")
        db_url = f"sqlite:///{test_db_path}"
        engine = create_engine(db_url)
        
        from src.models import db_models
        from src.models.db_models import Base, Message, Session as DBSession, EvidencePackage
        
        # First creation
        Base.metadata.create_all(bind=engine)
        
        # Second idempotent creation
        Base.metadata.create_all(bind=engine)
        
        conn = sqlite3.connect(test_db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
        tables = [row[0] for row in cursor.fetchall()]
        conn.close()
        
        assert "messages" in tables
        assert "sessions" in tables
        assert "evidence_packages" in tables
        assert "api_keys" in tables
        
        results.append({
            "step": "IDEMPOTENT_MIGRATION",
            "description": "Creación e inicialización idempotente del esquema de base de datos",
            "status": "PASSED",
            "details": {"tables_created": len(tables), "tables": tables}
        })

        # ─── 3. Backup, Corruption & Restore Simulation ───────────────────────
        from src.services.maintenance_service import (
            backup_sqlite_database,
            restore_sqlite_database,
            purge_expired_messages,
        )
        
        SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
        db = SessionLocal()
        
        now = int(time.time())
        # Insert test records
        sess1 = DBSession(
            id="sess_001", created_at=now, last_activity=now, purge_at=now + 86400, api_key_hash="test_tenant_hash"
        )
        db.add(sess1)
        db.commit()
        
        # Create backup
        backup_path = os.path.join(tmpdir, "sentinel_backup.bak")
        backup_success = backup_sqlite_database(test_db_path, backup_path)
        assert backup_success and os.path.exists(backup_path)
        
        # Simulate data corruption / loss in active db
        conn = sqlite3.connect(test_db_path)
        conn.execute("DELETE FROM sessions WHERE id='sess_001';")
        conn.commit()
        conn.close()
        
        # Restore database
        restore_success = restore_sqlite_database(backup_path, test_db_path)
        assert restore_success
        
        # Verify restored record
        db.close()
        db = SessionLocal()
        restored_sess = db.query(DBSession).filter(DBSession.id == "sess_001").first()
        assert restored_sess is not None, "Restauración falló: registro no encontrado"
        
        results.append({
            "step": "BACKUP_AND_RESTORE",
            "description": "Respaldo y restauración de emergencia con verificación de integridad",
            "status": "PASSED",
            "details": {"backup_file": "sentinel_backup.bak", "integrity_verified": True}
        })

        # ─── 4. Message Purge with Legal Hold Protection ───────────────────────
        old_ts = now - (40 * 86400)  # 40 days ago (> 30 days retention)
        very_old_ts = now - (400 * 86400) # 400 days ago (> 365 days legal hold)
        
        from src.models.db_models import User
        u1 = User(id="u1_uuid", user_id="u1")
        u2 = User(id="u2_uuid", user_id="u2")
        sess_reg = DBSession(id="sess_regular", created_at=old_ts, last_activity=old_ts, purge_at=old_ts+86400)
        sess_inc = DBSession(id="sess_incident_001", created_at=old_ts, last_activity=old_ts, purge_at=old_ts+86400)
        db.add_all([u1, u2, sess_reg, sess_inc])
        db.commit()

        # 1. Old regular message (should be purged)
        msg_regular = Message(
            id="msg_old_reg", session_id="sess_regular", user_id="u1_uuid",
            content="mensaje viejo regular", timestamp=old_ts
        )
        # 2. Old message under Legal Hold (should be RETAINED)
        msg_legal_hold = Message(
            id="msg_legal_hold", session_id="sess_incident_001", user_id="u2_uuid",
            content="evidencia seudónima de incidente", timestamp=old_ts
        )
        # 3. Very old message under Legal Hold exceeding 365 days (should be purged)
        msg_expired_legal = Message(
            id="msg_expired_legal", session_id="sess_incident_001", user_id="u2_uuid",
            content="evidencia de mas de un año", timestamp=very_old_ts
        )
        
        # Add evidence package marking session under legal hold
        ep = EvidencePackage(
            id="ep_001",
            analysis_record_id="ar_001",
            session_id="sess_incident_001",
            api_key_hash="test_tenant_hash",
            canonical_payload="{}",
            content_hash="sha256_dummy_hash",
            created_at=now
        )
        db.add_all([msg_regular, msg_legal_hold, msg_expired_legal, ep])
        db.commit()
        
        purge_report = purge_expired_messages(db, retention_days=30, legal_hold_days=365)
        
        # Verify outcomes
        remaining_ids = {m.id for m in db.query(Message.id).all()}
        assert "msg_old_reg" not in remaining_ids, "Mensaje regular viejo no fue purgado"
        assert "msg_legal_hold" in remaining_ids, "Mensaje bajo Legal Hold fue erróneamente purgado"
        assert "msg_expired_legal" not in remaining_ids, "Mensaje legal superando 365 días no fue purgado"
        
        results.append({
            "step": "LEGAL_HOLD_PURGE",
            "description": "Purga periódica de mensajes respetando retención extendida por Legal Hold",
            "status": "PASSED",
            "details": purge_report
        })
        db.close()

    # ─── 5. Kill Switch Verification ──────────────────────────────────────────
    from src.services.shadow_service import ShadowRunnerService
    from src.services.llm_guard import local_fallback_verdict
    from src.models.conversation import EscalationRequest, Layers, NormalizerLayer, V3Layer, V4Layer, Message as ModelMessage
    
    # Test Shadow kill switch
    shadow_disabled = ShadowRunnerService(enabled=False)
    res_disabled = shadow_disabled.evaluate_shadow_candidate(
        features=[0.5, 0.5], candidate_fn=lambda x: 0.9
    )
    assert res_disabled["status"] == "disabled"
    assert res_disabled["shadow_probability"] is None
    
    # Test LLM fail-closed fallback
    dummy_req = EscalationRequest(
        score=18, risk="CRITICAL", escalate=True,
        layers=Layers(
            normalizer=NormalizerLayer(score=3),
            v3=V3Layer(score=10, categories=["captacion"], triggeredRules=["CR-001"]),
            v4=V4Layer(score=5, explicitSignals=["dinero"]),
        ),
        velocityFlag=False, velocityWindow=0, messagesAnalyzed=1,
        uniqueCategories=["captacion"],
        messages=[ModelMessage(id="1", user_id="u", session_id="s", content="test", timestamp=now)],
    )
    fallback = local_fallback_verdict(dummy_req)
    assert fallback["ux_recommendation"] == "HARD_BLOCK"
    assert fallback["_llm_unavailable"] is True

    results.append({
        "step": "KILL_SWITCH_TESTS",
        "description": "Verificación de Kill Switches para modelo sombra y fallback fail-closed para LLM",
        "status": "PASSED",
        "details": {
            "shadow_kill_switch": "PASSED",
            "llm_fail_closed_fallback": "PASSED"
        }
    })

    # ─── 6. Health Check Endpoint Test ────────────────────────────────────────
    from fastapi.testclient import TestClient
    from main import app
    
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    health_data = response.json()
    assert health_data["status"] == "ok"
    assert health_data["service"] == "SENTINEL"
    
    results.append({
        "step": "HEALTH_CHECK_ENDPOINT",
        "description": "Comprobación del endpoint /health de la API de Sentinel",
        "status": "PASSED",
        "details": health_data
    })

    return {
        "task": "S21",
        "timestamp": time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime()),
        "summary": {
            "total_steps": len(results),
            "passed_steps": sum(1 for r in results if r["status"] == "PASSED"),
            "failed_steps": sum(1 for r in results if r["status"] == "FAILED"),
            "operational_readiness": "READY_FOR_PILOT"
        },
        "operations_matrix": results,
        "runbook_reference": "sentinel-api/docs/PILOT_OPERATIONS_RUNBOOK.md"
    }


def main():
    report = run_evaluation()
    output_dir = SDK_DIR / "docs" / "plan-2026-09" / "evidence" / "S21"
    output_dir.mkdir(parents=True, exist_ok=True)
    report_file = output_dir / "pilot_operations_report.json"
    
    with open(report_file, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)
        
    print("════════════════════════════════════════════════════════════════")
    print(" S21: Pilot Operational Reproducibility & Runbook Verification  ")
    print("════════════════════════════════════════════════════════════════")
    for step in report["operations_matrix"]:
        print(f" [{step['status']:<6}] {step['step']}: {step['description']}")
    print("════════════════════════════════════════════════════════════════")
    print(f"Total: {report['summary']['passed_steps']}/{report['summary']['total_steps']} Steps Passed | Readiness: {report['summary']['operational_readiness']}")
    print(f"Report written to: {report_file}")
    return 0 if report["summary"]["failed_steps"] == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
