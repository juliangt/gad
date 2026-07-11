from starlette.requests import Request


def _make_request(headers=None, client=("10.0.0.1", 12345)):
    raw_headers = []
    if headers:
        for k, v in headers.items():
            raw_headers.append((k.lower().encode("latin-1"), v.encode("latin-1")))
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "raw_path": b"/",
        "headers": raw_headers,
        "query_string": b"",
        "client": client,
        "scheme": "http",
        "server": ("test", 80),
    }
    return Request(scope)


def test_uses_xff_first_hop_when_present():
    from gad.middleware.ip_key import client_ip_key

    req = _make_request(headers={"x-forwarded-for": "203.0.113.5, 10.0.0.1"})
    assert client_ip_key(req) == "203.0.113.5"


def test_falls_back_to_client_host_without_xff():
    from gad.middleware.ip_key import client_ip_key

    req = _make_request(client=("198.51.100.2", 5000))
    assert client_ip_key(req) == "198.51.100.2"


def test_handles_empty_xff():
    from gad.middleware.ip_key import client_ip_key

    req = _make_request(headers={"x-forwarded-for": ""}, client=("198.51.100.2", 5000))
    assert client_ip_key(req) == "198.51.100.2"


def test_returns_unknown_if_no_client():
    from gad.middleware.ip_key import client_ip_key

    req = _make_request(client=None)
    assert client_ip_key(req) == "unknown"
