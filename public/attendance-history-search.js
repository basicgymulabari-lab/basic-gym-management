(() => {
  if (window.__attendanceHistorySearchInstalled) return;
  window.__attendanceHistorySearchInstalled = true;

  let query = "";
  let scheduled = false;

  const normalize = (value) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase();

  const getHistoryPanel = () =>
    Array.from(document.querySelectorAll("section")).find((section) =>
      Array.from(section.querySelectorAll("h2")).some(
        (heading) => heading.textContent?.trim().toLocaleLowerCase() === "attendance history",
      ),
    );

  const isAttendanceRoute = () => window.location.pathname.replace(/\/+$/, "") === "/attendance";

  const updateResults = (list, status) => {
    if (!list) {
      status.textContent = query ? "No attendees match this search." : "";
      status.hidden = !query;
      return;
    }

    const searchTerm = normalize(query.trim());
    let matches = 0;
    for (const row of Array.from(list.children)) {
      const details = Array.from(row.querySelectorAll("p"))
        .slice(0, 2)
        .map((paragraph) => paragraph.textContent ?? "")
        .join(" ");
      const visible = !searchTerm || normalize(details).includes(searchTerm);
      row.hidden = !visible;
      if (visible) matches += 1;
    }

    if (!query.trim()) {
      status.textContent = "";
      status.hidden = true;
      return;
    }

    status.textContent = matches
      ? `${matches} attendee${matches === 1 ? "" : "s"} match this search.`
      : "No attendees match this search.";
    status.hidden = false;
  };

  const sync = () => {
    scheduled = false;
    const section = getHistoryPanel();
    if (!section) return;

    const body = section.children.item(1);
    if (!body) return;

    // Member profiles have their own attendance date-range controls and must
    // never inherit the global check-in history search from this legacy helper.
    if (!isAttendanceRoute()) {
      body.querySelector("[data-attendance-history-search]")?.remove();
      return;
    }

    // The current React route owns its search and filtering state. This script
    // is retained for the legacy live UI only; avoid injecting a dead duplicate.
    if (body.querySelector("#attendance-history-search")) {
      body.querySelector("[data-attendance-history-search]")?.remove();
      return;
    }

    let searchRegion = body.querySelector("[data-attendance-history-search]");
    if (!searchRegion) {
      searchRegion = document.createElement("div");
      searchRegion.dataset.attendanceHistorySearch = "true";
      searchRegion.className = "mb-4 w-full max-w-2xl";

      const input = document.createElement("input");
      input.type = "search";
      input.maxLength = 80;
      input.autocomplete = "off";
      input.setAttribute("aria-label", "Search attendance history by name or phone");
      input.placeholder = "Search attendees by name or phone";
      input.className =
        "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring md:text-sm";
      input.value = query;

      const status = document.createElement("p");
      status.className = "mt-2 text-sm text-muted-foreground";
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      status.hidden = true;

      input.addEventListener("input", () => {
        query = input.value;
        const list = body.querySelector("div.divide-y");
        updateResults(list, status);
      });

      searchRegion.append(input, status);
      body.insertBefore(searchRegion, body.firstChild);
    }

    const input = searchRegion.querySelector("input");
    const status = searchRegion.querySelector('[role="status"]');
    if (!input || !status) return;
    if (input.value !== query && document.activeElement !== input) input.value = query;
    const list = body.querySelector("div.divide-y");
    updateResults(list, status);
  };

  const scheduleSync = () => {
    if (scheduled) return;
    scheduled = true;
    window.requestAnimationFrame(sync);
  };

  const observer = new MutationObserver(scheduleSync);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  scheduleSync();
})();
