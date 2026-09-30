import http.client
import json
import sys
import threading
import unittest
import tempfile
from unittest.mock import patch
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "bridge"))
import server


class BridgeTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        server.TOKEN = "unit-test-token"
        cls.httpd = server.ThreadingHTTPServer(("127.0.0.1", 0), server.Handler)
        server.PORT = cls.httpd.server_address[1]
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()

    def call(self, path="/health", method="GET", data=None, token=True, origin=None, host=None):
        connection = http.client.HTTPConnection("127.0.0.1", server.PORT, timeout=3)
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = "Bearer unit-test-token"
        if origin:
            headers["Origin"] = origin
        if host:
            headers["Host"] = host
        connection.request(method, path, body=None if data is None else json.dumps(data), headers=headers)
        response = connection.getresponse()
        body = response.read()
        result = response.status, dict(response.getheaders()), json.loads(body) if body else None
        connection.close()
        return result

    def test_authenticated_extension_health(self):
        status, headers, body = self.call(origin="chrome-extension://" + "a"*32)
        self.assertEqual(status, 200)
        self.assertTrue(body["ok"])
        self.assertNotIn("token", body)

    def test_token_required(self):
        self.assertEqual(self.call(token=False)[0], 401)

    def test_websites_cannot_read_bridge_even_with_token(self):
        status, headers, body = self.call(origin="https://recruit.example.com")
        self.assertEqual(status, 403)
        self.assertNotIn("Access-Control-Allow-Origin", headers)

    def test_dns_rebinding_host_rejected(self):
        self.assertEqual(self.call(host="malicious.example")[0], 403)

    def test_arbitrary_file_paths_rejected(self):
        self.assertEqual(self.call("/attachment", "POST", {"attachment_id": "../../profile/profile.private.json"})[0], 400)

    def test_legacy_clients_cannot_download_upload_files(self):
        for key in ('latest_cn_pdf', 'latest_en_pdf', 'latest_bilingual_pdf', 'latest_with_games_pdf'):
            status, _, body = self.call('/attachment', 'POST', {'attachment_id': key})
            self.assertEqual(status, 403)
            self.assertNotIn('base64', body)
            self.assertIn('手动上传', body['error'])

    def test_unknown_job_404(self):
        self.assertEqual(self.call("/jobs/missing")[0], 404)

    def test_cancel_job(self):
        server.JOBS["test"] = {"status": "running", "created": 0, "cancelled": False}
        self.assertEqual(self.call("/cancel", "POST", {"job_id": "test"})[0], 200)
        self.assertTrue(server.JOBS["test"]["cancelled"])

    def test_bad_threshold_is_job_error(self):
        server.JOBS["threshold"] = {"status": "running", "cancelled": False}
        server.run_job("threshold", {"high": .2, "low": .8})
        self.assertEqual(server.JOBS["threshold"]["status"], "error")

    def test_reports_persist_outcomes_without_answers_or_extra_payloads(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(server, "RUNTIME", Path(directory)):
            body = {"tab_id": 7, "frame_id": 0, "report": {"running": True, "queued": 9,
                "progress": "Jev 正在判断字段 1–8", "secret": "never-store",
                "items": [{"label": "院系", "section": "教育", "status": "filled", "confidence": .94,
                           "reason": "Jev 选择已有资料", "value": "private-answer", "raw_model": "never-store"}]}}
            self.assertEqual(self.call("/reports", "POST", body)[0], 200)
            status, _, result = self.call("/reports")
            self.assertEqual(status, 200)
            self.assertEqual(result["reports"]["7:0"]["counts"]["filled"], 1)
            saved = (Path(directory) / "latest-reports.json").read_text()
            self.assertNotIn("private-answer", saved)
            self.assertNotIn("never-store", saved)
            self.assertEqual((Path(directory) / "latest-reports.json").stat().st_mode & 0o777, 0o600)

    def test_reports_require_authentication(self):
        self.assertEqual(self.call("/reports", token=False)[0], 401)

    def test_handoff_report_keeps_actions_not_answers(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(server,'RUNTIME',Path(directory)):
            server.save_report({'tab_id':1,'report':{'items':[], 'finished_at':12,
                'handoff':{'recommendation':'Check required fields','groups':[{'section':'Education',
                    'labels':['School','Degree'],'required':True,'action':'Confirm record identity',
                    'value':'private-answer','raw_model':'never-store'}]}}})
            data=json.loads((Path(directory)/'latest-reports.json').read_text())['1:0']
            self.assertEqual(data['finished_at'],12)
            self.assertEqual(data['handoff']['groups'][0]['labels'],['School','Degree'])
            self.assertNotIn('private-answer',json.dumps(data))
            self.assertNotIn('never-store',json.dumps(data))

    def test_paused_result_stops_legacy_clients_and_preserves_new_partial_results(self):
        for version, expected in (("0.1.3", "error"), ("0.1.4", "done")):
            server.JOBS[version] = {"status": "running", "cancelled": False}
            with patch.object(server, "Engine") as engine:
                engine.return_value.catalog.candidates = {"fixture": {}}
                engine.return_value.decide.return_value = {"paused": True, "error": "outage", "decisions": [{"id": "f1", "status": "fill"}]}
                server.run_job(version, {"mode": "fields", "fields": [], "client_version": version})
            self.assertEqual(server.JOBS[version]["status"], expected)
            if expected == "done":
                self.assertEqual(len(server.JOBS[version]["result"]["decisions"]), 1)


if __name__ == "__main__":
    unittest.main()
