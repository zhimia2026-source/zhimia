"""GitHub Actions adapter for the supervised ZHI Python Worker."""
from __future__ import annotations

import json
import os
from pathlib import Path
import sys
import tempfile
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from python_worker.runner import run_job


def post(api_url: str, secret: str, payload: dict) -> dict:
    request = Request(
        api_url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "x-zhi-worker-secret": secret},
        method="POST",
    )
    try:
        with urlopen(request, timeout=20) as response:
            body = response.read(256_000)
            return json.loads(body.decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, ValueError) as exc:
        raise RuntimeError("worker_api_request_failed") from exc


def main() -> int:
    job_id = os.environ.get("JOB_ID", "")
    api_url = os.environ.get("ZHI_WORKER_API_URL", "")
    secret = os.environ.get("ZHI_PYTHON_WORKER_SECRET", "")
    if not job_id or not api_url.startswith("https://") or len(secret) < 32:
        print("worker_configuration_missing")
        return 2
    try:
        claimed = post(api_url, secret, {"action": "claim_job", "job_id": job_id})
        job = claimed.get("job")
        if not claimed.get("ok") or not isinstance(job, dict):
            print("job_claim_failed")
            return 1
        with tempfile.TemporaryDirectory(prefix="zhi-python-worker-") as workspace:
            envelope = run_job(job, Path(workspace))
        completed = post(api_url, secret, {"action": "complete_job", "job_id": job_id, "result": envelope})
        if not completed.get("ok"):
            print("job_completion_callback_failed")
            return 1
        print("zhi_python_job_completed")
        return 0
    except Exception:
        try:
            post(api_url, secret, {"action": "fail_job", "job_id": job_id, "error_code": "worker_execution_failed"})
        except Exception:
            pass
        print("zhi_python_job_failed")
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
