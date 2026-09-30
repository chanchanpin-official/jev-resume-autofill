"""Local authenticated bridge; API keys and profile stay outside the extension."""
import argparse
import concurrent.futures
import hmac
import json
import os
import secrets
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

from engine import Engine, Catalog, ModelClient, ModelServiceError, redact
from model_config import setting
from pipeline import analyze
from profile_memory import save_answer
from form_support import get_support, complete_correction

ROOT = Path(__file__).resolve().parents[1]
PROFILE = ROOT / "profile" / "profile.json"
RUNTIME = ROOT / ".runtime"
JOBS = {}
LOCK = threading.Lock()
POOL = concurrent.futures.ThreadPoolExecutor(max_workers=3)
TOKEN = ""
PORT = 17321


def save_report(payload):
    """Persist field outcomes only, never form answers, model bodies or credentials."""
    report = payload.get("report", {})
    if not isinstance(report, dict) or not isinstance(report.get("items", []), list):
        raise ValueError("报告格式不正确")
    safe_text = lambda value, limit: redact(str(value))[:limit]
    items = []
    for item in report.get("items", [])[-600:]:
        if not isinstance(item, dict):
            continue
        row = {k: safe_text(item.get(k, ""), limit) for k, limit in (("label", 400), ("section", 250), ("reason", 350))}
        row["status"] = item.get("status") if item.get("status") in ("filled", "review", "error", "skip", "preserved") else "review"
        row["filled"] = item.get("filled") is True or row["status"] == "filled"
        row["required"] = item.get("required") if isinstance(item.get("required"), bool) else None
        row["issue_kind"] = safe_text(item.get("issue_kind", ""), 60)
        index = item.get("record_index")
        row["record_index"] = index if isinstance(index, int) and 0 <= index < 120 else None
        confidence = item.get("confidence")
        if isinstance(confidence, (float, int)) and 0 <= confidence <= 1:
            row["confidence"] = confidence
        items.append(row)
    saved = {"updated_at": time.time(), "running": report.get("running") is True,
             "progress": safe_text(report.get("progress", ""), 500), "version": safe_text(report.get("version", ""), 30),
             "queued": max(0, min(10000, int(report.get("queued", 0)))), "items": items}
    for key in ("total", "completed", "ready", "started_at", "finished_at"):
        value = report.get(key, 0)
        saved[key] = max(0, value) if isinstance(value, (int, float)) else 0
    saved["current_field"] = safe_text(report.get("current_field", ""), 400)
    saved["counts"] = {status: sum(i["status"] == status for i in items) for status in ("filled", "review", "error", "skip", "preserved")}
    saved["written"] = sum(i["filled"] for i in items)
    handoff = report.get("handoff")
    if isinstance(handoff, dict):
        groups=[]
        for group in handoff.get("groups", [])[:120]:
            if not isinstance(group, dict): continue
            index=group.get("record_index")
            groups.append({"section":safe_text(group.get("section", ""),250),
                "record_index":index if isinstance(index,int) and 0 <= index < 120 else None,
                "kind":safe_text(group.get("kind", ""),60),
                "required":group.get("required") is True,"unknown_required":group.get("unknown_required") is True,
                "filled":group.get("filled") is True,
                "labels":[safe_text(x,400) for x in group.get("labels",[])[:40]],
                "action":safe_text(group.get("action",""),350)})
        saved["handoff"]={"groups":groups,"recommendation":safe_text(handoff.get("recommendation",""),500),
            "required_groups":sum(g['required'] and not g['filled'] for g in groups),
            "unknown_required_groups":sum(not g['required'] and g['unknown_required'] and not g['filled'] for g in groups),
            "optional_groups":sum(not g['required'] and not g['unknown_required'] and not g['filled'] for g in groups),
            "text_review_groups":sum(g['filled'] for g in groups)}
    key = str(int(payload["tab_id"])) + ":" + str(int(payload.get("frame_id", 0)))
    with LOCK:
        RUNTIME.mkdir(exist_ok=True, mode=0o700)
        path = RUNTIME / "latest-reports.json"
        previous = json.loads(path.read_text()) if path.exists() else {}
        previous[key] = saved
        previous = dict(sorted(previous.items(), key=lambda x: x[1]["updated_at"])[-12:])
        temporary = path.with_suffix(".tmp")
        fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
        with os.fdopen(fd, "w") as stream:
            json.dump(previous, stream, ensure_ascii=False)
        temporary.replace(path)
    return {"ok": True}


def setup():
    RUNTIME.mkdir(exist_ok=True, mode=0o700)
    path = RUNTIME / "bridge-token"
    if not path.exists():
        path.write_text(secrets.token_urlsafe(32))
        path.chmod(0o600)
    token = path.read_text().strip()
    config = ROOT / "extension" / "local-config.js"
    config.write_text("// Local pairing token, NOT a model API key. Do not share this file.\n" +
                      "globalThis.LOCAL_CONFIG = " + json.dumps({"baseUrl": "http://127.0.0.1:"+str(PORT), "token": token}) + ";\n")
    config.chmod(0o600)
    return token


def run_job(job_id, payload):
    job = JOBS[job_id]
    def progress(message):
        with LOCK:
            job["progress"] = message
    def cancelled():
        return job.get("cancelled", False)
    try:
        high = float(payload.get("high", .85))
        low = float(payload.get("low", .60))
        if not 0 <= low < high <= 1:
            raise ValueError("阈值必须满足 0 ≤ low < high ≤ 1")
        engine = Engine(PROFILE, high=high, low=low)
        if not engine.catalog.candidates:
            raise ValueError("profile 为空；请使用 jev-profile skill 生成并核对个人资料")
        mode = payload.get("mode", "fields")
        if mode in ("fields", "section"):
            from application_scope import resolve_page
            from project_scope import resolve_projects
            payload = dict(payload, page=resolve_projects(engine, resolve_page(engine, payload.get("page", {}))))
        if mode == "fields":
            fields = payload.get("fields", [])
            if not isinstance(fields, list) or len(fields) > 120:
                raise ValueError("每批最多 120 个字段")
            if payload.get("stream") is True:
                with LOCK:
                    job.update(decisions=[], tasks={}, field_total=len(fields), field_completed=0)
                def publish(decision):
                    with LOCK:
                        if cancelled(): return
                        job["decisions"].append(decision)
                        job["field_completed"] = len(job["decisions"])
                def task_progress(index, title, state, detail):
                    with LOCK:
                        if cancelled(): return
                        job["tasks"][str(index)] = {"title": title, "state": state, "detail": detail}
                        job["progress"] = "并发分析：%s / %s 项已有结果" % (job["field_completed"], job["field_total"])
                records = payload.get("records", [])
                if not isinstance(records, list) or len(records) > 120:
                    raise ValueError("经历上下文过多或格式不正确")
                result = analyze(fields, PROFILE, high, low, payload.get("page", {}), publish, task_progress, cancelled, record_context=records)
            else:
                result = engine.decide(fields, payload.get("page", {}), progress, cancelled)
            if result.get("paused") and payload.get("client_version") not in ("0.1.4", "0.1.5", "0.1.6", "0.1.7", "0.1.8", "0.1.9", "0.1.10", "0.1.11", "0.1.12", "0.1.13", "0.1.14", "0.1.15", "0.1.16", "0.1.17", "0.1.18", "0.1.19", "0.1.20", "0.1.21", "0.1.22", "0.1.23", "0.1.24", "0.1.25", "0.1.26", "0.1.27", "0.1.28", "0.1.39", "0.1.40", "0.2.0"):
                # Older injected scripts do not understand partial paused results.
                # Return a job error so they stop instead of retrying the same batch.
                raise ModelServiceError(result["error"])
        elif mode == "options":
            progress("Jev 正在选择控件选项")
            result = engine.choose_options(payload["field"], payload["target"], payload["options"], payload.get("page", {}), payload.get("context"))
        elif mode == "editor":
            progress("Jev 正在判断简历栏目编辑操作")
            result = engine.choose_editor(payload.get("control", {}), payload.get("page", {}))
        elif mode == "section":
            progress("Jev 正在判断是否增加经历条目")
            result = engine.choose_section(payload.get("control", {}), payload.get("page", {}))
        else:
            raise ValueError("未知任务类型")
        with LOCK:
            job.update(status="cancelled" if cancelled() else "done", result=None if cancelled() else result)
    except Exception as exc:
        # Model client errors are sanitized. Avoid printing job/profile payloads.
        with LOCK:
            job.update(status="error", error=str(exc)[:250], error_code="model_service" if isinstance(exc, ModelServiceError) else "job_failure")


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def origin_ok(self):
        origin = self.headers.get("Origin", "")
        # CLI is allowed with token. Ordinary web pages are never allowed.
        return not origin or (origin.startswith("chrome-extension://") and len(origin.split("//", 1)[1]) == 32)

    def authorized(self):
        host = self.headers.get("Host", "")
        if host not in ("127.0.0.1:"+str(PORT), "localhost:"+str(PORT)) or not self.origin_ok():
            self.respond(403, {"error": "来源不允许"})
            return False
        supplied = self.headers.get("Authorization", "").removeprefix("Bearer ")
        if not hmac.compare_digest(supplied, TOKEN):
            self.respond(401, {"error": "本机服务未配对，请刷新插件或检查设置"})
            return False
        return True

    def respond(self, status, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        if self.origin_ok() and self.headers.get("Origin"):
            self.send_header("Access-Control-Allow-Origin", self.headers["Origin"])
            self.send_header("Vary", "Origin")
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_OPTIONS(self):
        if not self.origin_ok():
            return self.respond(403, {"error": "来源不允许"})
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", self.headers.get("Origin", "null"))
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Authorization, Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")
        self.end_headers()

    def do_GET(self):
        if not self.authorized():
            return
        path = urlsplit(self.path).path
        if path == "/health":
            try:
                client = ModelClient()
                data = json.loads(PROFILE.read_text(encoding="utf-8")) if PROFILE.is_file() else {}
                ready = isinstance(data, dict) and bool(Catalog(data).candidates)
                local = urlsplit(client.generator_base).hostname in ("127.0.0.1", "localhost", "::1")
                return self.respond(200, {"ok": True, "profile": ready,
                    "jev_configured": bool(ModelClient.credential("TYPESAFE_API_KEY")),
                    "generator_configured": bool(client.generator_model and (local or ModelClient.credential("LLM_API_KEY"))),
                    "generator_model": client.generator_model, "generator_protocol": client.protocol, "version": "0.2.0"})
            except Exception:
                return self.respond(200, {"ok": True, "profile": False, "jev_configured": False,
                    "generator_configured": False, "config_error": "profile 或本机 API 配置无效，请检查本机文件", "version": "0.2.0"})
        if path == "/form-support":
            return self.respond(200, get_support(PROFILE))
        if path == "/reports":
            with LOCK:
                report_path = RUNTIME / "latest-reports.json"
                reports = json.loads(report_path.read_text()) if report_path.exists() else {}
            return self.respond(200, {"reports": reports})
        if path.startswith("/jobs/"):
            with LOCK:
                job = JOBS.get(path.rsplit("/", 1)[1])
                data = {k: v for k,v in job.items() if k not in ("created",)} if job else None
            return self.respond(200 if job else 404, data or {"error": "任务已过期，请重新开始"})
        self.respond(404, {"error": "未找到"})

    def do_POST(self):
        if not self.authorized():
            return
        try:
            path = urlsplit(self.path).path
            size = int(self.headers.get("Content-Length", "0"))
            limit = 8 * 1024 * 1024 if path == "/diagnostics" else 512000
            if size <= 0 or size > limit:
                return self.respond(413, {"error": "请求过大或为空"})
            payload = json.loads(self.rfile.read(size))
            if path == "/diagnostics":
                if not isinstance(payload.get("fields"), list) or len(payload["fields"]) > 200:
                    return self.respond(400, {"error": "诊断格式不正确"})
                RUNTIME.mkdir(exist_ok=True, mode=0o700)
                fd = os.open(RUNTIME / "latest-structure.json", os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
                with os.fdopen(fd, "w") as stream:
                    stream.write(redact(json.dumps(payload, ensure_ascii=False)))
                return self.respond(200, {"saved": True})
            if path == "/reports":
                return self.respond(200, save_report(payload))
            if path == "/correction-complete":
                with LOCK:
                    return self.respond(200, complete_correction(PROFILE, payload.get("id")))
            if path == "/learn":
                with LOCK:
                    job = JOBS.get(payload.get("job_id"), {})
                    decisions = job.get("decisions", job.get("result", {}).get("decisions", []) if isinstance(job.get("result"), dict) else [])
                    decision = next((d for d in decisions if d.get("id") == payload.get("decision_id")), None)
                if not decision:
                    return self.respond(404, {"error": "经复核的字段结果已过期"})
                engine = Engine(PROFILE)
                return self.respond(200, save_answer(PROFILE, decision, engine.catalog.candidates))
            if path == "/jobs":
                with LOCK:
                    expired = [k for k,v in JOBS.items() if time.time()-v["created"] > 900 and v["status"] != "running"]
                    for key in expired:
                        del JOBS[key]
                    if sum(v["status"] == "running" for v in JOBS.values()) >= 6:
                        return self.respond(429, {"error": "任务过多，请等待或停止旧任务"})
                    job_id = secrets.token_urlsafe(18)
                    JOBS[job_id] = {"status": "running", "progress": "读取 profile", "created": time.time(), "cancelled": False}
                POOL.submit(run_job, job_id, payload)
                return self.respond(202, {"job_id": job_id})
            if path == "/cancel":
                with LOCK:
                    job = JOBS.get(payload.get("job_id"))
                    if job:
                        job.update(cancelled=True, status="cancelled", result=None)
                return self.respond(200, {"ok": True})
            if path == "/attachment":
                key = payload.get("attachment_id", "")
                if key not in ("latest_cn_pdf", "latest_en_pdf", "latest_bilingual_pdf", "latest_with_games_pdf"):
                    return self.respond(400, {"error": "附件不在允许列表"})
                # Also protects against old content scripts and saved recovery jobs.
                return self.respond(403, {"error": "所有附件由本人手动上传；自动上传与重新上传已关闭"})
            if path == "/models":
                client = ModelClient()
                model = client.discover_generator()
                return self.respond(200, {"model": model, "display_name": client.generator_display})
            self.respond(404, {"error": "未找到"})
        except Exception as exc:
            self.respond(400, {"error": str(exc)[:200]})


def main():
    global TOKEN, PORT, PROFILE
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=17321)
    parser.add_argument("--profile", type=Path, default=Path(setting("JEV_PROFILE_PATH", str(PROFILE))))
    parser.add_argument("--setup-only", action="store_true")
    args = parser.parse_args()
    PORT, PROFILE = args.port, args.profile.resolve()
    PROFILE.parent.mkdir(parents=True, exist_ok=True)
    if not PROFILE.exists():
        PROFILE.write_text("{}\n", encoding="utf-8")
        PROFILE.chmod(0o600)
    TOKEN = setup()
    if args.setup_only:
        print("本机配对配置已生成；模型密钥未写入插件。")
        return
    try:
        server = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    except OSError:
        import urllib.request
        try:
            request = urllib.request.Request("http://127.0.0.1:%d/health" % PORT, headers={"Authorization": "Bearer " + TOKEN})
            with urllib.request.urlopen(request, timeout=3) as response:
                existing = json.load(response)
            if existing.get("version") in ("0.1.0", "0.1.1", "0.1.2", "0.1.3", "0.1.4", "0.1.5", "0.1.6", "0.1.7", "0.1.8", "0.1.9", "0.1.10", "0.1.11", "0.1.12", "0.1.13", "0.1.14", "0.1.15", "0.1.16", "0.1.17", "0.1.18", "0.1.19", "0.1.20", "0.1.21", "0.1.22", "0.1.23", "0.1.24", "0.1.25", "0.1.26", "0.1.27", "0.1.28", "0.1.39", "0.1.40", "0.2.0"):
                print("本机服务已在运行（版本 %s）；代码升级后需结束旧服务再启动。" % existing["version"])
                return
        except Exception:
            pass
        raise SystemExit("端口 %d 已被占用，请检查后重试。" % PORT)
    pid_path = RUNTIME / "server.pid"
    pid_path.write_text(str(os.getpid()))
    print("Resume Autofill bridge: http://127.0.0.1:%d | profile: %s" % (PORT, PROFILE), flush=True)
    client = ModelClient()
    print("Jev configured: %s | LLM: %s" % (bool(ModelClient.credential("TYPESAFE_API_KEY")), client.generator_display), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        if pid_path.exists() and pid_path.read_text() == str(os.getpid()):
            pid_path.unlink()
        POOL.shutdown(wait=False)


if __name__ == "__main__":
    main()
