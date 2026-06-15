const STORAGE_KEY = "tomato-focus-clock";
const DEFAULT_SETTINGS = {
  focus: 25,
  short: 5,
  long: 15,
  dailyGoal: 8,
  autoStartBreaks: false,
  autoStartFocus: false,
  soundEnabled: true,
};

const modeNames = {
  focus: "专注时间",
  short: "短休息",
  long: "长休息",
};

const elements = {
  display: document.querySelector("#timerDisplay"),
  label: document.querySelector("#timerLabel"),
  sessionCounter: document.querySelector("#sessionCounter"),
  progressRing: document.querySelector("#progressRing"),
  startButton: document.querySelector("#startButton"),
  startButtonText: document.querySelector("#startButton span"),
  resetButton: document.querySelector("#resetButton"),
  skipButton: document.querySelector("#skipButton"),
  modeTabs: [...document.querySelectorAll(".mode-tab")],
  soundToggle: document.querySelector("#soundToggle"),
  taskInput: document.querySelector("#taskInput"),
  taskCount: document.querySelector("#taskCount"),
  taskStatus: document.querySelector("#taskStatus"),
  clearTask: document.querySelector("#clearTask"),
  todayDate: document.querySelector("#todayDate"),
  completedCount: document.querySelector("#completedCount"),
  focusMinutes: document.querySelector("#focusMinutes"),
  streakCount: document.querySelector("#streakCount"),
  goalProgress: document.querySelector("#goalProgress"),
  goalTotal: document.querySelector("#goalTotal"),
  goalBar: document.querySelector("#goalBar"),
  goalTrack: document.querySelector(".goal-track"),
  historyCount: document.querySelector("#historyCount"),
  historyEmpty: document.querySelector("#historyEmpty"),
  historyList: document.querySelector("#historyList"),
  settingsModal: document.querySelector("#settingsModal"),
  settingsOpen: document.querySelector("#settingsOpen"),
  settingsClose: document.querySelector("#settingsClose"),
  settingsForm: document.querySelector("#settingsForm"),
  focusDuration: document.querySelector("#focusDuration"),
  shortDuration: document.querySelector("#shortDuration"),
  longDuration: document.querySelector("#longDuration"),
  dailyGoal: document.querySelector("#dailyGoal"),
  autoStartBreaks: document.querySelector("#autoStartBreaks"),
  autoStartFocus: document.querySelector("#autoStartFocus"),
  restoreDefaults: document.querySelector("#restoreDefaults"),
  toast: document.querySelector("#toast"),
};

const ringRadius = 126;
const ringCircumference = 2 * Math.PI * ringRadius;
elements.progressRing.style.strokeDasharray = `${ringCircumference}`;

let appData = loadData();
let state = {
  mode: "focus",
  remaining: appData.settings.focus * 60,
  total: appData.settings.focus * 60,
  running: false,
  intervalId: null,
  targetTime: null,
};
let audioContext;
let toastTimer;

function getDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;
}

function loadData() {
  const fallback = {
    settings: { ...DEFAULT_SETTINGS },
    task: "",
    stats: {},
    history: {},
  };

  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return {
      settings: { ...DEFAULT_SETTINGS, ...(stored?.settings || {}) },
      task: stored?.task || "",
      stats: stored?.stats || {},
      history: stored?.history || {},
    };
  } catch {
    return fallback;
  }
}

function saveData() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(appData));
}

function getTodayStats() {
  const key = getDateKey();
  if (!appData.stats[key]) {
    appData.stats[key] = { completed: 0, minutes: 0 };
  }
  return appData.stats[key];
}

function getTodayHistory() {
  return appData.history[getDateKey()] || [];
}

function formatTime(seconds) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function updateTimerUI() {
  const progress = state.total ? 1 - state.remaining / state.total : 0;
  elements.display.textContent = formatTime(state.remaining);
  elements.display.dateTime = `PT${state.remaining}S`;
  elements.label.textContent = modeNames[state.mode];
  elements.progressRing.style.strokeDashoffset = `${ringCircumference * (1 - progress)}`;
  elements.startButton.classList.toggle("is-running", state.running);
  elements.startButtonText.textContent = state.running
    ? "暂停"
    : state.mode === "focus"
      ? "开始专注"
      : "开始休息";
  elements.taskStatus.textContent = state.running && state.mode === "focus" ? "专注中" : "待开始";
  elements.taskStatus.classList.toggle("active", state.running && state.mode === "focus");
  document.title = `${formatTime(state.remaining)} · ${modeNames[state.mode]} | 番茄专注钟`;
}

function updateStatsUI() {
  const today = getTodayStats();
  const goal = appData.settings.dailyGoal;
  const percentage = Math.min(100, (today.completed / goal) * 100);
  const dateText = new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "short",
  }).format(new Date());

  elements.todayDate.textContent = dateText;
  elements.completedCount.textContent = today.completed;
  elements.focusMinutes.textContent = today.minutes;
  elements.goalProgress.textContent = today.completed;
  elements.goalTotal.textContent = goal;
  elements.goalBar.style.width = `${percentage}%`;
  elements.goalTrack.setAttribute("aria-valuemax", goal);
  elements.goalTrack.setAttribute("aria-valuenow", today.completed);
  elements.streakCount.textContent = calculateStreak();
  elements.sessionCounter.textContent = `第 ${today.completed + 1} 个番茄`;
}

function updateHistoryUI() {
  const history = getTodayHistory();
  const recentHistory = history.slice(-5).reverse();

  elements.historyCount.textContent = history.length;
  elements.historyEmpty.hidden = history.length > 0;
  elements.historyList.replaceChildren(
    ...recentHistory.map((entry) => {
      const item = document.createElement("li");
      const content = document.createElement("div");
      const task = document.createElement("strong");
      const meta = document.createElement("span");
      const minutes = document.createElement("span");

      item.className = "history-item";
      content.className = "history-content";
      task.textContent = entry.task || "未命名专注";
      meta.textContent = new Intl.DateTimeFormat("zh-CN", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(entry.completedAt));
      minutes.className = "history-minutes";
      minutes.textContent = `${entry.minutes} 分钟`;

      content.append(task, meta);
      item.append(content, minutes);
      return item;
    }),
  );
}

function calculateStreak() {
  let streak = 0;
  const cursor = new Date();

  while (true) {
    const stats = appData.stats[getDateKey(cursor)];
    if (!stats || stats.completed === 0) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function updateMode(mode, shouldReset = true) {
  pauseTimer();
  state.mode = mode;

  if (shouldReset) {
    state.total = appData.settings[mode] * 60;
    state.remaining = state.total;
  }

  elements.modeTabs.forEach((tab) => {
    const active = tab.dataset.mode === mode;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  document.body.classList.toggle("break-mode", mode !== "focus");
  updateTimerUI();
}

function startTimer() {
  if (state.running) {
    pauseTimer();
    return;
  }

  state.running = true;
  state.targetTime = Date.now() + state.remaining * 1000;
  state.intervalId = window.setInterval(tick, 250);
  updateTimerUI();
}

function pauseTimer() {
  if (state.running && state.targetTime) {
    state.remaining = Math.max(0, Math.ceil((state.targetTime - Date.now()) / 1000));
  }
  state.running = false;
  state.targetTime = null;
  window.clearInterval(state.intervalId);
  state.intervalId = null;
  updateTimerUI();
}

function tick() {
  state.remaining = Math.max(0, Math.ceil((state.targetTime - Date.now()) / 1000));
  updateTimerUI();
  if (state.remaining === 0) completeSession();
}

function completeSession() {
  const completedMode = state.mode;
  pauseTimer();
  playChime();

  if (completedMode === "focus") {
    const today = getTodayStats();
    const dateKey = getDateKey();
    today.completed += 1;
    today.minutes += appData.settings.focus;
    appData.history[dateKey] ||= [];
    appData.history[dateKey].push({
      id: `${Date.now()}-${today.completed}`,
      task: appData.task.trim(),
      minutes: appData.settings.focus,
      completedAt: new Date().toISOString(),
    });
    saveData();
    updateStatsUI();
    updateHistoryUI();
    showToast("完成一个番茄，做得很好。现在休息一下吧。");
    notify("专注完成", "做得很好，现在休息一下吧。");
    const nextMode = today.completed % 4 === 0 ? "long" : "short";
    updateMode(nextMode);
    if (appData.settings.autoStartBreaks) startTimer();
  } else {
    showToast("休息结束，准备好开始下一轮了吗？");
    notify("休息结束", "准备好开始下一轮专注了吗？");
    updateMode("focus");
    if (appData.settings.autoStartFocus) startTimer();
  }
}

function resetTimer() {
  updateMode(state.mode);
  showToast("计时器已重置");
}

function skipTimer() {
  const nextMode = state.mode === "focus" ? "short" : "focus";
  updateMode(nextMode);
  showToast(state.mode === "focus" ? "进入下一轮专注" : "已跳到休息时间");
}

function playChime() {
  if (!appData.settings.soundEnabled) return;
  audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
  const now = audioContext.currentTime;

  [0, 0.18, 0.36].forEach((delay, index) => {
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = [660, 880, 990][index];
    gain.gain.setValueAtTime(0.0001, now + delay);
    gain.gain.exponentialRampToValueAtTime(0.18, now + delay + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.38);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now + delay);
    oscillator.stop(now + delay + 0.4);
  });
}

function notify(title, body) {
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification(title, { body, icon: "favicon.svg" });
  }
}

function requestNotificationPermission() {
  if ("Notification" in window && Notification.permission === "default") {
    Notification.requestPermission();
  }
}

function toggleSound() {
  appData.settings.soundEnabled = !appData.settings.soundEnabled;
  elements.soundToggle.classList.toggle("muted", !appData.settings.soundEnabled);
  elements.soundToggle.setAttribute(
    "aria-label",
    appData.settings.soundEnabled ? "关闭声音" : "开启声音",
  );
  saveData();
  if (appData.settings.soundEnabled) playChime();
}

function updateTask() {
  appData.task = elements.taskInput.value;
  elements.taskCount.textContent = appData.task.length;
  saveData();
}

function showToast(message) {
  window.clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.add("visible");
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("visible"), 2800);
}

function openSettings() {
  const settings = appData.settings;
  elements.focusDuration.value = settings.focus;
  elements.shortDuration.value = settings.short;
  elements.longDuration.value = settings.long;
  elements.dailyGoal.value = settings.dailyGoal;
  elements.autoStartBreaks.checked = settings.autoStartBreaks;
  elements.autoStartFocus.checked = settings.autoStartFocus;
  elements.settingsModal.hidden = false;
  elements.focusDuration.focus();
}

function closeSettings() {
  elements.settingsModal.hidden = true;
  elements.settingsOpen.focus();
}

function saveSettings(event) {
  event.preventDefault();
  appData.settings = {
    ...appData.settings,
    focus: Number(elements.focusDuration.value),
    short: Number(elements.shortDuration.value),
    long: Number(elements.longDuration.value),
    dailyGoal: Number(elements.dailyGoal.value),
    autoStartBreaks: elements.autoStartBreaks.checked,
    autoStartFocus: elements.autoStartFocus.checked,
  };
  saveData();
  updateMode(state.mode);
  updateStatsUI();
  closeSettings();
  showToast("设置已保存");
}

function restoreDefaults() {
  elements.focusDuration.value = DEFAULT_SETTINGS.focus;
  elements.shortDuration.value = DEFAULT_SETTINGS.short;
  elements.longDuration.value = DEFAULT_SETTINGS.long;
  elements.dailyGoal.value = DEFAULT_SETTINGS.dailyGoal;
  elements.autoStartBreaks.checked = DEFAULT_SETTINGS.autoStartBreaks;
  elements.autoStartFocus.checked = DEFAULT_SETTINGS.autoStartFocus;
}

function initialize() {
  elements.taskInput.value = appData.task;
  elements.taskCount.textContent = appData.task.length;
  elements.soundToggle.classList.toggle("muted", !appData.settings.soundEnabled);
  elements.soundToggle.setAttribute(
    "aria-label",
    appData.settings.soundEnabled ? "关闭声音" : "开启声音",
  );
  updateTimerUI();
  updateStatsUI();
  updateHistoryUI();
}

elements.startButton.addEventListener("click", () => {
  requestNotificationPermission();
  startTimer();
});
elements.resetButton.addEventListener("click", resetTimer);
elements.skipButton.addEventListener("click", skipTimer);
elements.soundToggle.addEventListener("click", toggleSound);
elements.modeTabs.forEach((tab) =>
  tab.addEventListener("click", () => updateMode(tab.dataset.mode)),
);
elements.taskInput.addEventListener("input", updateTask);
elements.clearTask.addEventListener("click", () => {
  elements.taskInput.value = "";
  updateTask();
  elements.taskInput.focus();
});
elements.settingsOpen.addEventListener("click", openSettings);
elements.settingsClose.addEventListener("click", closeSettings);
elements.settingsForm.addEventListener("submit", saveSettings);
elements.restoreDefaults.addEventListener("click", restoreDefaults);
elements.settingsModal.addEventListener("click", (event) => {
  if (event.target === elements.settingsModal) closeSettings();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !elements.settingsModal.hidden) closeSettings();
  if (
    event.code === "Space" &&
    elements.settingsModal.hidden &&
    !["TEXTAREA", "INPUT", "BUTTON"].includes(document.activeElement.tagName)
  ) {
    event.preventDefault();
    startTimer();
  }
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && state.running) tick();
});

initialize();
