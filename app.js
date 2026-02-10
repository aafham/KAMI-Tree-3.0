(() => {
  "use strict";

  const state = {
    view: "forest",
    selectedId: null,
    rootId: null,
    focusExpand: { ancestors: 1, children: {}, showAllChildren: false },
    fullTree: { depth: 2, expanded: new Set(), collapsed: new Set(), branchOnly: false },
    searchIndex: [],
    pan: { x: 0, y: 0, zoom: 1 },
    drawerOpen: false,
    settings: {
      showYears: true,
      compactCards: false,
      showGender: true,
      reduceMotion: false,
      defaultView: "forest",
      autoOpenDrawer: false,
    },
  };

  // DOM cache
  const el = (id) => document.getElementById(id);
  const focusView = el("focusView");
  const fullTreeView = el("fullTreeView");
  const searchInput = el("searchInput");
  const searchResults = el("searchResults");
  const treeStage = el("treeStage");
  const fullTreeCanvas = el("fullTreeCanvas");
  const treeStageOuter = fullTreeCanvas.querySelector(".tree-stage-outer");
  const forestModeBtn = el("forestModeBtn");
  const branchModeBtn = el("branchModeBtn");
  const branchControls = fullTreeView.querySelector(".branch-controls");
  const depthControls = fullTreeView.querySelector(".generation-controls");
  const drawer = el("detailDrawer");
  const drawerContent = el("drawerContent");
  const drawerTitle = el("drawerTitle");
  const breadcrumbs = el("breadcrumbs");
  const insights = el("insights");
  const insightsContent = el("insightsContent");
  const settingsModal = el("settingsModal");
  const helpModal = el("helpModal");
  const familyNameEl = el("familyName");

  let people = [];
  let unions = [];
  let peopleById = new Map();
  let parentsMap = new Map();
  let spousesMap = new Map();
  let childrenMap = new Map();
  let searchActiveIndex = -1;

  // Data
  function initData(data) {
    people = data.people || [];
    unions = data.unions || [];
    peopleById = new Map(people.map(p => [p.id, p]));
    buildRelations(unions);
    state.searchIndex = people.map(p => ({ id: p.id, name: normalizeName(p.name).toLowerCase() }));
    state.rootId = data.selfId || data.rootId || (people[0] ? people[0].id : null);
    state.selectedId = state.rootId;
    if (data.familyName) familyNameEl.textContent = data.familyName;
    updateStats();
    applySettings();
    setView(state.settings.defaultView);
    render();
    setTimeout(() => fitToScreen(), 50);
  }

  function buildRelations(unionsList) {
    parentsMap = new Map();
    spousesMap = new Map();
    childrenMap = new Map();

    const addToMap = (map, key, value) => {
      if (!key || !value) return;
      if (!map.has(key)) map.set(key, new Set());
      map.get(key).add(value);
    };

    unionsList.forEach(union => {
      const p1 = union.partner1 || null;
      const p2 = union.partner2 || null;
      if (p1 && p2) {
        addToMap(spousesMap, p1, p2);
        addToMap(spousesMap, p2, p1);
      }
      (union.children || []).forEach(childId => {
        if (p1) addToMap(parentsMap, childId, p1);
        if (p2) addToMap(parentsMap, childId, p2);
        if (p1) addToMap(childrenMap, p1, childId);
        if (p2) addToMap(childrenMap, p2, childId);
      });
    });
  }

  const getParents = (id) => Array.from(parentsMap.get(id) || []);
  const getSpouses = (id) => Array.from(spousesMap.get(id) || []);
  const getChildren = (id) => Array.from(childrenMap.get(id) || []);
  const getRoots = () => people.filter(p => getParents(p.id).length === 0).map(p => p.id);

  function updateStats() {
    el("statPeople").textContent = people.length;
    el("statFamilies").textContent = unions.length;
    el("statGenerations").textContent = estimateGenerations();
  }

  function estimateGenerations() {
    if (!state.rootId) return 0;
    const visited = new Set();
    let maxDepth = 1;
    const stack = [{ id: state.rootId, depth: 1 }];
    while (stack.length) {
      const { id, depth } = stack.pop();
      if (visited.has(id)) continue;
      visited.add(id);
      maxDepth = Math.max(maxDepth, depth);
      getChildren(id).forEach(childId => stack.push({ id: childId, depth: depth + 1 }));
    }
    return maxDepth;
  }

  // View state
  function setView(view) {
    state.view = view;
    const focusBtn = el("focusModeBtn");
    if (view === "focus") {
      focusView.hidden = false;
      fullTreeView.hidden = true;
      focusBtn.classList.add("active");
      forestModeBtn.classList.remove("active");
      branchModeBtn.classList.remove("active");
      focusBtn.setAttribute("aria-pressed", "true");
      forestModeBtn.setAttribute("aria-pressed", "false");
      branchModeBtn.setAttribute("aria-pressed", "false");
    } else {
      focusView.hidden = true;
      fullTreeView.hidden = false;
      focusBtn.classList.remove("active");
      if (view === "forest") {
        forestModeBtn.classList.add("active");
        branchModeBtn.classList.remove("active");
        forestModeBtn.setAttribute("aria-pressed", "true");
        branchModeBtn.setAttribute("aria-pressed", "false");
      } else {
        forestModeBtn.classList.remove("active");
        branchModeBtn.classList.add("active");
        forestModeBtn.setAttribute("aria-pressed", "false");
        branchModeBtn.setAttribute("aria-pressed", "true");
      }
      focusBtn.setAttribute("aria-pressed", "false");
    }

    const isBranch = view === "branch";
    breadcrumbs.classList.toggle("hidden", !isBranch);
    branchControls.classList.toggle("hidden", !isBranch);
    setStageAnchor(view);
  }

  function setStageAnchor(view) {
    if (!treeStageOuter) return;
    if (view === "forest") {
      treeStageOuter.style.top = "0";
      treeStageOuter.style.left = "0";
      treeStageOuter.style.transform = "translate(0, 0)";
    } else {
      treeStageOuter.style.top = "50%";
      treeStageOuter.style.left = "50%";
      treeStageOuter.style.transform = "translate(-50%, -50%)";
    }
  }

  // Rendering
  function render() {
    if (!state.selectedId && state.view === "focus") {
      renderEmptyState();
      return;
    }
    if (state.view === "focus") {
      renderFocus();
      return;
    }
    if (state.view === "forest") {
      renderForest();
      return;
    }
    renderBranchTree();
  }

  function renderEmptyState() {
    focusView.innerHTML = `
      <div class="empty-state">
        <h2>Search for a person to begin</h2>
        <p>Use the search bar or select a root person.</p>
      </div>
    `;
  }

  function renderFocus() {
    const person = peopleById.get(state.selectedId);
    if (!person) {
      renderEmptyState();
      return;
    }

    const parents = getParents(person.id).map(id => peopleById.get(id)).filter(Boolean);
    const spouses = getSpouses(person.id).map(id => peopleById.get(id)).filter(Boolean);
    const children = getChildren(person.id).map(id => peopleById.get(id)).filter(Boolean);

    const childLimit = state.focusExpand.showAllChildren ? children.length : 4;
    const visibleChildren = children.slice(0, childLimit);
    const remaining = children.length - visibleChildren.length;

    const isMobile = window.matchMedia("(max-width: 900px)").matches;
    if (isMobile) {
      renderFocusMobile(person, parents, spouses, visibleChildren, remaining);
      return;
    }

    focusView.innerHTML = `
      <div class="focus-section" style="grid-column: 2; grid-row: 1;">
        <h3>Parents</h3>
        <div class="focus-grid" id="parentsGrid"></div>
        <div id="grandparentsBlock"></div>
        <button class="btn" data-action="toggle-ancestors">${state.focusExpand.ancestors === 1 ? "Expand ancestors" : "Collapse ancestors"}</button>
      </div>
      <div class="focus-section scrollable" style="grid-column: 1; grid-row: 2;">
        <h3>Spouses</h3>
        <div class="focus-grid" id="spousesGrid"></div>
      </div>
      <div class="focus-center">
        <div id="centerCard"></div>
      </div>
      <div class="focus-section" style="grid-column: 3; grid-row: 2;">
        <h3>Actions</h3>
        <div class="focus-grid">
          <button class="btn" data-action="set-root">Set as Root</button>
          <button class="btn" data-action="view-full">View in Branch</button>
          <button class="btn" data-action="copy-id">Copy ID</button>
        </div>
      </div>
      <div class="focus-section scrollable" style="grid-column: 2; grid-row: 3;">
        <h3>Children</h3>
        <div class="focus-grid" id="childrenGrid"></div>
        ${remaining > 0 ? `<button class="btn" data-action="more-children">+${remaining} more</button>` : ""}
      </div>
    `;

    el("centerCard").innerHTML = cardTemplate(person);
    el("parentsGrid").innerHTML = parents.length ? parents.map(cardTemplate).join("") : `<div class="muted">No parents listed</div>`;
    el("spousesGrid").innerHTML = spouses.length ? spouses.map(cardTemplate).join("") : `<div class="muted">No spouses listed</div>`;

    const { html: childrenHtml } = renderChildBranches(visibleChildren);
    el("childrenGrid").innerHTML = childrenHtml || `<div class="muted">No children listed</div>`;

    if (state.focusExpand.ancestors > 1) {
      const grandparents = parents.flatMap(parent => getParents(parent.id))
        .map(id => peopleById.get(id))
        .filter(Boolean);
      el("grandparentsBlock").innerHTML = `
        <div class="subsection-title">Grandparents</div>
        <div class="focus-grid">${grandparents.length ? grandparents.map(cardTemplate).join("") : `<div class="muted">No grandparents listed</div>`}</div>
      `;
    }
  }

  function renderFocusMobile(person, parents, spouses, visibleChildren, remaining) {
    const { html: childrenHtml } = renderChildBranches(visibleChildren, true);
    focusView.innerHTML = `
      <div class="focus-mobile">
        <div class="focus-center">${cardTemplate(person)}</div>
        ${renderAccordionSection("Parents", parents.map(cardTemplate).join(""), parents.length)}
        ${renderAccordionSection("Spouses", spouses.map(cardTemplate).join(""), spouses.length)}
        ${renderAccordionSection("Children", `${childrenHtml || `<div class=\\"muted\\">No children listed</div>`}${remaining > 0 ? `<button class=\\"btn\\" data-action=\\"more-children\\">+${remaining} more</button>` : ""}`, visibleChildren.length)}
        <div class="focus-section">
          <h3>Actions</h3>
          <div class="focus-grid">
            <button class="btn" data-action="set-root">Set as Root</button>
            <button class="btn" data-action="view-full">View in Branch</button>
            <button class="btn" data-action="copy-id">Copy ID</button>
          </div>
        </div>
      </div>
    `;
  }

  function renderAccordionSection(title, contentHtml, count) {
    const body = contentHtml || `<div class="muted">No ${title.toLowerCase()} listed</div>`;
    return `
      <details class="accordion" open>
        <summary>${title} <span class="pill">${count}</span></summary>
        <div class="accordion-body">${body}</div>
      </details>
    `;
  }

  function renderChildBranches(children) {
    const html = children.map(child => {
      const expanded = !!state.focusExpand.children[child.id];
      const grandkids = expanded ? getChildren(child.id).map(id => peopleById.get(id)).filter(Boolean) : [];
      const grandkidsHtml = expanded
        ? `<div class="subsection-title">Grandchildren (${grandkids.length})</div><div class="subgrid">${grandkids.length ? grandkids.map(cardTemplate).join("") : `<div class=\\"muted\\">No children listed</div>`}</div>`
        : "";
      return `
        <div class="child-branch">
          ${cardTemplate(child)}
          <button class="btn btn-ghost" data-expand-child="${child.id}">${expanded ? "Collapse branch" : "Expand branch"}</button>
          ${grandkidsHtml}
        </div>
      `;
    }).join("");
    return { html };
  }

  function renderForest() {
    treeStage.innerHTML = "";
    const roots = getRoots();
    const forestGrid = document.createElement("div");
    forestGrid.className = "forest-grid";
    roots.forEach(rootId => {
      const subtree = document.createElement("div");
      subtree.className = "tree-subtree";
      subtree.appendChild(buildTreeNode(rootId, 1, { includeSpousesAtRoot: true }));
      forestGrid.appendChild(subtree);
    });
    treeStage.appendChild(forestGrid);
    applyPanZoom();
    updateBreadcrumbs();
  }

  function renderBranchTree() {
    const root = peopleById.get(state.rootId);
    if (!root) return;
    treeStage.innerHTML = "";
    const tree = buildTreeNode(root.id, 1, { includeSpousesAtRoot: true });
    treeStage.appendChild(tree);
    applyPanZoom();
    updateBreadcrumbs();
  }

  function buildTreeNode(personId, depth, options = {}) {
    const person = peopleById.get(personId);
    const node = document.createElement("div");
    node.className = "tree-level";
    node.dataset.personId = personId;

    if (!person) return node;

    const depthLimit = state.fullTree.depth === "all" ? Infinity : state.fullTree.depth;
    if (depth > depthLimit) return node;

    const nodeWrap = document.createElement("div");
    nodeWrap.className = "tree-node";

    if (options.includeSpousesAtRoot && depth === 1) {
      const familyRow = document.createElement("div");
      familyRow.className = "tree-family";
      familyRow.innerHTML = cardTemplate(person, true);
      getSpouses(personId)
        .map(id => peopleById.get(id))
        .filter(Boolean)
        .forEach(spouse => {
          const wrapper = document.createElement("div");
          wrapper.innerHTML = cardTemplate(spouse, true);
          familyRow.appendChild(wrapper.firstElementChild);
        });
      nodeWrap.appendChild(familyRow);
    } else {
      nodeWrap.innerHTML = cardTemplate(person, true);
    }

    const children = getChildren(personId).map(id => peopleById.get(id)).filter(Boolean);
    if (children.length) {
      const toggleBtn = document.createElement("button");
      toggleBtn.className = "node-toggle";
      toggleBtn.setAttribute("data-toggle-node", personId);
      toggleBtn.textContent = state.fullTree.collapsed.has(personId) ? "+" : "-";
      nodeWrap.appendChild(toggleBtn);
    }
    node.appendChild(nodeWrap);

    if (!children.length) return node;

    const branchOnly = state.view === "branch" && state.fullTree.branchOnly && personId !== state.selectedId;
    const isCollapsed = state.fullTree.collapsed.has(personId);
    const isExpanded = !isCollapsed;
    if (!isExpanded || branchOnly) return node;

    const childWrap = document.createElement("div");
    childWrap.className = "tree-children";
    children.forEach(child => {
      const childItem = document.createElement("div");
      childItem.className = "tree-child";
      childItem.appendChild(buildTreeNode(child.id, depth + 1, options));
      childWrap.appendChild(childItem);
    });
    node.appendChild(childWrap);
    return node;
  }

  // UI components
  function cardTemplate(person) {
    if (!person) return "";
    const gender = inferGender(person);
    const genderClass = gender === "male" ? "gender-male" : gender === "female" ? "gender-female" : "gender-unknown";
    const years = state.settings.showYears && (formatYear(person.birth) || formatYear(person.death))
      ? `${formatYear(person.birth) || "?"}-${formatYear(person.death) || "?"}`
      : "";
    const compactClass = state.settings.compactCards ? "compact" : "";
    const genderBadge = state.settings.showGender ? `<div class="gender ${genderClass}">${gender ? gender[0].toUpperCase() : "?"}</div>` : "";
    const selectedClass = person.id === state.selectedId ? "selected" : "";
    const displayName = getFirstName(person);
    const birthLabel = formatDate(person.birth);
    const ageLabel = formatAge(person.birth, person.death);
    return `
      <div class="node-card ${compactClass} ${selectedClass}" data-person-id="${person.id}">
        <div class="meta">
          <div class="name">${displayName}</div>
          <div class="years">Born ${birthLabel || "-"}</div>
          <div class="years">Age ${ageLabel || "-"}</div>
        </div>
        ${genderBadge}
      </div>
    `;
  }

  function inferGender(person) {
    if (person.gender) return person.gender;
    const name = normalizeName(person.name).toLowerCase();
    if (/\\bbinti\\b/.test(name)) return "female";
    if (/\\bbin\\b/.test(name)) return "male";
    return "unknown";
  }

  function normalizeName(name) {
    const raw = (name || "").trim();
    if (!raw) return "";
    const words = raw.toLowerCase().split(/\\s+/);
    return words.map(word => {
      if (word === "bin" || word === "binti") return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(" ");
  }

  function splitNameParts(name) {
    const normalized = normalizeName(name);
    const lower = normalized.toLowerCase();
    if (lower.includes(" bin ")) {
      const parts = normalized.split(/\\s+bin\\s+/i);
      return { first: parts[0], last: parts.slice(1).join(" ") };
    }
    if (lower.includes(" binti ")) {
      const parts = normalized.split(/\\s+binti\\s+/i);
      return { first: parts[0], last: parts.slice(1).join(" ") };
    }
    const first = normalized.split(" ")[0] || normalized;
    return { first, last: normalized };
  }

  function shareParent(aId, bId) {
    const aParents = new Set(getParents(aId));
    if (!aParents.size) return false;
    return getParents(bId).some(pid => aParents.has(pid));
  }

  function getFirstName(person) {
    const parts = splitNameParts(person.name);
    return parts.first || normalizeName(person.name);
  }

  function formatDate(value) {
    if (!value) return "";
    if (typeof value === "string" && value.length >= 10) {
      const parts = value.split("-");
      if (parts.length === 3) {
        const [y, m, d] = parts;
        return `${d}/${m}/${y}`;
      }
      return value;
    }
    return "";
  }

  function formatAge(birth, death) {
    const birthDate = parseDate(birth);
    if (!birthDate) return "";
    const endDate = parseDate(death) || new Date("2026-02-10T00:00:00");
    let age = endDate.getFullYear() - birthDate.getFullYear();
    const m = endDate.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && endDate.getDate() < birthDate.getDate())) {
      age -= 1;
    }
    return age >= 0 ? age.toString() : "";
  }

  function parseDate(value) {
    if (!value || typeof value !== "string") return null;
    const parts = value.split("-");
    if (parts.length < 3) return null;
    const [y, m, d] = parts.map(v => parseInt(v, 10));
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }

  function formatYear(value) {
    if (!value) return "";
    if (typeof value === "string" && value.length >= 4) return value.slice(0, 4);
    return "";
  }

  // Drawer
  function openDrawer(id) {
    const person = peopleById.get(id);
    if (!person) return;
    state.drawerOpen = true;
    drawer.classList.add("active");
    drawer.setAttribute("aria-hidden", "false");
    drawerTitle.textContent = person.name;
    const parentIds = getParents(person.id);
    const hasMultipleParents = parentIds.length > 1;
    drawerContent.innerHTML = `
      <div><strong>Relation:</strong> ${person.relation || "-"}</div>
      <div><strong>Note:</strong> ${person.note || "-"}</div>
      <div><strong>Birth:</strong> ${person.birth || "?"}</div>
      <div><strong>Death:</strong> ${person.death || "?"}</div>
      <div><strong>Parents:</strong> ${parentIds.map(pid => peopleById.get(pid)?.name).filter(Boolean).join(", ") || "-"} ${hasMultipleParents ? "(multiple)" : ""}</div>
      <div><strong>Spouses:</strong> ${getSpouses(person.id).map(pid => peopleById.get(pid)?.name).filter(Boolean).join(", ") || "-"}</div>
      <div><strong>Children:</strong> ${getChildren(person.id).map(pid => peopleById.get(pid)?.name).filter(Boolean).join(", ") || "-"}</div>
    `;
    el("drawerGoTo").onclick = () => {
      centerOn(id);
      highlightPath(id);
      closeDrawer();
    };
  }

  function closeDrawer() {
    state.drawerOpen = false;
    drawer.classList.remove("active");
    drawer.setAttribute("aria-hidden", "true");
  }

  // Actions
  function centerOn(id) {
    state.selectedId = id;
    if (state.view !== "forest") state.rootId = id;
    render();
    if (state.view !== "focus") {
      resetPanZoom();
      requestAnimationFrame(() => {
        if (state.view === "forest") {
          centerNodeInCanvas(id);
        } else {
          fitToScreen();
        }
      });
    }
  }

  function resetPanZoom() {
    state.pan = { x: 0, y: 0, zoom: 1 };
    applyPanZoom();
  }

  function expandAncestors() {
    state.focusExpand.ancestors = state.focusExpand.ancestors === 1 ? 2 : 1;
    render();
  }

  function expandChildrenList() {
    state.focusExpand.showAllChildren = !state.focusExpand.showAllChildren;
    render();
  }

  function updateBreadcrumbs() {
    const targetId = state.selectedId || state.rootId;
    const rootId = state.view === "forest" ? findTopRootId(targetId) : state.rootId;
    const crumbs = getPathToRoot(targetId, rootId).reverse();
    breadcrumbs.textContent = crumbs.map(p => p.name).join(" > ") || "";
  }

  function getPathToRoot(id, explicitRootId) {
    const rootId = explicitRootId || state.rootId;
    if (!id || !rootId) return [];

    const visited = new Set();
    function dfs(currentId, path) {
      if (visited.has(currentId)) return null;
      visited.add(currentId);
      if (currentId === rootId) return path;
      const parents = getParents(currentId);
      for (const parentId of parents) {
        const parent = peopleById.get(parentId);
        const result = dfs(parentId, [...path, parent].filter(Boolean));
        if (result) return result;
      }
      return null;
    }

    const start = peopleById.get(id);
    if (!start) return [];
    const path = dfs(id, [start]);
    return path || [start];
  }

  function findTopRootId(id) {
    let current = id;
    let parentIds = getParents(current);
    while (parentIds.length) {
      current = parentIds[0];
      parentIds = getParents(current);
    }
    return current;
  }

  // Search
  function handleSearchInput() {
    const value = searchInput.value.trim().toLowerCase();
    searchActiveIndex = -1;
    if (!value) {
      searchResults.classList.remove("active");
      searchResults.innerHTML = "";
      return;
    }
    const matches = state.searchIndex.filter(p => p.name.includes(value)).slice(0, 8);
    searchResults.innerHTML = matches.map(m => {
      const person = peopleById.get(m.id);
      const display = highlightMatch(normalizeName(person.name), value);
      return `<div class="result" data-id="${m.id}"><span>${display}</span><span class="muted">${m.id}</span></div>`;
    }).join("");
    searchResults.classList.add("active");
  }

  function highlightMatch(text, query) {
    const idx = text.toLowerCase().indexOf(query);
    if (idx === -1) return text;
    return `${text.slice(0, idx)}<span class="match">${text.slice(idx, idx + query.length)}</span>${text.slice(idx + query.length)}`;
  }

  function selectSearchResult(id) {
    if (!id) return;
    jumpToPerson(id);
    searchResults.classList.remove("active");
    searchResults.innerHTML = "";
    searchInput.blur();
  }

  function jumpToPerson(id) {
    state.selectedId = id;
    if (state.view !== "forest") state.rootId = id;
    render();
    highlightPath(id);
    if (state.settings.autoOpenDrawer) openDrawer(id);
    if (state.view !== "focus") {
      resetPanZoom();
      requestAnimationFrame(() => {
        if (state.view === "forest") {
          centerNodeInCanvas(id);
        } else {
          fitToScreen();
        }
      });
    }
  }

  function highlightPath(id) {
    const rootId = state.view === "forest" ? findTopRootId(id) : state.rootId;
    const path = getPathToRoot(id, rootId).map(p => p.id);
    document.querySelectorAll(".node-card").forEach(card => {
      const isPath = path.includes(card.dataset.personId);
      const isSelected = card.dataset.personId === id;
      card.classList.toggle("highlight", isPath);
      card.classList.toggle("dim", !isPath);
      card.classList.toggle("selected", isSelected);
    });
    setTimeout(() => {
      document.querySelectorAll(".node-card").forEach(card => card.classList.remove("dim"));
    }, 1200);
  }

  // Pan/zoom + fit
  function applyPanZoom() {
    treeStage.style.transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.pan.zoom})`;
  }

  function fitToScreen() {
    const stageRect = treeStage.getBoundingClientRect();
    const canvasRect = fullTreeCanvas.getBoundingClientRect();
    if (!stageRect.width || !stageRect.height) return;
    const scaleX = canvasRect.width / stageRect.width;
    const scaleY = canvasRect.height / stageRect.height;
    const targetScale = Math.min(scaleX, scaleY) * 0.9;
    state.pan.zoom = Math.min(2, Math.max(0.4, targetScale));
    state.pan.x = 0;
    state.pan.y = 0;
    applyPanZoom();
  }

  function centerNodeInCanvas(id) {
    const node = treeStage.querySelector(`[data-person-id="${id}"]`);
    if (!node) return;
    const canvasRect = fullTreeCanvas.getBoundingClientRect();
    const nodeRect = node.getBoundingClientRect();
    const canvasCenterX = canvasRect.left + canvasRect.width / 2;
    const canvasCenterY = canvasRect.top + canvasRect.height / 2;
    const nodeCenterX = nodeRect.left + nodeRect.width / 2;
    const nodeCenterY = nodeRect.top + nodeRect.height / 2;
    const dx = (canvasCenterX - nodeCenterX) / state.pan.zoom;
    const dy = (canvasCenterY - nodeCenterY) / state.pan.zoom;
    state.pan.x += dx;
    state.pan.y += dy;
    applyPanZoom();
  }

  let lastWheel = 0;
  fullTreeCanvas.addEventListener("wheel", (e) => {
    if (state.view === "focus") return;
    e.preventDefault();
    const now = Date.now();
    if (now - lastWheel < 16) return;
    lastWheel = now;
    const delta = Math.sign(e.deltaY) * -0.08;
    state.pan.zoom = Math.min(2.5, Math.max(0.4, state.pan.zoom + delta));
    applyPanZoom();
  }, { passive: false });

  let isPanning = false;
  let start = { x: 0, y: 0 };
  fullTreeCanvas.addEventListener("pointerdown", (e) => {
    if (state.view === "focus") return;
    isPanning = true;
    fullTreeCanvas.setPointerCapture(e.pointerId);
    start = { x: e.clientX - state.pan.x, y: e.clientY - state.pan.y };
  });
  fullTreeCanvas.addEventListener("pointermove", (e) => {
    if (!isPanning) return;
    state.pan.x = e.clientX - start.x;
    state.pan.y = e.clientY - start.y;
    applyPanZoom();
  });
  fullTreeCanvas.addEventListener("pointerup", () => { isPanning = false; });
  fullTreeCanvas.addEventListener("pointerleave", () => { isPanning = false; });

  // Settings
  function applySettings() {
    state.settings.showYears = el("settingShowYears").checked;
    state.settings.compactCards = el("settingCompactCards").checked;
    state.settings.showGender = el("settingShowGender").checked;
    state.settings.reduceMotion = el("settingReduceMotion").checked;
    state.settings.defaultView = el("settingDefaultView").value;
    document.body.style.scrollBehavior = state.settings.reduceMotion ? "auto" : "smooth";
  }

  // Event delegation
  document.addEventListener("click", (e) => {
    const target = e.target;
    const card = target.closest(".node-card");
    if (card) {
      const id = card.dataset.personId;
      state.selectedId = id;
      highlightPath(id);
      openDrawer(id);
      return;
    }

    const expandBtn = target.closest("[data-expand-child]");
    if (expandBtn) {
      const id = expandBtn.getAttribute("data-expand-child");
      state.focusExpand.children[id] = !state.focusExpand.children[id];
      render();
      return;
    }

    const nodeToggle = target.closest("[data-toggle-node]");
    if (nodeToggle) {
      const id = nodeToggle.getAttribute("data-toggle-node");
      if (state.fullTree.collapsed.has(id)) {
        state.fullTree.collapsed.delete(id);
      } else {
        state.fullTree.collapsed.add(id);
      }
      render();
      return;
    }

    const result = target.closest(".result");
    if (result) {
      selectSearchResult(result.dataset.id);
      return;
    }

    const action = target.getAttribute("data-action");
    if (!action) return;

    switch (action) {
      case "center":
        centerOn(state.selectedId || state.rootId);
        break;
      case "reset":
        resetPanZoom();
        break;
      case "fit":
        fitToScreen();
        break;
      case "settings":
        settingsModal.classList.add("active");
        settingsModal.setAttribute("aria-hidden", "false");
        break;
      case "help":
        helpModal.classList.add("active");
        helpModal.setAttribute("aria-hidden", "false");
        break;
      case "settings-close":
        settingsModal.classList.remove("active");
        settingsModal.setAttribute("aria-hidden", "true");
        break;
      case "help-close":
        helpModal.classList.remove("active");
        helpModal.setAttribute("aria-hidden", "true");
        break;
      case "drawer-close":
        closeDrawer();
        break;
      case "drawer-center":
        if (state.selectedId) {
          centerOn(state.selectedId);
          highlightPath(state.selectedId);
        }
        closeDrawer();
        break;
      case "drawer-focus":
        if (state.selectedId) {
          state.rootId = state.selectedId;
          setView("branch");
          render();
          requestAnimationFrame(() => fitToScreen());
          highlightPath(state.selectedId);
        }
        closeDrawer();
        break;
      case "toggle-ancestors":
        expandAncestors();
        break;
      case "more-children":
        expandChildrenList();
        break;
      case "set-root":
        if (state.selectedId) centerOn(state.selectedId);
        break;
      case "view-full":
        if (state.selectedId) state.rootId = state.selectedId;
        setView("branch");
        render();
        requestAnimationFrame(() => fitToScreen());
        break;
      case "copy-id":
        if (state.selectedId) navigator.clipboard?.writeText(state.selectedId);
        break;
      case "expand-branch":
        if (state.selectedId) state.fullTree.expanded.add(state.selectedId);
        render();
        break;
      case "collapse-branch":
        if (state.selectedId) state.fullTree.expanded.delete(state.selectedId);
        render();
        break;
      case "minimap":
        el("minimap").hidden = !el("minimap").hidden;
        break;
      default:
        break;
    }
  });

  // Search interactions
  searchInput.addEventListener("input", handleSearchInput);
  searchInput.addEventListener("keydown", (e) => {
    const items = Array.from(searchResults.querySelectorAll(".result"));
    if (e.key === "ArrowDown") {
      e.preventDefault();
      searchActiveIndex = Math.min(items.length - 1, searchActiveIndex + 1);
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      searchActiveIndex = Math.max(0, searchActiveIndex - 1);
    }
    if (e.key === "Enter") {
      const selected = items[searchActiveIndex] || items[0];
      if (selected) selectSearchResult(selected.dataset.id);
    }
    items.forEach((item, idx) => item.classList.toggle("active", idx === searchActiveIndex));
  });

  // Settings interactions
  ["settingShowYears", "settingCompactCards", "settingShowGender", "settingReduceMotion", "settingDefaultView"].forEach(id => {
    el(id).addEventListener("change", () => {
      applySettings();
      render();
    });
  });

  // View toggle
  forestModeBtn.onclick = () => { setView("forest"); render(); requestAnimationFrame(() => fitToScreen()); };
  branchModeBtn.onclick = () => { setView("branch"); render(); requestAnimationFrame(() => fitToScreen()); };
  el("focusModeBtn").onclick = () => { setView("focus"); render(); };

  // Insights toggle
  el("insightsToggle").onclick = () => {
    const isOpen = insightsContent.style.display !== "none";
    insightsContent.style.display = isOpen ? "none" : "block";
    insights.classList.toggle("collapsed", isOpen);
    el("insightsToggle").setAttribute("aria-expanded", (!isOpen).toString());
  };

  // Depth controls
  depthControls.querySelectorAll(".btn").forEach(btn => {
    btn.onclick = () => {
      const depth = btn.dataset.depth;
      state.fullTree.depth = depth === "all" ? "all" : Number(depth);
      render();
      requestAnimationFrame(() => fitToScreen());
    };
  });

  // Keyboard shortcuts
  window.addEventListener("keydown", (e) => {
    if (e.key === "/") {
      e.preventDefault();
      searchInput.focus();
    }
    if (e.key === "Escape") {
      if (state.drawerOpen) closeDrawer();
      settingsModal.classList.remove("active");
      settingsModal.setAttribute("aria-hidden", "true");
      helpModal.classList.remove("active");
      helpModal.setAttribute("aria-hidden", "true");
    }
    if (e.key.toLowerCase() === "c") {
      centerOn(state.selectedId || state.rootId);
    }
  });

  // Load data
  fetch("data.json")
    .then(res => res.json())
    .then(initData)
    .catch(() => initData({ people: [] }));
})();

