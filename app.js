const state = {
  view: "focus",
  selectedId: null,
  rootId: null,
  focusExpand: { ancestors: 1, children: {}, showAllChildren: false },
  fullTree: { gen: 2, expanded: new Set(), branchOnly: false },
  searchIndex: [],
  pan: { x: 0, y: 0, zoom: 1 },
  drawerOpen: false,
};

const el = (id) => document.getElementById(id);
const focusView = el("focusView");
const fullTreeView = el("fullTreeView");
const searchInput = el("searchInput");
const searchResults = el("searchResults");
const treeStage = el("treeStage");
const fullTreeCanvas = el("fullTreeCanvas");
const drawer = el("detailDrawer");
const drawerContent = el("drawerContent");
const drawerTitle = el("drawerTitle");

let people = [];
let unions = [];
let peopleById = new Map();
let parentsMap = new Map();
let spousesMap = new Map();
let childrenMap = new Map();

function initData(data) {
  people = data.people || [];
  unions = data.unions || [];
  peopleById = new Map(people.map(p => [p.id, p]));
  buildRelations(unions);
  state.searchIndex = people.map(p => ({ id: p.id, name: (p.name || "").toLowerCase() }));
  state.rootId = data.selfId || data.rootId || (people[0] ? people[0].id : null);
  state.selectedId = state.rootId;
  updateStats();
  render();
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
    const p1 = union.partner1;
    const p2 = union.partner2;
    if (p1 && p2) {
      addToMap(spousesMap, p1, p2);
      addToMap(spousesMap, p2, p1);
    }
    (union.children || []).forEach(childId => {
      addToMap(parentsMap, childId, p1);
      addToMap(parentsMap, childId, p2);
      addToMap(childrenMap, p1, childId);
      addToMap(childrenMap, p2, childId);
    });
  });
}

function getParents(id) {
  return Array.from(parentsMap.get(id) || []);
}

function getSpouses(id) {
  return Array.from(spousesMap.get(id) || []);
}

function getChildren(id) {
  return Array.from(childrenMap.get(id) || []);
}

function updateStats() {
  el("statPeople").textContent = people.length;
  el("statFamilies").textContent = unions.length;
  const generations = estimateGenerations();
  el("statGenerations").textContent = generations;
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

function render() {
  if (!state.selectedId && state.view === "focus") {
    renderEmptyState();
    return;
  }
  if (state.view === "focus") {
    focusView.hidden = false;
    fullTreeView.hidden = true;
    renderFocus();
  } else {
    focusView.hidden = true;
    fullTreeView.hidden = false;
    renderFullTree();
  }
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
      <button class="btn" id="expandAncestors">${state.focusExpand.ancestors === 1 ? "Expand ancestors" : "Collapse ancestors"}</button>
    </div>
    <div class="focus-section" style="grid-column: 1; grid-row: 2;">
      <h3>Spouses</h3>
      <div class="focus-grid" id="spousesGrid"></div>
    </div>
    <div class="focus-center">
      <div id="centerCard"></div>
    </div>
    <div class="focus-section" style="grid-column: 3; grid-row: 2;">
      <h3>Actions</h3>
      <div class="focus-grid">
        <button class="btn" id="centerHere">Center here</button>
      </div>
    </div>
    <div class="focus-section" style="grid-column: 2; grid-row: 3;">
      <h3>Children</h3>
      <div class="focus-grid" id="childrenGrid"></div>
      ${remaining > 0 ? `<button class="btn" id="moreChildren">+${remaining} more</button>` : ""}
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

  el("expandAncestors").onclick = () => expandAncestors();
  const moreBtn = el("moreChildren");
  if (moreBtn) moreBtn.onclick = () => expandChildrenList();
  el("centerHere").onclick = () => centerOn(person.id);
  attachCardHandlers();
  attachBranchHandlers();
}

function renderFocusMobile(person, parents, spouses, visibleChildren, remaining) {
  const { html: childrenHtml } = renderChildBranches(visibleChildren, true);
  focusView.innerHTML = `
    <div class="focus-mobile">
      <div class="focus-center">${cardTemplate(person)}</div>
      ${renderAccordionSection("Parents", parents.map(cardTemplate).join(""), parents.length)}
      ${renderAccordionSection("Spouses", spouses.map(cardTemplate).join(""), spouses.length)}
      ${renderAccordionSection("Children", `${childrenHtml || `<div class=\"muted\">No children listed</div>`}${remaining > 0 ? `<button class=\"btn\" id=\"moreChildren\">+${remaining} more</button>` : ""}`, visibleChildren.length)}
    </div>
  `;
  const moreBtn = el("moreChildren");
  if (moreBtn) moreBtn.onclick = () => expandChildrenList();
  attachCardHandlers();
  attachBranchHandlers();
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

function renderChildBranches(children, compact = false) {
  const html = children.map(child => {
    const expanded = !!state.focusExpand.children[child.id];
    const grandkids = expanded ? getChildren(child.id).map(id => peopleById.get(id)).filter(Boolean) : [];
    const grandkidsHtml = expanded
      ? `<div class="subgrid">${grandkids.length ? grandkids.map(cardTemplate).join("") : `<div class=\"muted\">No children listed</div>`}</div>`
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

function attachBranchHandlers() {
  document.querySelectorAll("[data-expand-child]").forEach(btn => {
    btn.onclick = () => {
      const id = btn.getAttribute("data-expand-child");
      state.focusExpand.children[id] = !state.focusExpand.children[id];
      render();
    };
  });
}

function renderFullTree() {
  const root = peopleById.get(state.rootId);
  if (!root) return;
  treeStage.innerHTML = "";
  const tree = buildTreeNode(root.id, 1);
  treeStage.appendChild(tree);
  applyPanZoom();
  updateBreadcrumbs();
  attachCardHandlers();
}

function buildTreeNode(personId, depth) {
  const person = peopleById.get(personId);
  const node = document.createElement("div");
  node.className = "tree-level";
  node.dataset.personId = personId;
  node.innerHTML = cardTemplate(person, true);

  if (!person || depth > state.fullTree.gen) return node;

  const children = getChildren(personId).map(id => peopleById.get(id)).filter(Boolean);
  if (!children.length) return node;

  const branchOnly = state.fullTree.branchOnly && personId !== state.selectedId;
  const isExpanded = state.fullTree.expanded.has(personId) || depth < state.fullTree.gen;
  if (!isExpanded || branchOnly) return node;

  const childWrap = document.createElement("div");
  childWrap.className = "tree-children";
  children.forEach(child => {
    childWrap.appendChild(buildTreeNode(child.id, depth + 1));
  });
  node.appendChild(childWrap);
  return node;
}

function cardTemplate(person, compact = false) {
  if (!person) return "";
  const gender = inferGender(person);
  const genderClass = gender === "male" ? "gender-male" : gender === "female" ? "gender-female" : "gender-unknown";
  const years = formatYear(person.birth) || formatYear(person.death)
    ? `${formatYear(person.birth) || "?"}–${formatYear(person.death) || "?"}`
    : "";
  return `
    <div class="node-card" data-person-id="${person.id}">
      <div class="meta">
        <div class="name">${person.name}</div>
        ${years ? `<div class="years">${years}</div>` : ""}
      </div>
      <div class="gender ${genderClass}">${gender ? gender[0].toUpperCase() : "?"}</div>
    </div>
  `;
}

function inferGender(person) {
  if (person.gender) return person.gender;
  const name = (person.name || "").toLowerCase();
  if (/\bbinti\b/.test(name)) return "female";
  if (/\bbin\b/.test(name)) return "male";
  return "unknown";
}

function formatYear(value) {
  if (!value) return "";
  if (typeof value === "string" && value.length >= 4) return value.slice(0, 4);
  return "";
}

function attachCardHandlers() {
  document.querySelectorAll(".node-card").forEach(card => {
    card.onclick = () => {
      const id = card.dataset.personId;
      openDrawer(id);
    };
  });
}

function openDrawer(id) {
  const person = peopleById.get(id);
  if (!person) return;
  state.drawerOpen = true;
  drawer.classList.add("active");
  drawer.setAttribute("aria-hidden", "false");
  drawerTitle.textContent = person.name;
  drawerContent.innerHTML = `
    <div><strong>Relation:</strong> ${person.relation || "-"}</div>
    <div><strong>Note:</strong> ${person.note || "-"}</div>
    <div><strong>Birth:</strong> ${person.birth || "?"}</div>
    <div><strong>Death:</strong> ${person.death || "?"}</div>
    <div><strong>Parents:</strong> ${getParents(person.id).map(pid => peopleById.get(pid)?.name).filter(Boolean).join(", ") || "-"}</div>
    <div><strong>Spouses:</strong> ${getSpouses(person.id).map(pid => peopleById.get(pid)?.name).filter(Boolean).join(", ") || "-"}</div>
    <div><strong>Children:</strong> ${getChildren(person.id).map(pid => peopleById.get(pid)?.name).filter(Boolean).join(", ") || "-"}</div>
  `;
  el("drawerGoTo").onclick = () => {
    centerOn(id);
    closeDrawer();
  };
}

function closeDrawer() {
  state.drawerOpen = false;
  drawer.classList.remove("active");
  drawer.setAttribute("aria-hidden", "true");
}

function centerOn(id) {
  state.selectedId = id;
  state.rootId = id;
  render();
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
  const crumbs = getPathToRoot(state.selectedId || state.rootId).reverse();
  el("breadcrumbs").textContent = crumbs.map(p => p.name).join(" > ") || "";
}

function getPathToRoot(id) {
  const path = [];
  let current = peopleById.get(id);
  const visited = new Set();
  while (current && !visited.has(current.id)) {
    path.push(current);
    visited.add(current.id);
    const parentId = getParents(current.id)[0];
    current = parentId ? peopleById.get(parentId) : null;
  }
  return path;
}

function handleSearchInput() {
  const value = searchInput.value.trim().toLowerCase();
  if (!value) {
    searchResults.classList.remove("active");
    searchResults.innerHTML = "";
    return;
  }
  const matches = state.searchIndex.filter(p => p.name.includes(value)).slice(0, 8);
  searchResults.innerHTML = matches.map(m => {
    const person = peopleById.get(m.id);
    return `<div class="result" data-id="${m.id}">${person.name}</div>`;
  }).join("");
  searchResults.classList.add("active");
  searchResults.querySelectorAll(".result").forEach(item => {
    item.onclick = () => {
      const id = item.dataset.id;
      jumpToPerson(id);
      searchResults.classList.remove("active");
    };
  });
}

function jumpToPerson(id) {
  state.selectedId = id;
  state.rootId = id;
  render();
  highlightPath(id);
}

function highlightPath(id) {
  const path = getPathToRoot(id).map(p => p.id);
  document.querySelectorAll(".node-card").forEach(card => {
    const isPath = path.includes(card.dataset.personId);
    card.classList.toggle("highlight", isPath);
    card.classList.toggle("dim", !isPath);
  });
  setTimeout(() => {
    document.querySelectorAll(".node-card").forEach(card => card.classList.remove("dim"));
  }, 1200);
}

function applyPanZoom() {
  treeStage.style.transform = `translate(${state.pan.x}px, ${state.pan.y}px) scale(${state.pan.zoom})`;
}

let lastWheel = 0;
fullTreeCanvas.addEventListener("wheel", (e) => {
  if (state.view !== "full") return;
  e.preventDefault();
  const now = Date.now();
  if (now - lastWheel < 30) return; // throttle
  lastWheel = now;
  const delta = Math.sign(e.deltaY) * -0.1;
  state.pan.zoom = Math.min(2, Math.max(0.6, state.pan.zoom + delta));
  applyPanZoom();
}, { passive: false });

let isPanning = false;
let start = { x: 0, y: 0 };
fullTreeCanvas.addEventListener("mousedown", (e) => {
  if (state.view !== "full") return;
  isPanning = true;
  start = { x: e.clientX - state.pan.x, y: e.clientY - state.pan.y };
});
window.addEventListener("mousemove", (e) => {
  if (!isPanning) return;
  state.pan.x = e.clientX - start.x;
  state.pan.y = e.clientY - start.y;
  applyPanZoom();
});
window.addEventListener("mouseup", () => { isPanning = false; });

searchInput.addEventListener("input", handleSearchInput);
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const first = searchResults.querySelector(".result");
    if (first) jumpToPerson(first.dataset.id);
  }
});

el("focusModeBtn").onclick = () => {
  state.view = "focus";
  el("focusModeBtn").classList.add("active");
  el("fullTreeBtn").classList.remove("active");
  render();
};

el("fullTreeBtn").onclick = () => {
  state.view = "full";
  el("fullTreeBtn").classList.add("active");
  el("focusModeBtn").classList.remove("active");
  render();
};

el("centerBtn").onclick = () => centerOn(state.selectedId);
el("resetBtn").onclick = () => {
  state.pan = { x: 0, y: 0, zoom: 1 };
  applyPanZoom();
};

el("drawerClose").onclick = closeDrawer;

el("insightsToggle").onclick = () => {
  const content = el("insightsContent");
  const isOpen = content.style.display !== "none";
  content.style.display = isOpen ? "none" : "block";
  el("insightsToggle").setAttribute("aria-expanded", (!isOpen).toString());
};

el("minimapToggle").onclick = () => {
  const minimap = el("minimap");
  minimap.hidden = !minimap.hidden;
};

el("expandBranchBtn").onclick = () => {
  state.fullTree.expanded.add(state.selectedId);
  render();
};

el("collapseBranchBtn").onclick = () => {
  state.fullTree.expanded.delete(state.selectedId);
  render();
};

fullTreeView.querySelectorAll(".generation-controls .btn").forEach(btn => {
  btn.onclick = () => {
    const gen = btn.dataset.gen;
    if (gen === "branch") {
      state.fullTree.branchOnly = true;
    } else {
      state.fullTree.branchOnly = false;
      state.fullTree.gen = Number(gen);
    }
    render();
  };
});

window.addEventListener("keydown", (e) => {
  if (e.key === "/") {
    e.preventDefault();
    searchInput.focus();
  }
  if (e.key === "Escape" && state.drawerOpen) {
    closeDrawer();
  }
  if (e.key.toLowerCase() === "c") {
    centerOn(state.selectedId || state.rootId);
  }
});

fetch("data.json")
  .then(res => res.json())
  .then(initData)
  .catch(() => initData({ people: [] }));
