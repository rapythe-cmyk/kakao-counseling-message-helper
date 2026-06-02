import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  AlertTriangle,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ClipboardCopy,
  ClipboardList,
  FileCheck2,
  FileText,
  MessageCircle,
  MessageSquarePlus,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import sampleCases from "./sample-cases.json";
import "./styles.css";

const serviceTypes = ["초진 문의", "예약 안내", "비용 문의", "내원 전 준비", "시술 후 안내", "예약 변경"];
const toneOptions = ["친절하게", "간결하게", "전문적으로"];
const defaultManualCase = "허리 통증으로 한의원 방문이 처음인 고객이 카카오톡으로 예약 가능 시간과 준비물을 문의했다.";
const storageKey = "kakao-counseling-draft-history";
const analyticsKey = "kakao-counseling-week3-analytics";
const feedbackKey = "kakao-counseling-week3-feedback";

const riskRules = [
  { label: "효과 보장", terms: ["완치", "100% 효과", "무조건 좋아집니다", "치료 보장", "즉시 효과", "특효"] },
  { label: "비교·최상급", terms: ["최고", "유일", "1등", "독보적"] },
  { label: "개인정보 요청", terms: ["주민등록번호", "카드번호", "계좌 비밀번호", "신분증"] },
  { label: "가격 단정", terms: ["무조건 환불", "절대 추가 비용 없음", "최저가"] },
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

function findRiskFlags(text) {
  const normalized = text.replace(/\s+/g, " ");
  return riskRules
    .map((rule) => ({ label: rule.label, matches: rule.terms.filter((term) => normalized.includes(term)) }))
    .filter((rule) => rule.matches.length > 0);
}

function loadHistory() {
  try {
    return JSON.parse(localStorage.getItem(storageKey) || "[]");
  } catch {
    return [];
  }
}

function loadJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function getChannel() {
  const url = new URL(window.location.href);
  const from = url.searchParams.get("from") || url.searchParams.get("utm_source");
  if (from) return from;
  if (document.referrer.includes("notion")) return "notion";
  if (document.referrer) return "referral";
  return "direct";
}

function createEmptyAnalytics() {
  return {
    visits: 0,
    draftGenerated: 0,
    copied: 0,
    saved: 0,
    feedbackSubmitted: 0,
    byChannel: {},
    events: [],
  };
}

function buildMessage({ selectedCase, serviceType, tone, date }) {
  const intro =
    tone === "간결하게"
      ? "안녕하세요. 문의 주셔서 감사합니다."
      : tone === "전문적으로"
        ? "안녕하세요. 문의 주신 내용 확인했습니다. 내원 전 확인하실 사항을 안내드립니다."
        : "안녕하세요. 문의 주셔서 감사합니다. 편하게 확인하실 수 있도록 필요한 내용을 정리해드릴게요.";

  const typeGuide = {
    "초진 문의": ["첫 방문 시 문진과 상태 확인 시간이 필요해 여유 있게 예약해 주세요.", "진료 가능 여부와 필요한 관리는 의료진 상담 후 안내됩니다."],
    "예약 안내": ["원하시는 날짜와 시간대를 2~3개 남겨주시면 가능한 시간을 확인해드리겠습니다.", "예약 확정 전까지는 시간이 변경될 수 있습니다."],
    "비용 문의": ["비용은 상담 내용, 필요한 처치, 보험 적용 여부에 따라 달라질 수 있습니다.", "정확한 비용은 내원 후 상태 확인 뒤 안내드리겠습니다."],
    "내원 전 준비": ["편한 복장으로 방문해 주세요.", "최근 검사 결과나 복용 약 정보가 있다면 지참해 주세요."],
    "시술 후 안내": ["시술 후 불편감이나 특이 증상이 있으면 바로 연락해 주세요.", "무리한 운동, 음주, 장시간 같은 자세는 피하는 것이 좋습니다."],
    "예약 변경": ["변경을 원하시는 날짜와 시간대를 남겨주시면 확인해드리겠습니다.", "당일 변경은 대기 상황에 따라 어려울 수 있습니다."],
  };

  const message = [
    intro,
    "",
    "[문의 내용]",
    selectedCase.summary,
    "",
    "[안내 사항]",
    ...typeGuide[serviceType].map((item) => `- ${item}`),
    "- 정확한 상태 확인은 내원 상담과 진료 후 안내드릴 수 있습니다.",
    "- 증상 시작 시점, 불편한 부위, 악화되는 자세나 상황을 메모해 오시면 상담에 도움이 됩니다.",
    "- 기존 검사 자료나 복용 중인 약이 있다면 함께 알려주세요.",
    "",
    "[답장 요청]",
    "예약을 원하시면 성함, 연락처, 희망 날짜/시간대를 남겨주세요. 민감한 개인정보나 검사 사진은 카카오톡으로 먼저 보내지 마시고, 필요한 경우 내원 시 안내받아 주세요.",
    "",
    "※ 본 안내문은 카카오톡 상담 초안이며, 실제 발송 전 담당자가 환자 상황과 병원 운영 기준에 맞게 최종 확인해야 합니다.",
    "",
    `작성일: ${date}`,
  ].join("\n");

  return {
    message,
    checklist: [
      "효과 보장 표현을 쓰지 않았는가?",
      "정확한 진단이나 처치는 내원 후 안내된다고 설명했는가?",
      "불필요한 개인정보 전송을 요청하지 않았는가?",
      "예약 확정/비용 안내 조건이 과도하게 단정적이지 않은가?",
      "발송 전 담당자 최종 확인 문구가 포함되어 있는가?",
    ],
  };
}

function App() {
  const [date, setDate] = useState(today());
  const [sourceMode, setSourceMode] = useState("sample");
  const [manualCase, setManualCase] = useState(defaultManualCase);
  const [selectedCaseId, setSelectedCaseId] = useState(sampleCases[0].id);
  const [serviceType, setServiceType] = useState(sampleCases[0].type);
  const [tone, setTone] = useState("친절하게");
  const [draft, setDraft] = useState(null);
  const [draftText, setDraftText] = useState("");
  const [notice, setNotice] = useState("");
  const [history, setHistory] = useState(loadHistory);
  const [analytics, setAnalytics] = useState(() => loadJson(analyticsKey, createEmptyAnalytics()));
  const [feedback, setFeedback] = useState(() => loadJson(feedbackKey, []));
  const [feedbackForm, setFeedbackForm] = useState({
    role: "한의원 원장/실무자",
    score: "4",
    liked: "",
    issue: "",
    next: "",
  });

  useEffect(() => {
    if (sessionStorage.getItem("kakao-counseling-week3-visit")) return;
    sessionStorage.setItem("kakao-counseling-week3-visit", "1");
    const channel = getChannel();
    setAnalytics((previous) => {
      const next = {
        ...previous,
        visits: previous.visits + 1,
        byChannel: { ...previous.byChannel, [channel]: (previous.byChannel[channel] || 0) + 1 },
        events: [
          { id: `${Date.now()}-visit`, type: "방문", detail: channel, at: new Date().toISOString() },
          ...previous.events,
        ].slice(0, 12),
      };
      localStorage.setItem(analyticsKey, JSON.stringify(next));
      return next;
    });
  }, []);

  const cases = useMemo(() => {
    if (sourceMode === "manual") {
      return [{ id: "manual-case", title: "직접 입력 상담", type: serviceType, urgency: "보통", summary: manualCase }];
    }
    return sampleCases;
  }, [sourceMode, manualCase, serviceType]);

  const selectedCase = cases.find((item) => item.id === selectedCaseId) || cases[0];
  const riskFlags = useMemo(() => findRiskFlags(draftText), [draftText]);
  const feedbackAverage = useMemo(() => {
    if (!feedback.length) return 0;
    return Math.round((feedback.reduce((sum, item) => sum + item.score, 0) / feedback.length) * 10) / 10;
  }, [feedback]);
  const copyRate = analytics.draftGenerated ? Math.round((analytics.copied / analytics.draftGenerated) * 100) : 0;
  const strongestSignal =
    analytics.draftGenerated && !analytics.copied
      ? "초안 생성 뒤 복사까지 이어지는지 추가 확인 필요"
      : analytics.copied
        ? "생성된 안내문을 실제 발송 전 문구로 가져가려는 흐름이 확인됨"
        : "먼저 테스트 사용자에게 링크를 보내 사용 흐름을 확보해야 함";
  const qaStatus = useMemo(
    () => [
      { label: "샘플 상담 데이터 연결", pass: sampleCases.length >= 4 },
      { label: "직접 입력 모드 제공", pass: true },
      { label: "위험 표현 검수 작동", pass: true },
      { label: "카카오톡 자동 발송 제외", pass: true },
      { label: "환자 개인정보 저장 제외", pass: true },
      { label: "발송 전 담당자 확인 문구 포함", pass: draftText ? draftText.includes("실제 발송 전 담당자") : true },
    ],
    [draftText],
  );

  function selectCase(item) {
    setSelectedCaseId(item.id);
    setServiceType(item.type);
    setDraft(null);
    setDraftText("");
  }

  function generateDraft() {
    const nextDraft = buildMessage({ selectedCase, serviceType, tone, date });
    setDraft(nextDraft);
    setDraftText(nextDraft.message);
    recordAnalytics("draftGenerated", `${serviceType} · ${tone}`);
    setNotice("상담 안내문 초안이 생성됐습니다.");
  }

  async function copyDraft() {
    if (!draftText) return;
    await navigator.clipboard.writeText(draftText);
    recordAnalytics("copied", serviceType);
    setNotice("안내문을 클립보드에 복사했습니다.");
  }

  function saveDraft() {
    if (!draftText) return;
    const nextItem = {
      id: `${Date.now()}`,
      date,
      serviceType,
      tone,
      caseTitle: selectedCase.title,
      draftText,
      riskFlags,
      savedAt: new Date().toISOString(),
    };
    const nextHistory = [nextItem, ...history].slice(0, 5);
    localStorage.setItem(storageKey, JSON.stringify(nextHistory));
    localStorage.setItem("kakao-counseling-latest-draft", JSON.stringify(nextItem));
    setHistory(nextHistory);
    recordAnalytics("saved", serviceType);
    setNotice("브라우저에 최신 안내문을 저장했습니다.");
  }

  function recordAnalytics(type, detail) {
    const labels = {
      draftGenerated: "초안 생성",
      copied: "복사",
      saved: "저장",
      feedbackSubmitted: "피드백",
    };
    setAnalytics((previous) => {
      const next = {
        ...previous,
        [type]: (previous[type] || 0) + 1,
        events: [
          { id: `${Date.now()}-${type}`, type: labels[type] || type, detail, at: new Date().toISOString() },
          ...previous.events,
        ].slice(0, 12),
      };
      localStorage.setItem(analyticsKey, JSON.stringify(next));
      return next;
    });
  }

  function submitFeedback() {
    const liked = feedbackForm.liked.trim();
    const issue = feedbackForm.issue.trim();
    if (!liked || !issue) {
      setNotice("좋았던 점과 아쉬웠던 점을 모두 적어주세요.");
      return;
    }
    const nextItem = {
      id: `${Date.now()}`,
      role: feedbackForm.role.trim() || "테스트 사용자",
      score: Number(feedbackForm.score),
      liked,
      issue,
      next: feedbackForm.next.trim(),
      at: new Date().toISOString(),
    };
    const nextFeedback = [nextItem, ...feedback].slice(0, 8);
    localStorage.setItem(feedbackKey, JSON.stringify(nextFeedback));
    setFeedback(nextFeedback);
    recordAnalytics("feedbackSubmitted", `${nextItem.role} · ${nextItem.score}점`);
    setFeedbackForm({ role: "한의원 원장/실무자", score: "4", liked: "", issue: "", next: "" });
    setNotice("피드백을 기록했습니다.");
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Founders Week 3 · v0.2</p>
          <h1>상담 카톡 안내문 생성·검수 시스템</h1>
        </div>
        <div className="status-pill">
          <ShieldCheck size={18} />
          <span>발송 전 검수 중심</span>
        </div>
      </header>

      <section className="workspace" aria-label="상담 안내문 생성 작업대">
        <aside className="control-panel">
          <div className="panel-heading">
            <MessageCircle size={20} />
            <h2>상담 상황</h2>
          </div>

          <label className="field-label" htmlFor="date">
            <CalendarDays size={16} />
            작성일
          </label>
          <input id="date" className="input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />

          <div className="field-label">
            <Search size={16} />
            상담 소스
          </div>
          <div className="segmented" role="tablist" aria-label="상담 소스">
            <button className={sourceMode === "sample" ? "active" : ""} type="button" onClick={() => setSourceMode("sample")}>
              샘플
            </button>
            <button className={sourceMode === "manual" ? "active" : ""} type="button" onClick={() => setSourceMode("manual")}>
              직접 입력
            </button>
          </div>

          {sourceMode === "manual" && (
            <textarea className="textarea keyword-input" value={manualCase} onChange={(event) => setManualCase(event.target.value)} aria-label="직접 입력 상담 내용" />
          )}

          <label className="field-label" htmlFor="service-type">
            <FileCheck2 size={16} />
            안내 유형
          </label>
          <select id="service-type" className="input" value={serviceType} onChange={(event) => setServiceType(event.target.value)}>
            {serviceTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>

          <div className="field-label">
            <Sparkles size={16} />
            말투
          </div>
          <div className="segmented three">
            {toneOptions.map((option) => (
              <button className={tone === option ? "active" : ""} key={option} type="button" onClick={() => setTone(option)}>
                {option}
              </button>
            ))}
          </div>

          <div className="candidate-list" aria-label="상담 샘플 목록">
            {cases.map((item) => (
              <button className={`candidate ${selectedCase?.id === item.id ? "selected" : ""}`} key={item.id} type="button" onClick={() => selectCase(item)}>
                <span className="candidate-title">
                  <CheckCircle2 size={16} />
                  {item.title}
                </span>
                <span className="candidate-meta">
                  {item.type} · 긴급도 {item.urgency}
                </span>
                <span className="candidate-reason">{item.summary}</span>
              </button>
            ))}
          </div>

          <div className="history-box" aria-label="저장된 초안 이력">
            <div className="field-label">
              <Save size={16} />
              저장 이력
            </div>
            {history.length ? (
              history.map((item) => (
                <div className="history-item" key={item.id}>
                  <strong>{item.caseTitle}</strong>
                  <span>
                    {item.serviceType} · {new Date(item.savedAt).toLocaleString("ko-KR")}
                  </span>
                </div>
              ))
            ) : (
              <p>아직 저장된 초안이 없습니다.</p>
            )}
          </div>

          <button className="primary-action" type="button" onClick={generateDraft}>
            <Send size={18} />
            안내문 생성
          </button>
        </aside>

        <section className="draft-panel">
          <div className="panel-heading">
            <FileText size={20} />
            <h2>생성 결과</h2>
          </div>

          <div className="selected-summary">
            <MessageCircle size={16} />
            <strong>{selectedCase?.title}</strong>
            <span>{selectedCase?.summary}</span>
          </div>

          {draft ? (
            <>
              <div className={`risk-box ${riskFlags.length ? "warn" : "safe"}`}>
                {riskFlags.length ? <AlertTriangle size={18} /> : <ShieldCheck size={18} />}
                <span>
                  {riskFlags.length
                    ? `검수 필요: ${riskFlags.map((rule) => `${rule.label}(${rule.matches.join(", ")})`).join(" / ")}`
                    : "위험 표현이 발견되지 않았습니다."}
                </span>
              </div>

              <div className="checklist">
                {draft.checklist.map((item) => (
                  <div key={item}>
                    <CheckCircle2 size={16} />
                    <span>{item}</span>
                  </div>
                ))}
              </div>

              <div className="qa-grid" aria-label="QA 점검 결과">
                {qaStatus.map((item) => (
                  <div className={item.pass ? "pass" : "fail"} key={item.label}>
                    {item.pass ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>

              <textarea className="textarea draft-editor" value={draftText} onChange={(event) => setDraftText(event.target.value)} aria-label="상담 카톡 안내문 편집" />

              <div className="action-row">
                <button type="button" onClick={copyDraft}>
                  <ClipboardCopy size={18} />
                  복사
                </button>
                <button type="button" onClick={saveDraft}>
                  <Save size={18} />
                  브라우저 저장
                </button>
                <button type="button" onClick={generateDraft}>
                  <RefreshCw size={18} />
                  다시 생성
                </button>
              </div>
            </>
          ) : (
            <div className="empty-state">
              <Sparkles size={28} />
              <p>상담 상황을 선택한 뒤 안내문을 생성하세요.</p>
            </div>
          )}
        </section>
      </section>

      <section className="week3-dashboard" aria-label="3주차 사용 기록과 피드백">
        <div className="panel-heading">
          <BarChart3 size={20} />
          <h2>3주차 사용 기록·피드백 대시보드</h2>
        </div>

        <div className="metrics-grid" aria-label="사용 기록 숫자">
          <div>
            <span>방문</span>
            <strong>{analytics.visits}</strong>
          </div>
          <div>
            <span>초안 생성</span>
            <strong>{analytics.draftGenerated}</strong>
          </div>
          <div>
            <span>복사율</span>
            <strong>{copyRate}%</strong>
          </div>
          <div>
            <span>피드백</span>
            <strong>{feedback.length}</strong>
          </div>
          <div>
            <span>평균 점수</span>
            <strong>{feedbackAverage || "-"}</strong>
          </div>
        </div>

        <div className="week3-grid">
          <section className="insight-block">
            <div className="block-title">
              <Target size={18} />
              <h3>타겟·메시지·채널</h3>
            </div>
            <dl className="compact-list">
              <div>
                <dt>WHO</dt>
                <dd>상담 후 카카오톡 안내문을 매일 직접 정리하는 1인 한의원 원장</dd>
              </div>
              <div>
                <dt>WHAT</dt>
                <dd>상담 끝나고 3분 안에 환자용 카톡 초안 만들기</dd>
              </div>
              <div>
                <dt>WHERE</dt>
                <dd>가까운 한의사 동료 1:1 데모, 병원 운영자 커뮤니티 공유</dd>
              </div>
            </dl>
          </section>

          <section className="insight-block">
            <div className="block-title">
              <ClipboardList size={18} />
              <h3>데이터 해석</h3>
            </div>
            <p className="signal-text">{strongestSignal}</p>
            <div className="event-list">
              {analytics.events.length ? (
                analytics.events.slice(0, 5).map((event) => (
                  <div key={event.id}>
                    <strong>{event.type}</strong>
                    <span>
                      {event.detail} · {new Date(event.at).toLocaleString("ko-KR")}
                    </span>
                  </div>
                ))
              ) : (
                <p>아직 기록된 이벤트가 없습니다.</p>
              )}
            </div>
          </section>

          <section className="insight-block feedback-card">
            <div className="block-title">
              <MessageSquarePlus size={18} />
              <h3>피드백 기록</h3>
            </div>
            <label className="field-label" htmlFor="feedback-role">테스트 사용자</label>
            <input
              id="feedback-role"
              className="input"
              value={feedbackForm.role}
              onChange={(event) => setFeedbackForm({ ...feedbackForm, role: event.target.value })}
            />
            <label className="field-label" htmlFor="feedback-score">다시 쓸 의향</label>
            <select
              id="feedback-score"
              className="input"
              value={feedbackForm.score}
              onChange={(event) => setFeedbackForm({ ...feedbackForm, score: event.target.value })}
            >
              <option value="5">5점</option>
              <option value="4">4점</option>
              <option value="3">3점</option>
              <option value="2">2점</option>
              <option value="1">1점</option>
            </select>
            <textarea
              className="textarea feedback-input"
              placeholder="좋았던 점"
              value={feedbackForm.liked}
              onChange={(event) => setFeedbackForm({ ...feedbackForm, liked: event.target.value })}
            />
            <textarea
              className="textarea feedback-input"
              placeholder="아쉬웠던 점"
              value={feedbackForm.issue}
              onChange={(event) => setFeedbackForm({ ...feedbackForm, issue: event.target.value })}
            />
            <input
              className="input"
              placeholder="4주차에 바랄 점"
              value={feedbackForm.next}
              onChange={(event) => setFeedbackForm({ ...feedbackForm, next: event.target.value })}
            />
            <button className="secondary-action" type="button" onClick={submitFeedback}>
              <Save size={18} />
              피드백 저장
            </button>
          </section>

          <section className="insight-block">
            <div className="block-title">
              <Users size={18} />
              <h3>VOC 요약</h3>
            </div>
            <div className="feedback-list">
              {feedback.length ? (
                feedback.slice(0, 4).map((item) => (
                  <article key={item.id}>
                    <strong>
                      {item.role} · {item.score}점
                    </strong>
                    <p>좋았던 점: {item.liked}</p>
                    <p>아쉬웠던 점: {item.issue}</p>
                    {item.next && <p>다음 요청: {item.next}</p>}
                  </article>
                ))
              ) : (
                <p>테스트 사용자에게 링크를 보내고 받은 반응을 여기에 기록하세요.</p>
              )}
            </div>
          </section>
        </div>

        <div className="decision-board">
          <div>
            <span>Keep</span>
            <strong>상담 입력 → 초안 생성 → 위험 표현 검수 흐름은 유지</strong>
          </div>
          <div>
            <span>Change</span>
            <strong>초안이 길어지는 문제를 줄이고, 카톡용 짧은 버전을 별도로 제공</strong>
          </div>
          <div>
            <span>Try</span>
            <strong>4주차에는 템플릿 저장과 자주 쓰는 문구 재사용 기능 추가</strong>
          </div>
        </div>
      </section>

      <section className="submission-strip" aria-label="3주차 제출 요약">
        <div>
          <span>실제 사용 기록</span>
          <strong>방문·초안 생성·복사·저장 이벤트를 브라우저에 기록</strong>
        </div>
        <div>
          <span>사용자 반응</span>
          <strong>피드백 2건 이상 기록 후 VOC 요약으로 제출</strong>
        </div>
        <div>
          <span>4주차 개선점</span>
          <strong>짧은 카톡 버전, 템플릿 저장, 재사용 흐름 개선</strong>
        </div>
      </section>

      {notice && <div className="toast">{notice}</div>}
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
