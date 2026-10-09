from collections.abc import Callable

from fastapi.testclient import TestClient

from tests.test_generation_api import signed_in

ClientFactory = Callable[..., TestClient]

FIELDS = [
    {"name": "name", "label": "Имя", "type": "text", "required": True},
    {"name": "phone", "label": "Телефон", "type": "tel", "required": True},
    {"name": "note", "label": "Комментарий", "type": "textarea", "required": False},
]


def create_form(client: TestClient) -> str:
    response = client.post("/v1/forms", json={"name": "Запись", "fields": FIELDS})
    assert response.status_code == 201, response.text
    form_id: str = response.json()["id"]
    return form_id


def test_visitor_submits_and_owner_reads(client_factory: ClientFactory) -> None:
    owner = signed_in(client_factory, "owner")
    form_id = create_form(owner)
    visitor = TestClient(owner.app)

    sent = visitor.post(
        f"/v1/forms/{form_id}/submissions",
        json={"name": " Aziza ", "phone": "+998901234567", "extra": "dropped"},
    )

    assert sent.status_code == 201
    rows = owner.get(f"/v1/forms/{form_id}/submissions").json()
    assert rows[0]["data"] == {"name": "Aziza", "phone": "+998901234567", "note": ""}
    assert owner.get("/v1/forms").json()[0]["submissions"] == 1


def test_required_fields_and_unknown_forms(client_factory: ClientFactory) -> None:
    owner = signed_in(client_factory, "owner")
    form_id = create_form(owner)

    missing = owner.post(f"/v1/forms/{form_id}/submissions", json={"name": "A"})
    assert missing.status_code == 422
    assert missing.json()["detail"] == "required:phone"
    assert owner.post("/v1/forms/nope/submissions", json={}).status_code == 404


def test_honeypot_submissions_are_silently_dropped(client_factory: ClientFactory) -> None:
    owner = signed_in(client_factory, "owner")
    form_id = create_form(owner)

    bot = owner.post(
        f"/v1/forms/{form_id}/submissions",
        json={"name": "x", "phone": "1", "_hp": "http://spam"},
    )

    assert bot.status_code == 201
    assert owner.get(f"/v1/forms/{form_id}/submissions").json() == []


def test_submissions_are_rate_limited(client_factory: ClientFactory) -> None:
    owner = signed_in(client_factory, "owner")
    form_id = create_form(owner)
    body = {"name": "A", "phone": "1"}

    codes = [
        owner.post(f"/v1/forms/{form_id}/submissions", json=body).status_code for _ in range(6)
    ]

    assert codes == [201, 201, 201, 201, 201, 429]


def test_only_the_owner_reads_submissions(client_factory: ClientFactory) -> None:
    owner = signed_in(client_factory, "owner")
    form_id = create_form(owner)
    stranger = signed_in(client_factory, "stranger")

    assert stranger.get(f"/v1/forms/{form_id}/submissions").status_code == 404
    assert stranger.get("/v1/forms").json() == []


def test_form_fields_are_validated(client_factory: ClientFactory) -> None:
    owner = signed_in(client_factory, "owner")
    bad = [{"name": "Bad Name!", "label": "x", "type": "text", "required": True}]

    assert owner.post("/v1/forms", json={"name": "x", "fields": bad}).status_code == 422
    dup = [FIELDS[0], FIELDS[0]]
    assert owner.post("/v1/forms", json={"name": "x", "fields": dup}).status_code == 422
