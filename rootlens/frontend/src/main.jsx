import { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const api = import.meta.env.VITE_ANALYZER_URL || "http://localhost:8002";

const pageTitles = {
  overview: "Sistem görünümü",
  sources: "Telemetri kaynakları",
  incidents: "Olaylar",
  roadmap: "AI yol haritası",
  connect: "Sistem bağlantısı",
};

const stateLabels = {
  healthy: "Sistem bağlantıları hazır",
  attention: "Bağlantılar incelenmeli",
  waiting: "İlk kontrol bekleniyor",
};

const fallbackAi = {
  status: "planned",
  label: "Sonraki aşama",
  description:
    "Bu ilk sürümde yapay zekâ modeli aktif değildir. RootLens şu an gerçek telemetriyi toplar ve kaynakların erişilebilirliğini gösterir.",
  next_steps: [
    "Kural tabanlı anomali eşikleri",
    "Normal davranışı öğrenen anomali modeli",
    "Metrik, log ve trace kanıtlarıyla otomatik kök neden açıklaması",
  ],
};

function App() {
  const [page, setPage] = useState("overview");
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      const response = await fetch(api + "/dashboard");
      if (!response.ok) throw new Error("Dashboard response failed");
      setData(await response.json());
    } catch {
      setNotice("RootLens analiz servisine bağlanılamadı. Docker terminalinin açık olduğundan emin ol.");
    }
  };

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 15000);
    return () => clearInterval(interval);
  }, []);

  const collect = async () => {
    setBusy(true);
    setNotice("Prometheus, Jaeger ve OpenSearch kontrol ediliyor...");
    try {
      const response = await fetch(api + "/collect/now", { method: "POST" });
      const result = await response.json();
      const connected = [
        result.prometheus && "Prometheus",
        result.jaeger && "Jaeger",
        result.logs && "OpenSearch",
      ]
        .filter(Boolean)
        .join(", ");
      setNotice(
        connected
          ? "Kontrol tamamlandı: " + connected + " erişilebilir."
          : "Kontrol tamamlandı; erişilebilir kaynak bulunamadı.",
      );
      await refresh();
    } catch {
      setNotice("Kontrol sırasında bağlantı kurulamadı.");
    }
    setBusy(false);
  };

  const openConnection = async () => {
    setPage("connect");
    try {
      const response = await fetch(api + "/connection");
      if (!response.ok) throw new Error("Connection response failed");
      setForm(await response.json());
    } catch {
      setNotice("Bağlantı ayarları yüklenemedi.");
    }
  };

  const saveConnection = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch(api + "/connection", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!response.ok) throw new Error("Save failed");
      setNotice("Sistem bağlantısı kaydedildi. RootLens izlemeye devam ediyor.");
      await refresh();
      setPage("overview");
    } catch {
      setNotice("Bağlantı ayarları kaydedilemedi.");
    }
    setBusy(false);
  };

  const ai = data?.ai || fallbackAi;
  const connectedCount = useMemo(
    () => data?.sources?.filter((source) => source.status === "connected").length || 0,
    [data],
  );

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">R</span>
          <div>
            <strong>RootLens</strong>
            <small>Observability workspace</small>
          </div>
        </div>

        <div className="workspace-label">ÇALIŞMA ALANI</div>
        <nav>
          <NavItem
            active={page === "overview"}
            icon="◈"
            label="Genel Bakış"
            onClick={() => setPage("overview")}
          />
          <NavItem
            active={page === "sources"}
            icon="◌"
            label="Telemetri"
            onClick={() => setPage("sources")}
          />
          <NavItem
            active={page === "incidents"}
            icon="△"
            label="Olaylar"
            onClick={() => setPage("incidents")}
          />
          <NavItem
            active={page === "roadmap"}
            icon="✦"
            label="AI Yol Haritası"
            onClick={() => setPage("roadmap")}
          />
        </nav>

        <div className="sidebar-divider" />
        <button className="sidebar-action" onClick={openConnection}>
          <span>⌘</span>
          Sistem Bağla
        </button>

        <div className="sidebar-status">
          <div>
            <span className="pulse-dot" />
            Canlı izleme
          </div>
          <small>{data?.poll_seconds || 30} saniyede bir kontrol</small>
        </div>
      </aside>

      <main className="main-area">
        <header className="page-header">
          <div>
            <p className="eyebrow">ROOTLENS / MİKROSERVİS GÖZLEMLENEBİLİRLİĞİ</p>
            <h1>{pageTitles[page]}</h1>
          </div>
          <div className="header-actions">
            <span className="planned-chip">✦ AI modülü planlandı</span>
            <button className="refresh-button" onClick={collect} disabled={busy}>
              {busy ? "Kontrol ediliyor..." : "Şimdi yenile"}
            </button>
          </div>
        </header>

        {notice && <div className="notice">{notice}</div>}

        {page === "overview" && (
          <Overview
            ai={ai}
            connectedCount={connectedCount}
            data={data}
            onConnect={openConnection}
            onRoadmap={() => setPage("roadmap")}
          />
        )}
        {page === "sources" && <Sources data={data} onConnect={openConnection} />}
        {page === "incidents" && <Incidents data={data} />}
        {page === "roadmap" && <Roadmap ai={ai} />}
        {page === "connect" && (
          <ConnectionForm
            busy={busy}
            form={form}
            onSave={saveConnection}
            setForm={setForm}
          />
        )}
      </main>
    </div>
  );
}

function NavItem({ active, icon, label, onClick }) {
  return (
    <button className={"nav-item " + (active ? "active" : "")} onClick={onClick}>
      <span>{icon}</span>
      {label}
    </button>
  );
}

function Overview({ ai, connectedCount, data, onConnect, onRoadmap }) {
  const state = data?.state || "waiting";
  const sourceCount = data?.sources?.length || 3;

  return (
    <>
      <section className="demo-banner">
        <span>i</span>
        <div>
          <strong>Mevcut sürüm gözlemleme katmanıdır.</strong>
          <p>AI ekranı tasarım ve yol haritasını gösterir; model henüz çalıştırılmıyor.</p>
        </div>
      </section>

      <section className="overview-grid">
        <article className="hero-card">
          <div className="hero-topline">
            <span className={"live-badge " + state}>
              <i />
              {state === "healthy" ? "CANLI TELEMETRİ" : "BAĞLANTI DURUMU"}
            </span>
            <span className="target-name">{data?.target || "Astronomy Shop Demo"}</span>
          </div>
          <div className="hero-content">
            <div>
              <h2>{stateLabels[state]}</h2>
              <p>
                RootLens; mikroservis ortamından gelen metrik, log ve trace kaynaklarını
                tek ekranda kontrol eder.
              </p>
            </div>
            <div className={"system-orb " + state}>
              <span>{connectedCount}</span>
              <small>/{sourceCount}</small>
            </div>
          </div>
          <div className="hero-footnote">
            <span className="check-mark">✓</span>
            Şu an yapılan: kaynak erişilebilirliği ve canlı telemetri kontrolü
          </div>
          {state === "waiting" && (
            <button className="primary-button" onClick={onConnect}>
              İlk sistemi bağla
            </button>
          )}
        </article>

        <AiPreview ai={ai} onRoadmap={onRoadmap} />
      </section>

      <section className="stat-grid">
        <StatCard
          label="Bağlı kaynak"
          value={connectedCount + "/" + sourceCount}
          note="Metrik • Trace • Log"
          tone={connectedCount === sourceCount ? "green" : "amber"}
        />
        <StatCard
          label="Açık olay"
          value={data?.incidents?.length || 0}
          note="Otomatik olay üretimi planlandı"
          tone="blue"
        />
        <StatCard
          label="Son kontrol"
          value={data?.last_checked ? "Az önce" : "Bekliyor"}
          note={(data?.poll_seconds || 30) + " sn aralıkla"}
          tone="violet"
        />
      </section>

      <section className="content-panel">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">CANLI VERİ KATMANI</p>
            <h3>Kaynak durumu</h3>
          </div>
          <button className="text-button" onClick={onConnect}>
            Bağlantıları düzenle →
          </button>
        </div>
        <SourceList data={data} />
      </section>

      <section className="foundation-section">
        <div>
          <p className="eyebrow">MEVCUT KAPSAM</p>
          <h3>Bugün neyi gösterebiliyoruz?</h3>
          <p className="muted-copy">
            Sabit örnek veri değil, Docker üzerinde çalışan Astronomy Shop’un gerçek
            telemetrisi izleniyor.
          </p>
        </div>
        <div className="foundation-cards">
          <FoundationCard number="01" title="Metrik" text="Prometheus bağlantısı ve hedef sorgusu" />
          <FoundationCard number="02" title="Trace" text="Jaeger ile istek akışının erişilebilirliği" />
          <FoundationCard number="03" title="Log" text="OpenSearch indekslerinin kontrolü" />
        </div>
      </section>
    </>
  );
}

function AiPreview({ ai, onRoadmap }) {
  return (
    <article className="assistant-card">
      <div className="assistant-heading">
        <div>
          <span className="assistant-icon">✦</span>
          <div>
            <strong>RootLens Assistant</strong>
            <small>AI analiz alanı</small>
          </div>
        </div>
        <span className="model-off">MODEL KAPALI</span>
      </div>

      <div className="chat-window">
        <div className="chat-message user-message">
          Ödeme servisinde anomali var mı?
        </div>
        <div className="chat-message assistant-message">
          <span>✦</span>
          <p>
            Bu ilk sürümde AI modeli aktif değil. Şu anda önce gerçek
            metrik, log ve trace verilerini topluyoruz.
          </p>
        </div>
      </div>

      <div className="locked-composer">
        <span>AI analizi sonraki sürümde aktif olacak</span>
        <button disabled>Gönder</button>
      </div>

      <p className="assistant-caption">{ai.label}: {ai.next_steps[1]}</p>
      <button className="roadmap-link" onClick={onRoadmap}>
        Gelişim planını görüntüle <span>→</span>
      </button>
    </article>
  );
}

function StatCard({ label, value, note, tone }) {
  return (
    <article className={"stat-card " + tone}>
      <div className="stat-label">{label}</div>
      <strong>{value}</strong>
      <small>{note}</small>
    </article>
  );
}

function FoundationCard({ number, title, text }) {
  return (
    <article className="foundation-card">
      <span>{number}</span>
      <strong>{title}</strong>
      <small>{text}</small>
    </article>
  );
}

function SourceList({ data }) {
  const sources = data?.sources || [
    { name: "Prometheus", status: "waiting", detail: "İlk kontrol bekleniyor." },
    { name: "Jaeger", status: "waiting", detail: "İlk kontrol bekleniyor." },
    { name: "OpenSearch", status: "waiting", detail: "İlk kontrol bekleniyor." },
  ];

  return (
    <div className="source-grid">
      {sources.map((source) => (
        <article className="source-card" key={source.name}>
          <div className="source-card-top">
            <span className={"source-dot " + source.status} />
            <strong>{source.name}</strong>
            <span className={"source-status " + source.status}>
              {source.status === "connected"
                ? "Bağlı"
                : source.status === "unavailable"
                  ? "Ulaşılamıyor"
                  : "Bekliyor"}
            </span>
          </div>
          <p>{source.detail}</p>
        </article>
      ))}
    </div>
  );
}

function Sources({ data, onConnect }) {
  return (
    <>
      <section className="content-panel source-intro">
        <p className="eyebrow">ÜÇ FARKLI KANIT</p>
        <h2>Telemetriyi tek ekranda izle</h2>
        <p>
          RootLens şu an karar üretmez; veri kaynaklarının canlı olup olmadığını
          kontrol eder. Sonraki adımlardaki analiz bu veri katmanının üzerine kurulur.
        </p>
        <SourceList data={data} />
        <button className="primary-button" onClick={onConnect}>
          Sistem bağlantılarını aç
        </button>
      </section>

      <section className="explain-grid">
        <ExplainCard
          title="Prometheus"
          badge="METRİK"
          text="İstek sayısı, gecikme ve hata oranı gibi sayısal veriler buradan gelir."
        />
        <ExplainCard
          title="Jaeger"
          badge="TRACE"
          text="Bir isteğin hangi servislerden geçtiğini takip etmek için kullanılır."
        />
        <ExplainCard
          title="OpenSearch"
          badge="LOG"
          text="Servislerin hata ve çalışma kayıtları bu kaynakta tutulur."
        />
      </section>
    </>
  );
}

function ExplainCard({ badge, text, title }) {
  return (
    <article className="explain-card">
      <span>{badge}</span>
      <h3>{title}</h3>
      <p>{text}</p>
    </article>
  );
}

function Incidents({ data }) {
  const incidents = data?.incidents || [];
  return (
    <section className="content-panel">
      <p className="eyebrow">OLAY GEÇMİŞİ</p>
      <h2>Olaylar</h2>
      <p className="muted-copy">
        Otomatik anomali ve olay üretimi sonraki geliştirme aşamasında eklenecek.
      </p>
      {incidents.length ? (
        <div className="incident-list">
          {incidents.map((incident) => (
            <article className="incident-row" key={incident.id}>
              <span>{incident.severity}</span>
              <div>
                <strong>{incident.title}</strong>
                <p>{incident.evidence}</p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <span>△</span>
          <strong>Henüz olay kaydı yok</strong>
          <p>Bu prototipte sistem sağlığı ve veri kaynakları izleniyor.</p>
        </div>
      )}
    </section>
  );
}

function Roadmap({ ai }) {
  const steps = [
    {
      number: "01",
      title: "Gerçek telemetriyi bağlama",
      status: "Tamamlandı",
      state: "done",
      detail: "Astronomy Shop, Docker, Prometheus, Jaeger ve OpenSearch bağlantıları.",
    },
    {
      number: "02",
      title: "Eşik ve kontrollü hata senaryoları",
      status: "Sıradaki adım",
      state: "next",
      detail: "Hata oranı ve gecikme için basit, açıklanabilir kurallar tanımlama.",
    },
    {
      number: "03",
      title: "Anomali tespit modeli",
      status: "Planlandı",
      state: "planned",
      detail: "Normal davranışı öğrenip olağandışı değişimleri işaretleyen model.",
    },
    {
      number: "04",
      title: "Otomatik kök neden açıklaması",
      status: "Planlandı",
      state: "planned",
      detail: "Metrik, log ve trace kanıtlarından servis/kök neden adayı oluşturma.",
    },
  ];

  return (
    <>
      <section className="roadmap-hero">
        <div>
          <span className="roadmap-kicker">✦ PLANLANAN AI KATMANI</span>
          <h2>Önce doğru veriyi topluyoruz, sonra analiz ekliyoruz.</h2>
          <p>{ai.description}</p>
        </div>
        <div className="roadmap-hero-mark">AI</div>
      </section>

      <section className="roadmap-list">
        {steps.map((step) => (
          <article className={"roadmap-step " + step.state} key={step.number}>
            <span className="roadmap-number">{step.number}</span>
            <div>
              <div className="step-title-row">
                <h3>{step.title}</h3>
                <span>{step.status}</span>
              </div>
              <p>{step.detail}</p>
            </div>
          </article>
        ))}
      </section>

    </>
  );
}

function ConnectionForm({ busy, form, onSave, setForm }) {
  if (!form) return <div className="loading-card">Bağlantı ayarları yükleniyor...</div>;

  const change = (event) => {
    const { name, value } = event.target;
    setForm({
      ...form,
      [name]: name === "poll_seconds" ? Number(value) : value,
    });
  };

  const fields = [
    ["name", "Sistem adı", "Astronomy Shop Demo"],
    ["prometheus_url", "Prometheus adresi", "http://prometheus:9090"],
    ["jaeger_url", "Jaeger adresi", "http://jaeger:16686/jaeger/ui"],
    ["logs_url", "OpenSearch adresi", "http://opensearch:9200"],
    ["poll_seconds", "Kontrol sıklığı (saniye)", "30"],
  ];

  return (
    <form className="connection-form content-panel" onSubmit={onSave}>
      <p className="eyebrow">SİSTEM BAĞLANTISI</p>
      <h2>Mikroservis ortamını tanımla</h2>
      <p>
        RootLens bu adresleri kullanarak verileri okur. Çalışan sistemin verisini
        değiştirmez.
      </p>
      <div className="form-grid">
        {fields.map(([name, label, placeholder]) => (
          <label key={name}>
            {label}
            <input
              min={name === "poll_seconds" ? "10" : undefined}
              name={name}
              onChange={change}
              placeholder={placeholder}
              type={name === "poll_seconds" ? "number" : "text"}
              value={form[name]}
            />
          </label>
        ))}
      </div>
      <button className="primary-button" disabled={busy}>
        {busy ? "Kaydediliyor..." : "Bağlantıyı kaydet"}
      </button>
    </form>
  );
}

createRoot(document.getElementById("root")).render(<App />);
