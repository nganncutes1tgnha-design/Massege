"""Browser integration checks against intercepted, local-only Supabase fixtures.

Start Vite on 5180 with the local fixture URL/public key documented in README.
No actual emails, accounts, credentials or external database writes are used.
"""
import base64
import json
import os
import time
from urllib.parse import urlsplit, parse_qs
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("MASSEGE_AUTH_TEST_URL", "http://127.0.0.1:5180/")
API = "http://127.0.0.1:54321"
A = "00000000-0000-0000-0000-000000000001"
B = "00000000-0000-0000-0000-000000000002"
C = "00000000-0000-0000-0000-000000000003"
checks = []

def passed(label):
    checks.append(label)
    print("PASS:", label, flush=True)

def encoded(value):
    return base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")

def token(uid):
    return encoded({"alg": "HS256", "typ": "JWT"}) + "." + encoded({"sub": uid, "aud": "authenticated", "role": "authenticated", "exp": int(time.time()) + 3600}) + "." + encoded("local-test-signature")

def user(uid):
    return {"id": uid, "aud": "authenticated", "role": "authenticated", "email": "a@example.invalid" if uid == A else "b@example.invalid", "email_confirmed_at": "2026-01-01T00:00:00Z", "created_at": "2026-01-01T00:00:00Z", "app_metadata": {"provider": "email"}, "user_metadata": {"full_name": "Bạn A" if uid == A else "Bạn B"}, "identities": []}

def session(uid):
    return {"access_token": token(uid), "refresh_token": "local-only-test-refresh", "token_type": "bearer", "expires_in": 3600, "user": user(uid)}

profiles = {A: {"name": "Bạn A", "role": "Người yêu sách", "city": "Hà Nội", "bio": "Câu chuyện A", "interests": ["Sách"]}, B: {"name": "Bạn B", "role": "Yêu âm nhạc", "city": "Đà Nẵng", "bio": "Câu chuyện B", "interests": ["Âm nhạc"]}}
people = [{"id": B, "name": "Bạn B", "role": "Yêu âm nhạc", "city": "Đà Nẵng", "bio": "Câu chuyện B", "interests": ["Âm nhạc"], "mutual": 0, "color": "sage", "connection": "suggested"}, {"id": C, "name": "Bạn C", "role": "Thích cà phê", "city": "Hà Nội", "bio": "Câu chuyện C", "interests": ["Cà phê"], "mutual": 0, "color": "rose", "connection": "incoming"}]
calls = []
fail_connection = False

def handler(route):
    global fail_connection
    request = route.request
    url = urlsplit(request.url)
    body = json.loads(request.post_data or "{}") if request.method != "OPTIONS" else {}
    calls.append((request.method, url.path, body))
    authorization = request.headers.get("authorization", "")
    actor = A
    if authorization.startswith("Bearer ") and "." in authorization:
        part = authorization.removeprefix("Bearer ").split(".")[1]
        actor = json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4)))["sub"]
    status, response = 200, {}
    headers = {"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "GET,POST,PATCH,OPTIONS", "content-type": "application/json"}
    if request.method == "OPTIONS":
        route.fulfill(status=200, headers=headers, body="")
        return
    if url.path == "/auth/v1/token":
        if body.get("password") == "wrong-password":
            status, response = 400, {"error_code": "invalid_credentials", "msg": "Invalid login credentials"}
        else:
            response = session(B if body.get("email") == "b@example.invalid" else A)
    elif url.path == "/auth/v1/signup":
        response = user(A)
    elif url.path == "/auth/v1/recover":
        response = {}
    elif url.path == "/auth/v1/logout":
        status, response = 204, None
    elif url.path == "/auth/v1/user":
        response = user(actor)
    elif url.path == "/rest/v1/profiles":
        requested = parse_qs(url.query).get("id", ["eq." + actor])[0].replace("eq.", "")
        assert requested == actor, "Client tried to use another account's profile"
        if request.method == "PATCH":
            assert set(body) <= {"name", "role", "city", "bio", "interests"}
            profiles[actor].update(body)
            response = {"id": actor}
        else:
            response = profiles[actor]
    elif url.path == "/rest/v1/rpc/list_people":
        response = people if actor == A else []
    elif url.path.startswith("/rest/v1/rpc/"):
        if fail_connection:
            status, response = 400, {"code": "42501", "message": "fixture denied"}
            fail_connection = False
        else:
            command = url.path.rsplit("/", 1)[1]
            person = next(p for p in people if p["id"] == body["other_user"])
            person["connection"] = {"send_friend_request": "pending", "cancel_friend_request": "suggested", "accept_friend_request": "friend", "reject_friend_request": "suggested"}[command]
            response = None
    else:
        raise AssertionError("Unexpected fixture request " + url.path)
    route.fulfill(status=status, headers=headers, body="" if status == 204 else json.dumps(response))

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path="/usr/bin/chromium", headless=True, args=["--no-sandbox"])
    context = browser.new_context(viewport={"width": 1440, "height": 1000})
    context.route(API + "/**", handler)
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(BASE, wait_until="networkidle")
    expect(page.get_by_role("heading", name="Thật vui khi gặp lại bạn.")).to_be_visible()
    page.screenshot(path="/workspace/.onboarding/massege-login.png", full_page=True)
    passed("Login screen replaces the demo for a configured project")
    page.get_by_role("button", name="Tạo tài khoản", exact=True).click()
    page.get_by_role("textbox", name="Tên của bạn", exact=True).fill("Bạn A")
    page.get_by_role("textbox", name="Email", exact=True).fill("a@example.invalid")
    page.get_by_label("Mật khẩu", exact=True).fill("local-test-password")
    page.locator("form").get_by_role("button", name="Tạo tài khoản", exact=True).click()
    expect(page.get_by_role("status")).to_contain_text("Kiểm tra hộp thư")
    signup = next(body for method, path, body in calls if path == "/auth/v1/signup")
    assert signup["data"]["full_name"] == "Bạn A"
    passed("Signup sends profile name and waits for email confirmation")
    page.get_by_role("button", name="Đăng nhập", exact=True).click()
    page.get_by_role("textbox", name="Email", exact=True).fill("a@example.invalid")
    page.get_by_label("Mật khẩu", exact=True).fill("wrong-password")
    page.locator("form").get_by_role("button", name="Đăng nhập", exact=True).click()
    expect(page.get_by_role("alert")).to_have_text("Email hoặc mật khẩu chưa đúng.")
    passed("Invalid credentials produce a clear error")
    page.get_by_role("button", name="Quên mật khẩu?", exact=True).click()
    page.locator("form").get_by_role("button", name="Gửi liên kết đặt lại", exact=True).click()
    expect(page.get_by_role("status")).to_contain_text("Nếu email đã có tài khoản")
    passed("Password reset requests use a neutral confirmation")
    page.get_by_role("button", name="Đăng nhập", exact=True).click()
    page.get_by_label("Mật khẩu", exact=True).fill("local-test-password")
    page.locator("form").get_by_role("button", name="Đăng nhập", exact=True).click()
    expect(page.get_by_role("heading", name="Bạn A", exact=True)).to_be_visible()
    expect(page.locator(".person-card")).to_have_count(1)
    expect(page.get_by_text("Ngân Nguyễn", exact=True)).to_have_count(0)
    page.reload(wait_until="networkidle")
    expect(page.get_by_role("heading", name="Bạn A", exact=True)).to_be_visible()
    passed("Login and reload restore the real account rather than a sample profile")
    page.locator(".profile-card").get_by_role("button", name="Chỉnh sửa hồ sơ", exact=True).click()
    page.get_by_role("dialog").get_by_role("textbox", name="Tên của bạn", exact=True).fill("An đã cập nhật")
    page.get_by_role("dialog").get_by_role("button", name="Lưu hồ sơ").click()
    expect(page.get_by_role("heading", name="An đã cập nhật", exact=True)).to_be_visible()
    assert profiles[A]["name"] == "An đã cập nhật"
    passed("Profile changes are persisted through the backend")
    fail_connection = True
    page.locator(".person-card").get_by_role("button", name="Kết bạn", exact=True).click()
    expect(page.get_by_role("status")).to_contain_text("Chưa cập nhật được kết nối")
    expect(page.locator(".person-card").get_by_role("button", name="Kết bạn", exact=True)).to_be_visible()
    assert people[0]["connection"] == "suggested"
    passed("Failed mutations keep the existing connection state")
    page.locator(".person-card").get_by_role("button", name="Kết bạn", exact=True).click()
    expect(page.locator(".person-card").get_by_role("button", name="Đã gửi · Hủy")).to_be_visible()
    page.locator(".person-card").get_by_role("button", name="Đã gửi · Hủy").click()
    expect(page.locator(".person-card").get_by_role("button", name="Kết bạn", exact=True)).to_be_visible()
    page.locator(".small-request").get_by_role("button", name="Chấp nhận", exact=True).click()
    page.get_by_role("tab", name="Bạn bè", exact=True).click()
    expect(page.locator(".person-card")).to_have_count(1)
    expect(page.locator(".person-card")).to_contain_text("Bạn C")
    passed("Send, cancel and accept use the backend friendship RPCs")
    page.get_by_role("button", name="Đăng xuất", exact=True).click()
    expect(page.get_by_role("heading", name="Thật vui khi gặp lại bạn.")).to_be_visible()
    page.reload(wait_until="networkidle")
    expect(page.get_by_role("heading", name="Thật vui khi gặp lại bạn.")).to_be_visible()
    page.get_by_role("textbox", name="Email", exact=True).fill("b@example.invalid")
    page.get_by_label("Mật khẩu", exact=True).fill("local-test-password")
    page.locator("form").get_by_role("button", name="Đăng nhập", exact=True).click()
    expect(page.get_by_role("heading", name="Bạn B", exact=True)).to_be_visible()
    expect(page.get_by_role("heading", name="An đã cập nhật", exact=True)).to_have_count(0)
    expect(page.locator(".person-card")).to_have_count(0)
    passed("Logout clears the session; another account does not inherit profile data")
    page.get_by_role("button", name="Đăng xuất", exact=True).click()
    page.set_viewport_size({"width": 390, "height": 844})
    expect(page.get_by_role("heading", name="Thật vui khi gặp lại bạn.")).to_be_visible()
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    page.screenshot(path="/workspace/.onboarding/massege-login-mobile.png", full_page=True)
    page.get_by_role("button", name="Khám phá bản mẫu").click()
    expect(page.get_by_role("heading", name="Ngân Nguyễn", exact=True)).to_be_visible()
    page.get_by_role("button", name="Đăng nhập", exact=True).click()
    expect(page.get_by_role("heading", name="Thật vui khi gặp lại bạn.")).to_be_visible()
    passed("Mobile layout and optional sample exploration")
    assert not errors, errors
    context.close()
    recovery = browser.new_context(viewport={"width": 390, "height": 844})
    recovery.route(API + "/**", handler)
    page = recovery.new_page()
    page.goto(BASE + "#access_token=" + token(A) + "&refresh_token=local-only-test-refresh&expires_in=3600&token_type=bearer&type=recovery", wait_until="networkidle")
    expect(page.get_by_role("heading", name="Chọn mật khẩu mới")).to_be_visible()
    page.get_by_label("Mật khẩu mới", exact=True).fill("new-local-test-password")
    page.get_by_label("Nhập lại mật khẩu", exact=True).fill("different-local-test-password")
    page.get_by_role("button", name="Lưu mật khẩu", exact=True).click()
    expect(page.get_by_role("alert")).to_contain_text("chưa khớp")
    page.get_by_label("Nhập lại mật khẩu", exact=True).fill("new-local-test-password")
    page.get_by_role("button", name="Lưu mật khẩu", exact=True).click()
    expect(page.get_by_role("heading", name="Mật khẩu đã được cập nhật")).to_be_visible()
    page.get_by_role("button", name="Vào Massege").click()
    expect(page.get_by_role("heading", name="An đã cập nhật", exact=True)).to_be_visible()
    passed("Recovery links, confirmation and password update")
    recovery.close()
    browser.close()
    print(f"{len(checks)} local-fixture auth integration checks passed")
