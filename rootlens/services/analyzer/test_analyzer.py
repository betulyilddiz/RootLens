import main


def use_temporary_database(monkeypatch, tmp_path):
    monkeypatch.setattr(main, "DB_PATH", str(tmp_path / "rootlens-test.db"))
    main.initialise()


def test_legacy_jaeger_address_is_migrated(monkeypatch, tmp_path):
    use_temporary_database(monkeypatch, tmp_path)
    with main.connection() as db:
        db.execute("UPDATE connections SET jaeger_url='http://jaeger:16686' WHERE id=1")

    main.initialise()

    assert main.settings()["jaeger_url"] == "http://jaeger:16686/jaeger/ui"


def test_dashboard_marks_ai_as_planned_not_active(monkeypatch, tmp_path):
    use_temporary_database(monkeypatch, tmp_path)

    result = main.dashboard()

    assert result["mode"] == "observability-only"
    assert result["ai"]["status"] == "planned"
    assert [item["name"] for item in result["sources"]] == ["Prometheus", "Jaeger", "OpenSearch"]
